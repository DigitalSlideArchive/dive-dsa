# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "click",
#     "numpy",
#     "opencv-python",
#     "Pillow",
#     "psutil",
#     "pycocotools",
#     "transformers",
#     "sam3",
#     "torch",
#     "accelerate",
#     "imageio[ffmpeg]",
# ]
#
# [tool.uv.sources]
# transformers = { git = "https://github.com/huggingface/transformers.git" }
# ///

import torch
import click
import psutil
from pathlib import Path

import os
import json
import cv2
import sys
import glob
import numpy as np
from pycocotools import mask as mask_utils
from PIL import Image
from typing import List, Tuple, Dict, Any
from transformers import (
    Sam3TrackerVideoModel,
    Sam3TrackerVideoProcessor,
)

# --- Config / Defaults ---
DEFAULT_CHECKPOINT = "facebook/sam3"

API_URL = 'localhost'
PORT = 8010
DATASET_ID = '67eecf75e6ee4e673f857aa9'

# --- Utility functions ---

def choose_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    elif torch.backends.mps.is_available():
        return torch.device("mps")
    else:
        return torch.device("cpu")


def get_gpu_memory_usage(device_index=0) -> Dict[str, float]:
    if not torch.cuda.is_available():
        return {"allocated_bytes": 0, "reserved_bytes": 0, "total_bytes": 0, "pct_allocated": 0.0, "pct_reserved": 0.0}
    allocated = torch.cuda.memory_allocated(device_index)
    reserved = torch.cuda.memory_reserved(device_index)
    total = torch.cuda.get_device_properties(device_index).total_memory
    pct_allocated = 100 * allocated / total
    pct_reserved = 100 * reserved / total
    return {
        "allocated_bytes": allocated,
        "reserved_bytes": reserved,
        "total_bytes": total,
        "pct_allocated": pct_allocated,
        "pct_reserved": pct_reserved,
    }


# --- HF model/processor init ---

def init_tracker_model(checkpoint: str = DEFAULT_CHECKPOINT):
    device = choose_device()
    click.echo(f"using device: {device}")

    # Load processor and model from Hugging Face
    click.echo("Loading Sam3TrackerVideoModel and processor from Hugging Face...")
    processor = Sam3TrackerVideoProcessor.from_pretrained(checkpoint)

    # Load model and move to device. Use bfloat16 on CUDA if available for speed/memory.
    model = Sam3TrackerVideoModel.from_pretrained(checkpoint)

    if device.type == "cuda":
        # Move to CUDA and use bfloat16 where supported
        try:
            model.to(device, dtype=torch.bfloat16)
            click.echo("Model loaded to CUDA with bfloat16 dtype.")
        except Exception:
            model.to(device)
            click.echo("Model loaded to CUDA (fp32). bfloat16 push failed; continuing with fp32.")
    elif device.type == "mps":
        model.to(device)
        click.echo("Model loaded to MPS device.")
    else:
        model.to(device)
        click.echo("Model loaded to CPU.")

    return model, processor, device


# --- Video helpers ---

def get_video_stats(video_path: str) -> Tuple[int,int,int]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    return height, width, frame_count


# --- Convert utilities ---

def xyxy_to_xywh(box: List[int]) -> List[int]:
    x1, y1, x2, y2 = box
    return [x1, y1, x2 - x1, y2 - y1]


def normalize_boxes_xywh(boxes_xywh: List[List[int]], frame_h: int, frame_w: int) -> List[List[float]]:
    norm = []
    for (x, y, w, h) in boxes_xywh:
        norm.append([x / frame_w, y / frame_h, w / frame_w, h / frame_h])
    return norm


# --- Core propagation logic using Sam3TrackerVideoModel ---

