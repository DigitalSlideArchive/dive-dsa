# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "click",
#     "girder-client",
#     "numpy",
#     "opencv-python",
#     "Pillow",
#     "psutil",
#     "pycocotools",
#     "sam3",
#     "torch",
# ]
# ///
import torch
import click
import psutil
from pathlib import Path

import glob
import os
import json

import cv2
import sam3
import sys
import numpy as np
import girder_client
from pycocotools import mask as mask_utils
from PIL import Image
from sam3.model_builder import build_sam3_video_model, build_sam3_video_predictor
from sam3.model.sam3_video_predictor import Sam3VideoPredictor


API_URL = 'localhost'
PORT = 8010
DATASET_ID = '67eecf75e6ee4e673f857aa9'


def init_predictor():
    # select the device for computation
    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
    click.echo(f"using device: {device}")

    if device.type == "cuda":
        # use bfloat16 for the entire notebook
        torch.autocast("cuda", dtype=torch.bfloat16).__enter__()
        # turn on tfloat32 for Ampere GPUs (https://pytorch.org/docs/stable/notes/cuda.html#tensorfloat-32-tf32-on-ampere-devices)
        if torch.cuda.get_device_properties(0).major >= 8:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
    elif device.type == "mps":
        click.echo(
            "\nSupport for MPS devices is preliminary. SAM 3 is trained with CUDA and might "
            "give numerically different outputs and sometimes degraded performance on MPS. "
            "See e.g. https://github.com/pytorch/pytorch/issues/84936 for a discussion."
        )
    predictor = build_sam3_video_predictor(
        checkpoint_path="./sam3.pt",
        bpe_path="./bpe_simple_vocab_16e6.txt.gz",
    )
    return predictor

def get_gpu_memory_usage(device=0):
    allocated = torch.cuda.memory_allocated(device)        # bytes
    reserved  = torch.cuda.memory_reserved(device)         # bytes
    total     = torch.cuda.get_device_properties(device).total_memory  # bytes

    pct_allocated = 100 * allocated / total
    pct_reserved  = 100 * reserved / total

    return {
        "allocated_bytes": allocated,
        "reserved_bytes": reserved,
        "total_bytes": total,
        "pct_allocated": pct_allocated,
        "pct_reserved": pct_reserved,
    }


def propagate_in_video(
        predictor: Sam3VideoPredictor,
        inital: bool,
        video_path: str,
        text_prompt: str,
        session_id: str,
        start_frame_idx=0,
        max_frame_num_to_track=None,
    ):
    """
    Runs propagation but stops early if GPU memory usage crosses threshold.
    Returns:
        outputs_per_frame: dict
        stopped_early: bool
    """
    outputs_per_frame = {}
    stopped_early = False
    if inital:
        response = predictor.handle_request(
            request=dict(
                type="start_session",
                resource_path=video_path,
            )
        )
        session_id = response["session_id"]

        # Add initial prompt
        response = predictor.handle_request(
            request=dict(
                type="add_prompt",
                session_id=session_id,
                frame_index=start_frame_idx,
                text=text_prompt,
            )
        )
        outputs_per_frame[start_frame_idx] = response["outputs"]
        return outputs_per_frame, False, session_id
    if max_frame_num_to_track == -1:
        max_frame_num_to_track = None
    for response in predictor.handle_stream_request(
        request=dict(
            type="propagate_in_video",
            session_id=session_id,
            start_frame_index=start_frame_idx,
            max_frame_num_to_track=max_frame_num_to_track,
        )
    ):
        # Check GPU memory usage
        if torch.cuda.is_available():
            gpu_mem = get_gpu_memory_usage()
            if gpu_mem["pct_reserved"] > 90.0:
                click.echo(
                    f"⚠️ High GPU memory usage: "
                    f"{gpu_mem['pct_reserved']:.2f}% reserved, "
                    f"{gpu_mem['pct_allocated']:.2f}% allocated."
                )
                stopped_early = True
                break
            else:
                click.echo(
                    f"GPU usage: "
                    f"{gpu_mem['pct_reserved']:.2f}% reserved, "
                    f"{gpu_mem['pct_allocated']:.2f}% allocated."
                )

        outputs_per_frame[response["frame_index"]] = response["outputs"]
    if stopped_early:
        click.echo("🛑 Stopping propagation early due to high GPU memory usage.")
        predictor.handle_request(
            request=dict(
                type="close_session",
                session_id=session_id,
            )
        )
        # clear GPU cache and resv
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.reset_peak_memory_stats()
            torch.cuda.reset_max_memory_allocated()
            torch.cuda.reset_max_memory_cached()
            torch.cuda.reset_peak_host_memory_stats()
    return outputs_per_frame, stopped_early, session_id


