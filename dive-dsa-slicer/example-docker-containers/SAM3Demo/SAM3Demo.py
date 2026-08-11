"""
SAM 3.1 text-prompt segmentation task for DIVE.

Segments all instances matching a text prompt on a video frame and optionally
propagates masks forward through subsequent frames using the SAM 3.1 Object
Multiplex video predictor. Creates one track per instance and uploads
masks/annotations to Girder.

Requires CUDA (SAM 3.1 multiplex inference).
"""
import gc
import importlib.util
import json
import logging
import os
import pprint
import tempfile
from contextlib import nullcontext
from pathlib import Path
from typing import Dict, List, Optional

import cv2
import girder_client
import numpy as np
import torch
from pycocotools import mask as mask_utils

try:
    from ctk_cli import CLIArgumentParser  # noqa: I004
    from slicer_cli_web import ctk_cli_adjustment  # noqa
except ImportError:  # pragma: no cover
    # Allows importing this module outside the slicer runtime (useful for local sanity tests).
    CLIArgumentParser = None  # type: ignore[assignment]
    ctk_cli_adjustment = None  # type: ignore[assignment]

logging.basicConfig(level=logging.CRITICAL)

# Reduce CUDA fragmentation on long propagation runs (safe no-op if unsupported).
os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')

_EXAMPLE_ROOT = Path(__file__).resolve().parent.parent


def _patch_sam3_offload_state_to_cpu_kwarg() -> None:
    """
    Compatibility patch for SAM 3.1 predictor/model init_state mismatch.

    Some SAM3 releases/pins call `init_state(offload_state_to_cpu=...)`, while
    `Sam3MultiplexTrackingWithInteractivity.init_state` may not accept that kwarg.
    We ignore it to avoid a hard TypeError during `start_session`.
    """

    try:
        import inspect
        from sam3.model.sam3_multiplex_tracking import (
            Sam3MultiplexTrackingWithInteractivity,
        )
    except Exception:
        # If sam3 isn't installed or module paths differ, just skip.
        return

    try:
        if "offload_state_to_cpu" in inspect.signature(
            Sam3MultiplexTrackingWithInteractivity.init_state
        ).parameters:
            return
    except Exception:
        # If we can't inspect the signature, still apply the safe wrapper.
        pass

    orig_init_state = Sam3MultiplexTrackingWithInteractivity.init_state

    def wrapped_init_state(self, *args, **kwargs):
        kwargs.pop("offload_state_to_cpu", None)
        return orig_init_state(self, *args, **kwargs)

    Sam3MultiplexTrackingWithInteractivity.init_state = wrapped_init_state


def _patch_sam3_multiplex_checkpoint_preload() -> None:
    """
    SAM 3.1 HF checkpoints use `detector.*` and `tracker.model.*` keys for the
    combined demo model. `build_sam3_multiplex_video_predictor` also builds a
    tracker-only sub-model and incorrectly preloads the same checkpoint there,
    which produces thousands of missing/unexpected key warnings and leaves
    weights uninitialized. Skip that preload; load once into the full model.
    """

    try:
        import sam3.model_builder as model_builder
    except Exception:
        return

    if getattr(model_builder, '_sam3demo_skip_tracker_preload', False):
        return

    original_build_tracker = model_builder.build_sam3_multiplex_video_model

    def build_tracker_without_checkpoint_preload(
        checkpoint_path=None,
        load_from_HF=True,
        **kwargs,
    ):
        return original_build_tracker(
            checkpoint_path=None,
            load_from_HF=False,
            **kwargs,
        )

    model_builder.build_sam3_multiplex_video_model = build_tracker_without_checkpoint_preload
    model_builder._sam3demo_skip_tracker_preload = True