def start_tracking_session(
    model: Sam3TrackerVideoModel,
    processor: Sam3TrackerVideoProcessor,
    device: torch.device,
    video_frames: List[Image.Image],
    boxes_xyxy: List[List[int]],
    start_frame_idx: int = 0,
    obj_ids: List[int] = None,
):
    """
    Initialize a Sam3TrackerVideoModel inference session and add box prompts.

    Returns: inference_session dict provided by the processor along with a list of initial outputs for the start_frame.
    """
    if obj_ids is None:
        obj_ids = list(range(1, len(boxes_xyxy) + 1))

    # Initialize an inference session with the processor
    inference_session = processor.init_video_session(
        video=video_frames,
        inference_device=device,
        processing_device="cpu",
        video_storage_device="cpu",
    )

    # Convert boxes to absolute xywh for the given frame
    frame_h, frame_w = video_frames[0].size[1], video_frames[0].size[0]

    boxes_xywh = [xyxy_to_xywh(b) for b in boxes_xyxy]

    # Attempt to add boxes via processor.add_inputs_to_inference_session if supported
    try:
        # The API accepts input_boxes as lists of absolute coords per-object
        processor.add_inputs_to_inference_session(
            inference_session=inference_session,
            frame_idx=start_frame_idx,
            obj_ids=obj_ids,
            input_boxes=[boxes_xywh],
            input_labels=None,
            original_size=[frame_h, frame_w],
        )
        click.echo("Added bounding-box prompts to inference session.")
    except Exception:
        # Fallback: convert boxes to a single center point per box and add points as prompts
        click.echo("Warning: bounding box prompt not accepted by processor. Falling back to center points.")
        points = []
        for b in boxes_xywh:
            x, y, w, h = b
            cx = int(x + w / 2)
            cy = int(y + h / 2)
            points.append([[cx, cy]])
        labels = [[[1]] for _ in points]
        processor.add_inputs_to_inference_session(
            inference_session=inference_session,
            frame_idx=start_frame_idx,
            obj_ids=obj_ids,
            input_points=points,
            input_labels=labels,
            original_size=[frame_h, frame_w],
        )
        click.echo("Added point prompts (centers) to inference session as fallback.")

    # Run model once on the annotated frame to obtain initial masks
    outputs = model(inference_session=inference_session, frame_idx=start_frame_idx)

    # Post-process masks for the initial outputs
    video_res_masks = processor.post_process_masks(
        [outputs.pred_masks],
        original_sizes=[[frame_h, frame_w]],
        binarize=False,
    )[0]

    # Build an outputs dict comparable to native predictor for downstream functions
    initial_outputs = {
        "out_obj_ids": np.array(obj_ids),
        "out_probs": np.array([1.0] * len(obj_ids)),
        "out_boxes_xywh": np.array(boxes_xywh),
        "out_binary_masks": video_res_masks.squeeze(0) if video_res_masks.ndim == 3 else video_res_masks,
    }

    return inference_session, initial_outputs


def propagate_in_video_tracker(
    model: Sam3TrackerVideoModel,
    processor: Sam3TrackerVideoProcessor,
    inference_session: Any,
    start_frame_idx: int,
    max_frame_num_to_track: int | None,
    device: torch.device,
):
    """
    Propagate masks through video frames using model.propagate_in_video_iterator.
    Yields a dict mapping frame_idx -> outputs (the same output format used elsewhere in this script).
    """
    outputs_per_frame = {}
    stopped_early = False

    for model_outputs in model.propagate_in_video_iterator(inference_session=inference_session, max_frame_num_to_track=max_frame_num_to_track, start_frame_idx=start_frame_idx):
        # model_outputs is expected to have fields: frame_idx, pred_masks, etc.
        frame_idx = model_outputs.frame_idx

        # Post-process masks
        # original_sizes required for proper handling
        original_sizes = [[inference_session.video_height, inference_session.video_width]]
        video_res_masks = processor.post_process_masks([model_outputs.pred_masks], original_sizes=original_sizes, binarize=False)[0]

        # Attempt to read object ids / boxes / scores from the model_outputs if available, otherwise create placeholders
        out_obj_ids = getattr(model_outputs, 'obj_ids', None)
        out_probs = getattr(model_outputs, 'scores', None)
        out_boxes_xywh = getattr(model_outputs, 'boxes_xywh', None)

        if out_obj_ids is None:
            # Create sequential ids starting at 1
            n = video_res_masks.shape[0]
            out_obj_ids = np.arange(1, n + 1)
        if out_probs is None:
            out_probs = np.ones(len(out_obj_ids))
        if out_boxes_xywh is None:
            # compute boxes from masks as fallback
            n = video_res_masks.shape[0]
            out_boxes_xywh = np.zeros((n, 4), dtype=float)
            for i in range(n):
                m = video_res_masks[i]
                ys, xs = np.where(m)
                if len(xs) == 0:
                    out_boxes_xywh[i] = [0, 0, 1, 1]
                else:
                    x1, x2 = xs.min(), xs.max()
                    y1, y2 = ys.min(), ys.max()
                    out_boxes_xywh[i] = [x1, y1, x2 - x1, y2 - y1]

        outputs_per_frame[frame_idx] = {
            "out_obj_ids": np.array(out_obj_ids),
            "out_probs": np.array(out_probs),
            "out_boxes_xywh": np.array(out_boxes_xywh),
            "out_binary_masks": video_res_masks,
        }

        # Check GPU memory and optionally stop early
        if device.type == "cuda":
            gpu_mem = get_gpu_memory_usage()
            if gpu_mem["pct_reserved"] > 90.0:
                click.echo(f"⚠️ High GPU memory usage: {gpu_mem['pct_reserved']:.2f}% reserved")
                stopped_early = True
                break

    return outputs_per_frame, stopped_early