def process_sam3_outputs(outputs: dict, frame_height: int, frame_width: int):
    """
    Extracts and converts fields from the SAM3VideoPredictor output dictionary.

    Args:
        outputs (dict): response["outputs"] from predictor.handle_request(...)
        frame_height (int): Height of the video frame in pixels
        frame_width (int): Width of the video frame in pixels

    Returns:
        dict: {
            "obj_ids": ndarray[int],
            "probs": ndarray[float],
            "boxes_xywh_norm": ndarray[float],
            "boxes_xyxy_abs": ndarray[int],
            "masks": ndarray[bool],
        }
    """

    obj_ids = outputs.get("out_obj_ids")               # shape: (N,)
    probs = outputs.get("out_probs")                   # shape: (N,)
    boxes_xywh_norm = outputs.get("out_boxes_xywh")    # shape: (N, 4)
    masks = outputs.get("out_binary_masks")            # shape: (N, H, W)

    if boxes_xywh_norm is None:
        raise ValueError("Output dictionary missing 'out_boxes_xywh'")

    # Convert normalized xywh → absolute xyxy pixel coordinates
    boxes_xyxy_abs = []
    for (x, y, w, h) in boxes_xywh_norm:
        x1 = int(x * frame_width)
        y1 = int(y * frame_height)
        x2 = int((x + w) * frame_width)
        y2 = int((y + h) * frame_height)
        boxes_xyxy_abs.append([x1, y1, x2, y2])

    boxes_xyxy_abs = np.array(boxes_xyxy_abs)

    return {
        "obj_ids": obj_ids,
        "probs": probs,
        "boxes_xywh_norm": boxes_xywh_norm,
        "boxes_xyxy_abs": boxes_xyxy_abs,
        "masks": masks,
    }

def get_video_stats(video_path: str):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    # get the video length in frames
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    cap.release()
    return height, width, frame_count

