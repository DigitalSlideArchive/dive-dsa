"""
SAM3 text-prompt segmentation task for DIVE.

Segments all instances matching a text prompt on a video frame and optionally
propagates masks forward through subsequent frames. Creates one track per
instance and uploads masks/annotations to Girder.

Uses GPU (CUDA) for video propagation when available; single-frame inference
also runs on CPU.
"""
import importlib.util
import json
import logging
import os
import pprint
import subprocess
import tempfile
from contextlib import nullcontext
from pathlib import Path
from typing import Dict, List, Optional, Union

import cv2
import girder_client
import numpy as np
import torch
from PIL import Image
from pycocotools import mask as mask_utils

from ctk_cli import CLIArgumentParser  # noqa: I004
from slicer_cli_web import ctk_cli_adjustment  # noqa

logging.basicConfig(level=logging.CRITICAL)

_EXAMPLE_ROOT = Path(__file__).resolve().parent.parent


def _load_sam2_helpers():
    """Reuse frame extraction and mask upload helpers from SAM2Demo."""
    module_path = _EXAMPLE_ROOT / 'SAM2Demo' / 'SAM2Demo.py'
    spec = importlib.util.spec_from_file_location('sam2_demo_helpers', module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.process_masks_folder, module.extract_frames


process_masks_folder, extract_frames = _load_sam2_helpers()


def resolve_device() -> str:
    """Pick cuda, mps, or cpu based on what PyTorch can use."""
    if torch.cuda.is_available():
        return 'cuda'
    if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
        return 'mps'
    return 'cpu'


def model_device_string(device: str) -> str:
    """SAM3 builders only accept cuda or cpu device strings."""
    if device == 'mps':
        print('MPS detected but SAM3 uses CPU for this device string; continuing on CPU.')
        return 'cpu'
    if device in ('cuda', 'cpu'):
        return device
    return 'cpu'


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


def run_sam3_text_inference(
    image_path: Path,
    text_prompt: str,
    confidence: float,
    device: str,
    checkpoint_path: Optional[Path],
) -> dict:
    """Run SAM3 image inference with a text prompt on a single frame."""
    from sam3.model_builder import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor

    load_from_hf = checkpoint_path is None
    ckpt = str(checkpoint_path) if checkpoint_path else None
    model_device = model_device_string(device)
    print(f'Loading SAM3 image model on {model_device} with checkpoint: {ckpt or "HF Hub"}.')

    model = build_sam3_image_model(
        device=model_device,
        checkpoint_path=ckpt,
        load_from_HF=load_from_hf,
        bpe_path=resolve_bpe_path(),
    )
    processor = Sam3Processor(
        model,
        device=model_device,
        confidence_threshold=confidence,
    )

    image = Image.open(image_path).convert('RGB')
    state = processor.set_image(image)
    return processor.set_text_prompt(prompt=text_prompt, state=state)


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


def collect_video_propagation(
    predictor,
    session_id: str,
    *,
    start_frame_index: int = 0,
    max_frame_num_to_track: int,
    confidence: float,
) -> Dict[int, Dict[int, np.ndarray]]:
    """
    Propagate a text prompt forward through a frame directory session.

    Returns:
        Mapping of clip-relative frame index -> {sam3_obj_id: mask}.
    """
    mask_dict: Dict[int, Dict[int, np.ndarray]] = {}
    stream_request = {
        'type': 'propagate_in_video',
        'session_id': session_id,
        'propagation_direction': 'forward',
        'start_frame_index': start_frame_index,
        'max_frame_num_to_track': max_frame_num_to_track,
        'output_prob_thresh': confidence,
    }
    for response in predictor.handle_stream_request(stream_request):
        frame_idx = response.get('frame_index')
        if frame_idx is None:
            continue
        outputs = response.get('outputs', {})
        masks = _masks_from_outputs(outputs)
        if masks:
            mask_dict[int(frame_idx)] = masks

    if torch.cuda.is_available():
        torch.cuda.synchronize()
    return mask_dict


def run_sam3_video_text_inference(
    frame_dir: Path,
    prompt_frame_index: int,
    text_prompt: str,
    tracking_frames: int,
    confidence: float,
    checkpoint_path: Optional[Path],
) -> Dict[int, Dict[int, np.ndarray]]:
    """Run SAM3 video text prompt + forward propagation on an extracted frame clip."""
    from sam3.model_builder import build_sam3_video_predictor

    ckpt = str(checkpoint_path) if checkpoint_path else None
    predictor = build_sam3_video_predictor(
        checkpoint_path=ckpt,
        bpe_path=resolve_bpe_path(),
        async_loading_frames=False,
    )

    autocast_ctx = (
        torch.autocast(device_type='cuda', dtype=torch.bfloat16)
        if torch.cuda.is_available()
        else nullcontext()
    )

    session_id = None
    try:
        with autocast_ctx:
            response = predictor.handle_request(
                {
                    'type': 'start_session',
                    'resource_path': str(frame_dir),
                }
            )
            session_id = response['session_id']

            predictor.handle_request(
                {
                    'type': 'add_prompt',
                    'session_id': session_id,
                    'frame_index': prompt_frame_index,
                    'text': text_prompt,
                    'output_prob_thresh': confidence,
                }
            )

            mask_dict = collect_video_propagation(
                predictor,
                session_id,
                start_frame_index=prompt_frame_index,
                max_frame_num_to_track=tracking_frames,
                confidence=confidence,
            )
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


def build_single_frame_annotation_output(
    state: dict,
    track_ids: List[str],
    frame_idx: int,
    track_type: str,
    working_directory: Path,
) -> Path:
    """Convert SAM3 image processor state into DIVE mask/track artifacts."""
    masks = state.get('masks')
    if masks is None or len(masks) == 0:
        raise RuntimeError(
            'No instances matched text prompt with confidence >= threshold. '
            f'Found {0 if masks is None else len(masks)} mask(s).'
        )

    if len(track_ids) < len(masks):
        raise RuntimeError('Not enough track ids allocated for detected instances.')

    output_dir = working_directory / 'output/masks'
    output_dir.mkdir(parents=True, exist_ok=True)
    rle_masks: dict = {}
    track_data = {'tracks': {}, 'groups': {}, 'version': 2}

    for index, track_id in enumerate(track_ids[: len(masks)]):
        mask_tensor = masks[index]
        mask_bin = mask_tensor.detach().cpu().numpy().astype(np.uint8)
        save_and_record_mask(
            mask_bin,
            output_dir,
            track_id,
            frame_idx,
            track_type,
            rle_masks,
            track_data,
        )

    with open(output_dir / 'RLE_MASKS.json', 'w') as f:
        json.dump(rle_masks, f, indent=2)
    with open(output_dir / 'TrackJSON.json', 'w') as f:
        json.dump(track_data, f, indent=2)

    return output_dir


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
    default = Path('/opt/SAM3/models/sam3.pt')
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

        if tracking_frames <= 1:
            frame_path = _extract_single_frame(
                args.DIVEVideo, start_frame, working_dir_path
            )
            state = run_sam3_text_inference(
                frame_path,
                text_prompt,
                confidence,
                device,
                checkpoint_path,
            )
            num_instances = len(state.get('masks', []))
            track_ids = allocate_track_ids(existing_tracks, num_instances)
            print(f'Detected {num_instances} instance(s); assigning track ids: {track_ids}')
            output_dir = build_single_frame_annotation_output(
                state,
                track_ids,
                start_frame,
                track_type,
                working_dir_path,
            )
        else:
            if device != 'cuda':
                raise RuntimeError(
                    f'Video propagation over {tracking_frames} frames requires CUDA. '
                    'Set TrackingFrames to 1 for CPU inference, or run on a GPU host.'
                )

            frame_dir = extract_frames(
                args.DIVEVideo,
                start_frame,
                tracking_frames,
                working_dir_path,
            )
            print(
                f'Propagating text prompt from frame {start_frame} '
                f'for {tracking_frames} frame(s)...'
            )
            mask_dict = run_sam3_video_text_inference(
                frame_dir,
                prompt_frame_index=0,
                text_prompt=text_prompt,
                tracking_frames=tracking_frames,
                confidence=confidence,
                checkpoint_path=checkpoint_path,
            )
            obj_id_to_track_id = map_sam3_obj_ids_to_track_ids(mask_dict, existing_tracks)
            print(
                f'Propagated {len(mask_dict)} frame(s); '
                f'track mapping: {obj_id_to_track_id}'
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


def _extract_single_frame(
    video_path: Union[str, Path],
    frame_number: int,
    working_directory: Path,
) -> Path:
    """Extract one frame from a video as a JPEG."""
    frame_dir = working_directory / 'frames'
    frame_dir.mkdir(parents=True, exist_ok=True)
    output_path = frame_dir / '00000.jpg'
    select_filter = f"select=eq(n\\,{frame_number})"
    subprocess.run(
        [
            'ffmpeg',
            '-i', str(video_path),
            '-vf', select_filter,
            '-vsync', '0',
            '-frames:v', '1',
            '-q:v', '2',
            str(output_path),
        ],
        check=True,
    )
    if not output_path.exists():
        raise RuntimeError(f'Failed to extract frame {frame_number} from {video_path}')
    return output_path


def main(args) -> None:
    gc = girder_client.GirderClient(apiUrl=args.girderApiUrl)
    gc.setToken(args.girderToken)
    print('\n>> CLI Parameters ...\n')
    pprint.pprint(vars(args))
    process_input_args(args, gc)


if __name__ == '__main__':
    main(CLIArgumentParser().parse_args())