# --- Process outputs and save ---

def process_sam3_outputs(outputs: dict, frame_height: int, frame_width: int):
    obj_ids = outputs.get("out_obj_ids")
    probs = outputs.get("out_probs")
    boxes_xywh = outputs.get("out_boxes_xywh")
    masks = outputs.get("out_binary_masks")

    # convert xywh to xyxy absolute
    boxes_xyxy_abs = []
    for (x, y, w, h) in boxes_xywh:
        x1 = int(x)
        y1 = int(y)
        x2 = int(x + w)
        y2 = int(y + h)
        boxes_xyxy_abs.append([x1, y1, x2, y2])
    boxes_xyxy_abs = np.array(boxes_xyxy_abs)

    return {
        "obj_ids": obj_ids,
        "probs": probs,
        "boxes_xywh": boxes_xywh,
        "boxes_xyxy_abs": boxes_xyxy_abs,
        "masks": masks,
    }


def save_and_record_mask(mask, box, confidencePair, obj_id, frame_idx, rle_masks, track_data):
    click.echo(F"saving for frame {frame_idx}, obj {obj_id}")
    # Ensure mask is boolean numpy array
    mask_np = mask.astype(np.uint8) if isinstance(mask, np.ndarray) else mask.cpu().numpy().astype(np.uint8)
    if mask_np.ndim == 3:
        mask_np = mask_np.squeeze(0)
    rle = mask_utils.encode(np.asfortranarray(mask_np))
    if isinstance(rle['counts'], bytes):
        rle['counts'] = rle['counts'].decode('utf-8')
    if str(obj_id) not in rle_masks:
        rle_masks[str(obj_id)] = {}
    rle_masks[str(obj_id)][str(frame_idx)] = {
        'rle': {
            'size': list(mask_np.shape),
            'counts': rle['counts']
        }
    }

    if str(obj_id) not in track_data['tracks']:
        track_data['tracks'][str(obj_id)] = {
            'id': str(obj_id),
            'begin': frame_idx,
            'end': frame_idx,
            'confidencePairs': [confidencePair],
            'features': [],
            'group': None,
            'attributes': {},
            'hasMask': True,
            'interpolate': False,
        }

    track_data['tracks'][str(obj_id)]['features'].append({
        'frame': frame_idx,
        'flick': frame_idx * 100000,
        'bounds': [int(box[0]), int(box[1]), int(box[2]), int(box[3])],
        'attributes': {},
        'hasMask': True,
        'interpolate': False,
        'keyframe': True
    })
    track_data['tracks'][str(obj_id)]['begin'] = min(track_data['tracks'][str(obj_id)]['begin'], frame_idx)
    track_data['tracks'][str(obj_id)]['end'] = max(track_data['tracks'][str(obj_id)]['end'], frame_idx)


# --- High-level inference session ---