def _patch_sam3_functional_attention_sdpa() -> None:
    """
    On pre-Ampere GPUs, sam3's functional_attention forces FLASH_ATTENTION SDPA only
    when use_fa3=False, which raises "No available kernel". Use MATH/efficient SDPA.
    """

    try:
        import sam3.model.decoder as decoder_mod
        import torch.nn.functional as torchF
        from sam3.sam.rope import apply_rotary_enc, apply_rotary_enc_real
        from torch import Tensor
        from torch.nn.attention import sdpa_kernel, SDPBackend
    except Exception:
        return

    if getattr(decoder_mod, '_sam3demo_sdpa_patched', False):
        return

    def functional_attention(
        q: Tensor,
        k: Tensor,
        v: Tensor,
        *,
        dropout: float,
        num_heads: int,
        num_k_exclude_rope: int = 0,
        freqs_cis: Optional[Tensor] = None,
        freqs_cis_real: Optional[Tensor] = None,
        freqs_cis_imag: Optional[Tensor] = None,
        use_fa3: bool = False,
        use_rope_real: bool = False,
        rope_k_repeat: bool,
    ):
        b, n, cq = q.shape
        _, m, ck = k.shape
        _, _, cv = v.shape
        if b > 1:
            assert k.shape[0] == v.shape[0] == b
        else:
            assert k.shape[0] == b == 1, f'{q.shape=} {k.shape=} {v.shape=}'
        assert v.shape[1] == m

        q = q.reshape(b, n, num_heads, cq // num_heads).transpose(1, 2)
        k = k.reshape(b, m, num_heads, ck // num_heads).transpose(1, 2)
        v = v.reshape(v.shape[0], m, num_heads, cv // num_heads).transpose(1, 2)

        if freqs_cis is not None:
            num_k_rope = k.size(-2) - num_k_exclude_rope
            if use_rope_real:
                q, k[:, :, :num_k_rope] = apply_rotary_enc_real(
                    q,
                    k[:, :, :num_k_rope],
                    freqs_cis_real=freqs_cis_real,
                    freqs_cis_imag=freqs_cis_imag,
                    repeat_freqs_k=rope_k_repeat,
                )
            else:
                q, k[:, :, :num_k_rope] = apply_rotary_enc(
                    q,
                    k[:, :, :num_k_rope],
                    freqs_cis,
                    repeat_freqs_k=rope_k_repeat,
                )

        if use_fa3 and _cuda_supports_flash_attention_3():
            from sam3.perflib.fa3 import flash_attn_func

            assert dropout == 0.0
            out = flash_attn_func(
                q.transpose(1, 2), k.transpose(1, 2), v.transpose(1, 2)
            )
        elif _cuda_supports_flash_attention_3():
            with sdpa_kernel(SDPBackend.FLASH_ATTENTION):
                out = torchF.scaled_dot_product_attention(
                    q, k, v, dropout_p=dropout
                )
        else:
            with sdpa_kernel(
                [SDPBackend.MATH, SDPBackend.EFFICIENT_ATTENTION]
            ):
                out = torchF.scaled_dot_product_attention(
                    q, k, v, dropout_p=dropout
                )
        out = out.transpose(1, 2)
        out = out.reshape(b, n, cv)
        return out

    decoder_mod.functional_attention = functional_attention
    decoder_mod._sam3demo_sdpa_patched = True


def _configure_pytorch_sdpa_for_gpu() -> None:
    """Prefer math/mem-efficient attention on GPUs without Flash Attention."""
    if not torch.cuda.is_available() or _cuda_supports_flash_attention_3():
        return
    torch.backends.cuda.enable_math_sdp(True)
    torch.backends.cuda.enable_mem_efficient_sdp(True)
    try:
        torch.backends.cuda.enable_flash_sdp(False)
    except Exception:
        pass


def _cuda_inference_context():
    """bf16 autocast on Ampere+; fp32 inference on older GPUs for SDPA compatibility."""
    if _cuda_supports_flash_attention_3():
        return torch.autocast(device_type='cuda', dtype=torch.bfloat16)
    return nullcontext()


def _prepare_sam31_multiplex_checkpoint(checkpoint_path: Path) -> dict:
    """Load a SAM 3.1 multiplex checkpoint and apply OSS key remaps when needed."""
    ckpt = torch.load(checkpoint_path, map_location='cpu', weights_only=True)
    if isinstance(ckpt, dict) and isinstance(ckpt.get('model'), dict):
        ckpt = ckpt['model']

    if not isinstance(ckpt, dict):
        raise RuntimeError(f'Unexpected checkpoint format in {checkpoint_path}')

    needs_remap = any(
        key.startswith('sam3_model.') or key.startswith('sam2_predictor.')
        for key in ckpt
    )
    if not needs_remap:
        return ckpt

    remapped: dict = {}
    for key, value in ckpt.items():
        new_key = key
        if key.startswith('sam3_model.'):
            new_key = 'detector.' + key[len('sam3_model.') :]
        elif key.startswith('sam2_predictor.'):
            new_key = 'tracker.' + key[len('sam2_predictor.') :]
        remapped[new_key] = value
    return remapped


def _load_sam2_helpers():
    """Reuse frame extraction and mask upload helpers from SAM2Demo."""
    module_path = _EXAMPLE_ROOT / 'SAM2Demo' / 'SAM2Demo.py'
    spec = importlib.util.spec_from_file_location('sam2_demo_helpers', module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.process_masks_folder, module.extract_frames


try:
    process_masks_folder, extract_frames = _load_sam2_helpers()
except Exception:
    # Allows local import for sanity tests without full slicer dependencies (e.g. hydra).
    process_masks_folder = None
    extract_frames = None


def resolve_device() -> str:
    """Pick cuda, mps, or cpu based on what PyTorch can use."""
    if torch.cuda.is_available():
        return 'cuda'
    if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return 'mps'
    return 'cpu'


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ('1', 'true', 'yes', 'on')


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return max(minimum, int(raw))
    except ValueError:
        return default


def _cuda_supports_flash_attention_3() -> bool:
    if not torch.cuda.is_available():
        return False
    try:
        major, _minor = torch.cuda.get_device_capability()
        return major >= 8
    except Exception:
        return False


def _gpu_total_gib() -> Optional[float]:
    if not torch.cuda.is_available():
        return None
    try:
        return torch.cuda.get_device_properties(0).total_memory / (1024**3)
    except Exception:
        return None


def sam3_memory_settings(tracking_frames: int) -> dict:
    """
    Runtime memory knobs (override via environment variables).

    SAM3_MAX_NUM_OBJECTS: cap parallel object slots.
    SAM3_GROUNDING_BATCH_SIZE / SAM3_POSTPROCESS_BATCH_SIZE: detector batching (defaults are lower on <=20 GiB GPUs).
    SAM3_PROPAGATION_CHUNK_SIZE: propagate N frames per stream call, then empty CUDA cache (0 = one shot).
    SAM3_OFFLOAD_VIDEO_TO_CPU: keep decoded frames on CPU.
    SAM3_USE_FA3: Flash Attention 3 when the GPU supports it (Ampere+).
    """
    gpu_gib = _gpu_total_gib()
    conservative = gpu_gib is not None and gpu_gib <= 20.0

    if conservative:
        default_max_objects = 4
        default_grounding_batch = 2
        default_postprocess_batch = 2
        default_prop_chunk = 3 if tracking_frames > 1 else 0
    else:
        default_max_objects = 8 if tracking_frames <= 1 else 12
        default_grounding_batch = 4 if tracking_frames > 1 else 8
        default_postprocess_batch = 4 if tracking_frames > 1 else 8
        default_prop_chunk = 0

    max_num_objects = _env_int('SAM3_MAX_NUM_OBJECTS', default_max_objects, minimum=1)
    grounding_batch_size = _env_int(
        'SAM3_GROUNDING_BATCH_SIZE', default_grounding_batch, minimum=1
    )
    postprocess_batch_size = _env_int(
        'SAM3_POSTPROCESS_BATCH_SIZE', default_postprocess_batch, minimum=1
    )
    propagation_chunk_size = _env_int(
        'SAM3_PROPAGATION_CHUNK_SIZE', default_prop_chunk, minimum=0
    )
    offload_video = _env_bool('SAM3_OFFLOAD_VIDEO_TO_CPU', default=True)
    use_fa3 = _env_bool('SAM3_USE_FA3', default=_cuda_supports_flash_attention_3())
    return {
        'max_num_objects': max_num_objects,
        'grounding_batch_size': grounding_batch_size,
        'postprocess_batch_size': postprocess_batch_size,
        'propagation_chunk_size': propagation_chunk_size,
        'offload_video_to_cpu': offload_video,
        'use_fa3': use_fa3,
        'gpu_gib': gpu_gib,
    }


def tune_multiplex_predictor_memory(predictor, mem: dict) -> None:
    """Lower peak VRAM on the built multiplex model (sam3 defaults batch size to 16)."""
    model = getattr(predictor, 'model', None)
    if model is None:
        return
    model.max_num_objects = mem['max_num_objects']
    model.batched_grounding_batch_size = mem['grounding_batch_size']
    model.postprocess_batch_size = mem['postprocess_batch_size']
    if mem['grounding_batch_size'] <= 1:
        model.use_batched_grounding = False


def allocate_track_ids(existing_tracks: list, count: int) -> List[str]:
    """Return `count` new numeric track ids above the current maximum."""
    numeric_ids = []
    for track in existing_tracks:
        try:
            numeric_ids.append(int(track['id']))
        except (TypeError, ValueError):
            continue
    next_id = max(numeric_ids, default=-1) + 1
    return [str(next_id + offset) for offset in range(count)]


def save_and_record_mask(
    mask_bin: np.ndarray,
    output_dir: Path,
    obj_id: str,
    frame_idx: int,
    track_type: str,
    rle_masks: dict,
    track_data: dict,
) -> None:
    """Save a binary mask as PNG and append DIVE track/RLE metadata."""
    obj_dir = output_dir / str(obj_id)
    obj_dir.mkdir(parents=True, exist_ok=True)
    path = obj_dir / f'{frame_idx}.png'

    mask_bin = mask_bin.astype(np.uint8).squeeze()
    alpha = mask_bin * 255
    h, w = mask_bin.shape[-2:]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0:3] = 255
    rgba[..., 3] = alpha
    cv2.imwrite(str(path), rgba)

    rle = mask_utils.encode(np.asfortranarray(mask_bin))
    if isinstance(rle['counts'], bytes):
        rle['counts'] = rle['counts'].decode('utf-8')

    rle_masks.setdefault(str(obj_id), {})[str(frame_idx)] = {
        'rle': {'size': list(mask_bin.shape), 'counts': rle['counts']},
    }

    track = track_data['tracks'].setdefault(
        str(obj_id),
        {
            'id': str(obj_id),
            'begin': frame_idx,
            'end': frame_idx,
            'confidencePairs': [[track_type, 1.0]],
            'features': [],
            'group': None,
            'attributes': {},
            'hasMask': True,
            'interpolate': False,
        },
    )

    y_indices, x_indices = np.where(mask_bin > 0)
    if x_indices.size and y_indices.size:
        bounds = [
            int(x_indices.min()),
            int(y_indices.min()),
            int(x_indices.max()),
            int(y_indices.max()),
        ]
    else:
        bounds = [0, 0, 0, 0]

    track['features'].append(
        {
            'frame': frame_idx,
            'flick': frame_idx * 100000,
            'bounds': bounds,
            'attributes': {},
            'hasMask': True,
            'interpolate': False,
            'keyframe': True,
        }
    )
    track['begin'] = min(track['begin'], frame_idx)
    track['end'] = max(track['end'], frame_idx)


def _masks_from_outputs(outputs: dict) -> Dict[int, np.ndarray]:
    """Parse SAM3 video predictor outputs into {obj_id: binary_mask}."""
    obj_ids = outputs.get('out_obj_ids', [])
    binary_masks = outputs.get('out_binary_masks')
    if binary_masks is None:
        return {}

    if isinstance(obj_ids, torch.Tensor):
        obj_ids = obj_ids.cpu().numpy()
    if isinstance(binary_masks, torch.Tensor):
        binary_masks = binary_masks.cpu().numpy()

    masks: Dict[int, np.ndarray] = {}
    for index, oid in enumerate(obj_ids):
        mask = binary_masks[index]
        if mask.ndim == 3:
            mask = mask[0]
        masks[int(oid)] = mask.astype(np.uint8)
    return masks


def _consume_propagation_stream(
    predictor,
    stream_request: dict,
) -> Dict[int, Dict[int, np.ndarray]]:
    mask_dict: Dict[int, Dict[int, np.ndarray]] = {}
    for response in predictor.handle_stream_request(stream_request):
        frame_idx = response.get('frame_index')
        if frame_idx is None:
            continue
        outputs = response.get('outputs', {})
        masks = _masks_from_outputs(outputs)
        if masks:
            mask_dict[int(frame_idx)] = masks
    return mask_dict


def collect_video_propagation(
    predictor,
    session_id: str,
    *,
    start_frame_index: int = 0,
    max_frame_num_to_track: int,
    confidence: float,
    propagation_chunk_size: int = 0,
) -> Dict[int, Dict[int, np.ndarray]]:
    """
    Propagate a text prompt forward through a frame directory session.

    When propagation_chunk_size > 0, propagation is split into smaller stream
    calls with torch.cuda.empty_cache() between chunks to reduce peak VRAM.

    Returns:
        Mapping of clip-relative frame index -> {sam3_obj_id: mask}.
    """
    mask_dict: Dict[int, Dict[int, np.ndarray]] = {}
    end_limit = start_frame_index + max_frame_num_to_track

    if propagation_chunk_size <= 0:
        stream_request = {
            'type': 'propagate_in_video',
            'session_id': session_id,
            'propagation_direction': 'forward',
            'start_frame_index': start_frame_index,
            'max_frame_num_to_track': max_frame_num_to_track,
            'output_prob_thresh': confidence,
        }
        mask_dict.update(_consume_propagation_stream(predictor, stream_request))
    else:
        current = start_frame_index
        while current <= end_limit:
            frames_left = end_limit - current + 1
            chunk_frames = min(propagation_chunk_size, frames_left)
            stream_request = {
                'type': 'propagate_in_video',
                'session_id': session_id,
                'propagation_direction': 'forward',
                'start_frame_index': current,
                'max_frame_num_to_track': chunk_frames - 1,
                'output_prob_thresh': confidence,
            }
            print(
                f'Propagating frames {current}–{current + chunk_frames - 1} '
                f'(chunk size {chunk_frames})...'
            )
            mask_dict.update(_consume_propagation_stream(predictor, stream_request))
            current += chunk_frames
            if torch.cuda.is_available():
                torch.cuda.synchronize()
                torch.cuda.empty_cache()

    if torch.cuda.is_available():
        torch.cuda.synchronize()
    return mask_dict


def run_sam3_text_inference(
    frame_dir: Path,
    prompt_frame_index: int,
    text_prompt: str,
    tracking_frames: int,
    confidence: float,
    checkpoint_path: Optional[Path],
) -> Dict[int, Dict[int, np.ndarray]]:
    """Run SAM 3.1 text prompt on a frame clip; propagate when tracking_frames > 1."""
    _configure_pytorch_sdpa_for_gpu()
    _patch_sam3_offload_state_to_cpu_kwarg()
    _patch_sam3_multiplex_checkpoint_preload()
    _patch_sam3_functional_attention_sdpa()
    from sam3.model_builder import build_sam3_multiplex_video_predictor

    mem = sam3_memory_settings(tracking_frames)
    ckpt = str(checkpoint_path) if checkpoint_path else None
    print(
        f'Loading SAM 3.1 multiplex predictor with checkpoint: {ckpt or "HF Hub (facebook/sam3.1)"}.'
    )
    gpu_note = f', gpu={mem["gpu_gib"]:.1f}GiB' if mem.get('gpu_gib') else ''
    print(
        'SAM 3.1 memory settings: '
        f'max_num_objects={mem["max_num_objects"]}, '
        f'grounding_batch_size={mem["grounding_batch_size"]}, '
        f'postprocess_batch_size={mem["postprocess_batch_size"]}, '
        f'propagation_chunk_size={mem["propagation_chunk_size"]}, '
        f'offload_video_to_cpu={mem["offload_video_to_cpu"]}, '
        f'use_fa3={mem["use_fa3"]}'
        f'{gpu_note}'
    )
    predictor = build_sam3_multiplex_video_predictor(
        checkpoint_path=ckpt,
        bpe_path=resolve_bpe_path(),
        max_num_objects=mem['max_num_objects'],
        use_fa3=mem['use_fa3'],
        use_rope_real=mem['use_fa3'],
        async_loading_frames=False,
        default_output_prob_thresh=confidence,
    )
    tune_multiplex_predictor_memory(predictor, mem)

    mask_dict: Dict[int, Dict[int, np.ndarray]] = {}
    session_id = None
    try:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        with _cuda_inference_context():
            response = predictor.handle_request(
                {
                    'type': 'start_session',
                    'resource_path': str(frame_dir),
                    'offload_video_to_cpu': mem['offload_video_to_cpu'],
                }
            )
            session_id = response['session_id']

            prompt_response = predictor.handle_request(
                {
                    'type': 'add_prompt',
                    'session_id': session_id,
                    'frame_index': prompt_frame_index,
                    'text': text_prompt,
                    'output_prob_thresh': confidence,
                }
            )
            prompt_masks = _masks_from_outputs(prompt_response.get('outputs', {}))
            if prompt_masks:
                mask_dict[prompt_frame_index] = prompt_masks

            if tracking_frames > 1:
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                propagated = collect_video_propagation(
                    predictor,
                    session_id,
                    start_frame_index=prompt_frame_index,
                    max_frame_num_to_track=tracking_frames - 1,
                    confidence=confidence,
                    propagation_chunk_size=mem['propagation_chunk_size'],
                )
                mask_dict.update(propagated)
    finally:
        if session_id is not None:
            try:
                predictor.handle_request(
                    {
                        'type': 'close_session',
                        'session_id': session_id,
                        'run_gc_collect': True,
                    }
                )
            except Exception:
                pass
        del predictor
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    return mask_dict


def map_sam3_obj_ids_to_track_ids(
    mask_dict: Dict[int, Dict[int, np.ndarray]],
    existing_tracks: list,
) -> Dict[int, str]:
    """Assign stable DIVE track ids for each SAM3 object id seen in propagation."""
    sam3_obj_ids = sorted(
        {obj_id for frame_masks in mask_dict.values() for obj_id in frame_masks}
    )
    if not sam3_obj_ids:
        raise RuntimeError(
            'No instances matched text prompt with confidence >= threshold during propagation.'
        )
    track_ids = allocate_track_ids(existing_tracks, len(sam3_obj_ids))
    return {obj_id: track_id for obj_id, track_id in zip(sam3_obj_ids, track_ids)}


def build_video_annotation_output(
    mask_dict: Dict[int, Dict[int, np.ndarray]],
    obj_id_to_track_id: Dict[int, str],
    start_frame: int,
    track_type: str,
    working_directory: Path,
) -> Path:
    """Convert propagated SAM3 masks into DIVE mask/track artifacts."""
    output_dir = working_directory / 'output/masks'
    output_dir.mkdir(parents=True, exist_ok=True)
    rle_masks: dict = {}
    track_data = {'tracks': {}, 'groups': {}, 'version': 2}

    for rel_frame_idx in sorted(mask_dict):
        absolute_frame = start_frame + rel_frame_idx
        for obj_id, mask_bin in mask_dict[rel_frame_idx].items():
            track_id = obj_id_to_track_id[obj_id]
            save_and_record_mask(
                mask_bin,
                output_dir,
                track_id,
                absolute_frame,
                track_type,
                rle_masks,
                track_data,
            )

    with open(output_dir / 'RLE_MASKS.json', 'w') as f:
        json.dump(rle_masks, f, indent=2)
    with open(output_dir / 'TrackJSON.json', 'w') as f:
        json.dump(track_data, f, indent=2)

    return output_dir


def resolve_checkpoint_path() -> Optional[Path]:
    """Optional local checkpoint from env or baked-in model directory."""
    env_path = os.environ.get('SAM3_CHECKPOINT')
    if env_path and Path(env_path).exists():
        return Path(env_path)
    default = Path('/opt/SAM3/models/sam3.1_multiplex.pt')
    if default.exists():
        return default
    return None


def resolve_bpe_path() -> str:
    """
    Path to the SAM3 BPE tokenizer vocab.

    The PyPI package does not ship this file and defaults to a broken path under
    site-packages/assets/. The Docker image prefetches it to /opt/SAM3/assets.
    """
    bpe_name = 'bpe_simple_vocab_16e6.txt.gz'
    candidates: List[Path] = []

    env_path = os.environ.get('SAM3_BPE_PATH')
    if env_path:
        candidates.append(Path(env_path))

    candidates.append(Path('/opt/SAM3/assets') / bpe_name)

    try:
        import sam3

        candidates.append(Path(sam3.__file__).resolve().parent / 'assets' / bpe_name)
    except ImportError:
        pass

    for path in candidates:
        if path.is_file():
            return str(path)

    searched = ', '.join(str(path) for path in candidates)
    raise FileNotFoundError(
        f'SAM3 BPE vocab ({bpe_name}) not found. Checked: {searched}. '
        'Rebuild the Docker image (download_sam3_ckpts.sh) or set SAM3_BPE_PATH.'
    )


def process_input_args(args, gc: girder_client.GirderClient) -> None:
    text_prompt = (args.TextPrompt or '').strip()
    if not text_prompt:
        raise ValueError('TextPrompt is required.')

    dataset_id = args.DIVEDirectory.split('/')[-2]
    start_frame = int(args.DIVEFrameId)
    track_type = args.DIVETrackType
    confidence = float(args.ConfidenceThreshold)
    tracking_frames = max(1, int(args.TrackingFrames))
    device = resolve_device()
    print(f'Using inference device: {device}')

    with tempfile.TemporaryDirectory() as working_directory:
        working_dir_path = Path(working_directory)
        existing_tracks = gc.get('dive_annotation/track', {'folderId': dataset_id})
        checkpoint_path = resolve_checkpoint_path()

        if process_masks_folder is None or extract_frames is None:
            raise RuntimeError(
                'SAM2 helper functions are unavailable. This should only happen outside the slicer container environment.'
            )

        if device != 'cuda':
            raise RuntimeError(
                'SAM 3.1 requires CUDA. Run on a GPU host with a compatible NVIDIA driver.'
            )

        frame_dir = extract_frames(
            args.DIVEVideo,
            start_frame,
            tracking_frames,
            working_dir_path,
        )
        action = (
            f'Propagating text prompt from frame {start_frame} '
            f'for {tracking_frames} frame(s)...'
            if tracking_frames > 1
            else f'Running text segmentation on frame {start_frame}...'
        )
        print(action)
        mask_dict = run_sam3_text_inference(
            frame_dir,
            prompt_frame_index=0,
            text_prompt=text_prompt,
            tracking_frames=tracking_frames,
            confidence=confidence,
            checkpoint_path=checkpoint_path,
        )
        obj_id_to_track_id = map_sam3_obj_ids_to_track_ids(mask_dict, existing_tracks)
        print(
            f'Processed {len(mask_dict)} frame(s); track mapping: {obj_id_to_track_id}'
        )
        output_dir = build_video_annotation_output(
            mask_dict,
            obj_id_to_track_id,
            start_frame,
            track_type,
            working_dir_path,
        )

        process_masks_folder(
            gc,
            dataset_id,
            output_dir,
            'masks',
            'merge',
        )


def main(args) -> None:
    gc = girder_client.GirderClient(apiUrl=args.girderApiUrl)
    gc.setToken(args.girderToken)
    print('\n>> CLI Parameters ...\n')
    pprint.pprint(vars(args))
    process_input_args(args, gc)


if __name__ == '__main__':
    if CLIArgumentParser is None:
        raise RuntimeError(
            'CLIArgumentParser is unavailable. This script is intended to run in the slicer container environment.'
        )
    main(CLIArgumentParser().parse_args())
