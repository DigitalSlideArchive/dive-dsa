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

import cv2
import sam3
import torch
import logging
import numpy as np
import girder_client
from pycocotools import mask as mask_utils
from PIL import Image
from sam3.model_builder import build_sam3_video_model, build_sam3_video_predictor
from sam3.model.sam3_video_predictor import Sam3VideoPredictor


API_URL = 'localhost'
PORT = 8010
DATASET_ID = '67eecf75e6ee4e673f857aa9'

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

logger = logging.getLogger(__name__)

def init_predictor():
    # select the device for computation
    if torch.cuda.is_available():
        device = torch.device("cuda")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
    print(f"using device: {device}")

    if device.type == "cuda":
        # use bfloat16 for the entire notebook
        torch.autocast("cuda", dtype=torch.bfloat16).__enter__()
        # turn on tfloat32 for Ampere GPUs (https://pytorch.org/docs/stable/notes/cuda.html#tensorfloat-32-tf32-on-ampere-devices)
        if torch.cuda.get_device_properties(0).major >= 8:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True


    elif device.type == "mps":
        print(
            "\nSupport for MPS devices is preliminary. SAM 3 is trained with CUDA and might "
            "give numerically different outputs and sometimes degraded performance on MPS. "
            "See e.g. https://github.com/pytorch/pytorch/issues/84936 for a discussion."
        )
    predictor = build_sam3_video_predictor(
        checkpoint_path="./sam3.pt",
        bpe_path="./bpe_simple_vocab_16e6.txt.gz",
    )
    return predictor

def propagate_in_video(predictor: Sam3VideoPredictor, session_id, start_frame_idx=0, mamax_frame_num_to_track=None):
    # we will just propagate from frame 0 to the end of the video
    outputs_per_frame = {}
    for response in predictor.handle_stream_request(
        request=dict(
            type="propagate_in_video",
            session_id=session_id,
            start_frame_index=start_frame_idx,
            max_frame_num_to_track=mamax_frame_num_to_track,
        )
    ):
        outputs_per_frame[response["frame_index"]] = response["outputs"]

    return outputs_per_frame

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

def get_video_resolution(video_path: str):
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video: {video_path}")

    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    cap.release()
    return height, width


def inference_session(
        predictor: Sam3VideoPredictor,
        video_path: str,
        text_prompt: str,
        start_frame: int = 0,
        num_frames: int = 1,
        track_data,
        rle_masks,
        frame_size=(720,1280),
    ):
    response = predictor.handle_request(
        request=dict(
            type="start_session",
            resource_path=video_path,
        )
    )
    session_id = response["session_id"]
    prompt_text_str = text_prompt
    frame_idx = start_frame  # add a text prompt on the specified start frame
    response = predictor.handle_request(
        request=dict(
            type="add_prompt",
            session_id=session_id,
            frame_index=frame_idx,
            text=prompt_text_str,
        )
    )
    out = response["outputs"]
    #outputs_per_frame = propagate_in_video(predictor, session_id)
    data = process_sam3_outputs(out, frame_size[0], frame_size[1])
    obj_ids = data["obj_ids"]
    probs = data["probs"]
    boxes_xyxy_abs = data["boxes_xyxy_abs"]
    masks = data["masks"]
    for (i, obj_id) in enumerate(obj_ids):
        mask = torch.from_numpy(masks[i])
        print(f'Boxes Abs: {boxes_xyxy_abs[i]}')
        confidencePair = ['SAM3', float(probs[i])]
        save_and_record_mask(
            mask,
            boxes_xyxy_abs[i],
           confidencePair,
            obj_id=int(obj_id),
            frame_idx=frame_idx,
            rle_masks=rle_masks,
            track_data=track_data,
        )


def save_and_record_mask(mask, box, confidencePair, obj_id, frame_idx, rle_masks, track_data):
    """Save mask as PNG and record RLE and track metadata including bounding box."""
    # COCO RLE
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
        'bounds': box,
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
@click.option('--num-frames', type=int, default=1)
@click.option('--output-dir', type=click.Path(), default='./masks')
@click.option('--frame-dir', type=click.Path(), default='./frames')
@click.option('--upload', is_flag=True, help='Upload generated masks to Girder.')

def segment_video(video_path, start_frame, text_prompt, num_frames, output_dir, frame_dir, upload):
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

    frame_dir = Path(frame_dir)
    frame_dir.mkdir(parents=True, exist_ok=True)


    predictor = init_predictor()

    print(f"Processing video: {video_path}")
    frame_size = get_video_resolution(video_path)
    inference_session(predictor, video_path, text_prompt, start_frame, num_frames, track_data, rle_masks, frame_size=frame_size)


if __name__ == '__main__':
    segment_video()
