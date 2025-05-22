import click
import cv2
import torch
import shutil
import json
import os
import numpy as np
import subprocess
from pathlib import Path
import logging
from sam2.sam2_video_predictor import SAM2VideoPredictor
from pycocotools import mask as mask_utils
import girder_client

# === CONFIG ===
API_URL = 'localhost'
PORT = 8010
DATASET_ID = '67eecf75e6ee4e673f857aa9'

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

@click.command()
@click.argument('video_path', type=click.Path(exists=True))
@click.option('--start-frame', type=int, default=0)
@click.option('--num-frames', type=int, default=100)
@click.option('--output-dir', type=click.Path(), default='./masks')
@click.option('--frame-dir', type=click.Path(), default='./frames')
@click.option('--upload', is_flag=True, help='Upload generated masks to Girder.')
def segment_video(video_path, start_frame, num_frames, output_dir, frame_dir, upload):
    """
    Segment video using SAM2 with a hardcoded bounding box and save structured outputs.
    """
    device = (
        torch.device("cuda") if torch.cuda.is_available()
        else torch.device("mps") if torch.backends.mps.is_available()
        else torch.device("cpu")
    )
    print(f"Using device: {device}")

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

    logging.info(f"Extracting frames from {video_path}...")
    subprocess.run([
        "ffmpeg", "-i", str(video_path), "-q:v", "2", "-start_number", str(start_frame),
        str(frame_dir / "%05d.jpg")
    ], check=True)
    logging.info("Frame extraction complete.")

    predictor = SAM2VideoPredictor.from_pretrained("facebook/sam2-hiera-tiny").to(device)

    with torch.inference_mode(), torch.autocast(str(device), dtype=torch.bfloat16):
        if device.type == "cuda" and torch.cuda.get_device_properties(0).major >= 8:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True

        logging.info("Initializing model state...")
        state = predictor.init_state(str(frame_dir))

        logging.info(f"Adding box at frame {start_frame}")
        bbox = [81, 329, 983, 642]
        ann_obj_id = 1
        frame_idx, object_ids, masks = predictor.add_new_points_or_box(
            state, frame_idx=start_frame, box=bbox, obj_id=ann_obj_id,
        )

        for obj_id, mask in zip(object_ids, masks):
            save_and_record_mask(mask, output_dir, obj_id, frame_idx, rle_masks, track_data)

        logging.info("Propagating masks...")
        count = 1
        for frame_idx, object_ids, masks in predictor.propagate_in_video(state, start_frame, num_frames - 1):
            if frame_idx < start_frame or count >= num_frames:
                continue
            for obj_id, mask in zip(object_ids, masks):
                save_and_record_mask(mask, output_dir, obj_id, frame_idx, rle_masks, track_data)
            count += 1

    shutil.rmtree(frame_dir, ignore_errors=True)
    logging.info("Cleaned up extracted frames.")

    # Save RLE and Track JSONs
    with open(output_dir / "RLE_MASKS.json", "w") as f:
        json.dump(rle_masks, f, indent=2)

    with open(output_dir / "TrackJSON.json", "w") as f:
        json.dump(track_data, f, indent=2)

    logging.info(f"Saved RLE_MASKS.json and TrackJSON.json to: {output_dir}")

    if upload:
        upload_to_girder(output_dir)


def save_and_record_mask(mask, output_dir, obj_id, frame_idx, rle_masks, track_data):
    """Save mask as PNG and record RLE and track metadata including bounding box."""
    obj_dir = output_dir / str(obj_id)
    obj_dir.mkdir(parents=True, exist_ok=True)
    path = obj_dir / f"{frame_idx}.png"

    # Convert and save RGBA mask
    mask_np = mask.detach().cpu().numpy()
    mask_bin = (mask_np > 0.5).astype(np.uint8).squeeze()
    alpha = mask_bin * 255

    h, w = mask.shape[-2:]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0:3] = 255
    rgba[..., 3] = alpha
    cv2.imwrite(str(path), rgba)

    # COCO RLE
    rle = mask_utils.encode(np.asfortranarray(mask_bin))  # shape (H, W)
    if isinstance(rle['counts'], bytes):  # Decode only if necessary
        rle['counts'] = rle['counts'].decode('utf-8')

    # Init if necessary
    if str(obj_id) not in rle_masks:
        rle_masks[str(obj_id)] = {}
    rle_masks[str(obj_id)][str(frame_idx)] = {
        'rle': {
            'size': list(mask_bin.shape),
            'counts': rle['counts']
        }
    }

    if str(obj_id) not in track_data['tracks']:
        track_data['tracks'][str(obj_id)] = {
            'id': str(obj_id),
            'begin': frame_idx,
            'end': frame_idx,
            'confidencePairs': [['SAM2', 1.0], ["class2", 0.5]],
            'features': [],
            'group': None,
            'attributes': {},
            'hasMask': True,
            'interpolate': False,
        } 

    # Calculate bounding box
    y_indices, x_indices = np.where(mask_bin > 0)
    if len(x_indices) == 0 or len(y_indices) == 0:
        bounds = [0, 0, 0, 0]
    else:
        x1, y1 = int(x_indices.min()), int(y_indices.min())
        x2, y2 = int(x_indices.max()), int(y_indices.max())
        bounds = [x1, y1, x2, y2]

    track_data['tracks'][str(obj_id)]['features'].append({
        'frame': frame_idx,
        'flick': frame_idx * 100000,
        'bounds': bounds,
        'attributes': {},
        'hasMask': True,
        'interpolate': False,
        'keyframe': True
    })
    track_data['tracks'][str(obj_id)]['begin'] = min(track_data['tracks'][str(obj_id)]['begin'], frame_idx)
    track_data['tracks'][str(obj_id)]['end'] = max(track_data['tracks'][str(obj_id)]['end'], frame_idx)

def upload_to_girder(output_dir, track_id):
    gc = girder_client.GirderClient(API_URL, port=PORT, apiRoot='girder/api/v1', scheme='http')
    gc.authenticate(interactive=True)

    masks_folder = gc.createFolder(DATASET_ID, name='masks', reuseExisting=True)
    gc.addMetadataToFolder(masks_folder['_id'], {'mask': True})
    print(f'Uploaded folder: masks ({masks_folder["_id"]})')

    track_folder = gc.createFolder(masks_folder['_id'], name=track_id, reuseExisting=True)
    gc.addMetadataToFolder(track_folder['_id'], {'mask_track': True})

    object_dir = output_dir / track_id
    for obj_id in os.listdir(object_dir):
        obj_folder = gc.createFolder(track_folder['_id'], name=obj_id, reuseExisting=True)
        obj_path = object_dir / obj_id
        for fname in sorted(os.listdir(obj_path)):
            if fname.endswith('.png'):
                fpath = obj_path / fname
                frame_id = int(fname.split('.')[0])
                item = gc.uploadFileToFolder(obj_folder['_id'], str(fpath))
                gc.addMetadataToItem(item['itemId'], {
                    'mask_track_id': track_id,
                    'mask_object_id': obj_id,
                    'mask_frame': frame_id
                })
                print(f'Uploaded: {track_id}/{obj_id}/{frame_id}.png')

    # Upload RLE JSON
    for json_name in ['RLE_MASKS.json']:
        json_path = output_dir / json_name
        if json_path.exists():
            item = gc.uploadFileToFolder(masks_folder['_id'], str(json_path))
            gc.addMetadataToItem(item['itemId'], {
                'description': f"{json_name} file for track {track_id}"
            })
            print(f"Uploaded: {json_name}")


if __name__ == '__main__':
    segment_video()