def inference_session(
        predictor: Sam3VideoPredictor,
        video_path: str,
        text_prompt: str,
        start_frame: int = 0,
        num_frames: int = 1,
        track_data={
            'tracks': {},
            'groups': {},
            'version': 2
        },
        rle_masks={},
        video_stats=(720, 1280, 0),
    ):
    """
    Performs adaptive segmentation:
    - Starts with num_frames
    - On memory overload: halves batch size and continues
    - Continues until all frames are processed
    """
    # Begin the SAM3 session
    propogated, loop_stopped_early, session_id = propagate_in_video(
        predictor,
        inital=True,
        video_path=video_path,
        text_prompt=text_prompt,
        session_id="",
        start_frame_idx=start_frame,
        max_frame_num_to_track=1,
    )
    click.echo("➡️ Initial segmentation complete.")
    for frame_idx, outputs in propogated.items():
        data = process_sam3_outputs(outputs, video_stats[0], video_stats[1])
        for i, obj_id in enumerate(data["obj_ids"]):
            save_and_record_mask(
                torch.from_numpy(data["masks"][i]),
                data["boxes_xyxy_abs"][i],
                ['SAM3', float(data["probs"][i])],
                int(obj_id),
                frame_idx,
                rle_masks,
                track_data,
            )

    # Adaptive propagation loop
    frame_cursor = start_frame
    if num_frames == -1:
        target_total_frames = video_stats[2] - start_frame
    else:
        target_total_frames = start_frame + num_frames
    current_chunk = num_frames
    loop_stopped_early = False
    while frame_cursor < target_total_frames:
        # Ensure chunk does not exceed remaining frames
        click.echo(f"Current frame cursor: {frame_cursor}, Target total frames: {target_total_frames}")
        if current_chunk != -1:
            current_chunk = min(current_chunk, target_total_frames - frame_cursor)

        click.echo(f"➡️ Propagating from frame {frame_cursor} for {current_chunk} frames")

        propagated, stopped_early, session_id = propagate_in_video(
            predictor,
            loop_stopped_early,
            video_path,
            text_prompt,
            session_id,
            start_frame_idx=frame_cursor,
            max_frame_num_to_track=current_chunk,
        )
        loop_stopped_early = stopped_early

        # Save results
        for frame_idx, outputs in propagated.items():
            data = process_sam3_outputs(outputs, video_stats[0], video_stats[1])
            for i, obj_id in enumerate(data["obj_ids"]):
                save_and_record_mask(
                    torch.from_numpy(data["masks"][i]),
                    data["boxes_xyxy_abs"][i],
                    ['SAM3', float(data["probs"][i])],
                    int(obj_id),
                    frame_cursor,
                    rle_masks,
                    track_data,
                )

        # Move cursor to last processed frame + 1
        if propagated:
            frame_cursor = max(propagated.keys()) + 1
        else:
            # No progress—must shrink chunk
            stopped_early = True

        # If memory spike occurred → shrink chunk size
        if stopped_early:
            if current_chunk == -1:
                current_chunk = 50 # reasonable default start
            else:
                current_chunk //= 2
            click.echo(f"🔽 Reducing chunk size to {current_chunk} frames due to memory constraints.")
            frame_cursor = max(propagated.keys()) + 1
            continue

        # Otherwise → increase chunk size slowly (optional)
        if current_chunk < num_frames:
            current_chunk = min(current_chunk * 2, num_frames)

    return track_data, rle_masks

def save_and_record_mask(mask, box, confidencePair, obj_id, frame_idx, rle_masks, track_data):
    """Save mask as PNG and record RLE and track metadata including bounding box."""
    # COCO RLE
    click.echo(F"saving for frame {frame_idx}, obj {obj_id}")
    rle = mask_utils.encode(np.asfortranarray(mask))  # shape (H, W)
    if isinstance(rle['counts'], bytes):  # Decode only if necessary
        rle['counts'] = rle['counts'].decode('utf-8')

    # Init if necessary
    if str(obj_id) not in rle_masks:
        rle_masks[str(obj_id)] = {}
    rle_masks[str(obj_id)][str(frame_idx)] = {
        'rle': {
            'size': list(mask.shape),
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

    # Calculate bounding box
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



@click.command()
@click.argument('video_path', type=click.Path(exists=True))
@click.option('--start-frame', type=int, default=0)
@click.option('--text-prompt', type=str, default="person")
@click.option('--num-frames', type=int, default=-1)
@click.option('--output-dir', type=click.Path(), default='./masks')
@click.option('--upload', is_flag=True, help='Upload generated masks to Girder.')

def segment_video(video_path, start_frame, text_prompt, num_frames, output_dir, upload):
    """
    Segment video using SAM3 with a text prompt and save structured outputs.
    """
    track_data = {
        'tracks': {},
        'groups': {},
        'version': 2
    }
    rle_masks = {}

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    predictor = init_predictor()

    click.echo(f"Processing video: {video_path}")
    video_stats = get_video_stats(video_path)
    track_data, rle_masks = inference_session(predictor, video_path, text_prompt, start_frame, num_frames, track_data, rle_masks, video_stats=video_stats)
    with open(output_dir / 'TrackJSON.json', 'w') as f:
        json.dump(track_data, f, indent=2)
    with open(output_dir / 'RLE_MASKS.json', 'w') as f:
        json.dump(rle_masks, f, indent=2)



if __name__ == '__main__':
    segment_video()