def inference_session_tracker(
    model,
    processor,
    device,
    video_path: str,
    boxes: List[List[int]],
    start_frame: int = 0,
    num_frames: int = -1,
    track_data=None,
    rle_masks=None,
):
    if track_data is None:
        track_data = { 'tracks': {}, 'groups': {}, 'version': 2 }
    if rle_masks is None:
        rle_masks = {}

    # load video frames as PIL.Images (using cv2 then convert) for the processor
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")
    frames = []
    success, frame = cap.read()
    while success:
        # convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frames.append(Image.fromarray(frame_rgb))
        success, frame = cap.read()
    cap.release()

    if len(frames) == 0:
        raise RuntimeError("Video contains no frames")

    video_stats = (frames[0].height, frames[0].width, len(frames))

    # convert boxes and start session
    boxes_abs = [list(map(int, b)) for b in boxes]
    inference_session, initial_outputs = start_tracking_session(model, processor, device, frames, boxes_abs, start_frame_idx=start_frame)

    # process initial outputs
    click.echo("➡️ Initial segmentation complete.")
    data = process_sam3_outputs(initial_outputs, video_stats[0], video_stats[1])
    for i, obj_id in enumerate(data["obj_ids"]):
        save_and_record_mask(
            data["masks"][i],
            data["boxes_xyxy_abs"][i],
            ['SAM3', float(data["probs"][i])],
            int(obj_id),
            start_frame,
            rle_masks,
            track_data,
        )

    # propagate
    frame_cursor = start_frame
    target_total_frames = (video_stats[2] - start_frame) if num_frames == -1 else (start_frame + num_frames)
    current_chunk = num_frames if num_frames != -1 else -1

    while frame_cursor < target_total_frames:
        click.echo(f"Current frame cursor: {frame_cursor}, Target total frames: {target_total_frames}")
        if current_chunk != -1:
            current_chunk = min(current_chunk, target_total_frames - frame_cursor)
        click.echo(f"➡️ Propagating from frame {frame_cursor} for {current_chunk} frames")

        max_track = None if current_chunk == -1 else current_chunk
        propagated, stopped_early = propagate_in_video_tracker(model, processor, inference_session, frame_cursor, max_track, device)

        # Save results
        for frame_idx, outputs in propagated.items():
            data = process_sam3_outputs(outputs, video_stats[0], video_stats[1])
            for i, obj_id in enumerate(data["obj_ids"]):
                save_and_record_mask(
                    data["masks"][i],
                    data["boxes_xyxy_abs"][i],
                    ['SAM3', float(data["probs"][i])],
                    int(obj_id),
                    frame_idx,
                    rle_masks,
                    track_data,
                )

        # Update cursor
        if propagated:
            frame_cursor = max(propagated.keys()) + 1
        else:
            stopped_early = True

        if stopped_early:
            if current_chunk == -1:
                current_chunk = 50
            else:
                current_chunk = max(1, current_chunk // 2)
            click.echo(f"🔽 Reducing chunk size to {current_chunk} frames due to memory constraints.")
            frame_cursor = max(propagated.keys()) + 1 if propagated else frame_cursor
            continue

        if current_chunk < num_frames and num_frames != -1:
            current_chunk = min(current_chunk * 2 if current_chunk > 0 else num_frames, num_frames)

    return track_data, rle_masks


# --- CLI entrypoint ---

def int_list(ctx, param, value):
    if value is None:
        return []
    return [int(x) for x in value.split(",")]


@click.command()
@click.argument('video_path', type=click.Path(exists=True))
@click.option('--start-frame', type=int, default=0)
@click.option('--boxes', type=str, default="442,355,724,558", callback=int_list, help='Comma-separated list of bounding box coordinates: x1,y1,x2,y2')
@click.option('--num-frames', type=int, default=-1)
@click.option('--output-dir', type=click.Path(), default='./masks')
@click.option('--checkpoint', type=str, default=DEFAULT_CHECKPOINT, help='Hugging Face model repo like facebook/sam3')
@click.option('--upload', is_flag=True, help='Upload generated masks to Girder.')

def segment_video(video_path, start_frame, boxes, num_frames, output_dir, checkpoint, upload):
    track_data = { 'tracks': {}, 'groups': {}, 'version': 2 }
    rle_masks = {}

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # init model
    model, processor, device = init_tracker_model(checkpoint)

    click.echo(f"Processing video: {video_path}")

    # single box from CLI
    box_list = [boxes]

    track_data, rle_masks = inference_session_tracker(model, processor, device, video_path, box_list, start_frame, num_frames, track_data, rle_masks)

    with open(output_dir / 'TrackJSON.json', 'w') as f:
        json.dump(track_data, f, indent=2)
    with open(output_dir / 'RLE_MASKS.json', 'w') as f:
        json.dump(rle_masks, f, indent=2)

    click.echo(f"Saved TrackJSON.json and RLE_MASKS.json to {output_dir}")

    if upload:
        click.echo("Upload requested but Girder upload is left as a TODO for your environment.")


if __name__ == '__main__':
    segment_video()
