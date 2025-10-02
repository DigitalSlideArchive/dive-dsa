# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "click",
#     "girder-client",
#     "numpy",
#     "pillow",
#     "pycocotools",
#     "scikit-image",
#     "setuptools"
# ]
# ///
import json
import random
import numpy as np
import os
import shutil
import click
from skimage.draw import polygon, disk, rectangle
from pycocotools import mask as mask_utils
from PIL import Image  # For saving PNG images
import girder_client

# === GLOBAL CONFIG ===
API_URL = 'localhost'
DATASET_ID = '68347799959c4322160de6a4'
PORT = 8010

OUTPUT_MASKS = True  # ✅ Set to True to save masks as PNG images
IMAGE_SIZE = (720, 1280)  # height, width of image
SHAPE_SIZE = (100, 100)  # width, height of shape

CONFIG = [
    {'track_number': 0, 'num_frames': 200, 'mask_type': 'pentagon', 'motion_type': 'circle'},
    {'track_number': 1, 'num_frames': 200, 'mask_type': 'circle', 'motion_type': 'bounce'},
    {'track_number': 2, 'num_frames': 200, 'mask_type': 'rectangle', 'motion_type': 'circle'},
    {'track_number': 3, 'num_frames': 200, 'mask_type': 'pentagon', 'motion_type': 'circle'},
    {'track_number': 4, 'num_frames': 200, 'mask_type': 'circle', 'motion_type': 'bounce'},
    {'track_number': 5, 'num_frames': 200, 'mask_type': 'rectangle', 'motion_type': 'circle'},
    {'track_number': 6, 'num_frames': 200, 'mask_type': 'pentagon', 'motion_type': 'circle'},
    {'track_number': 7, 'num_frames': 200, 'mask_type': 'circle', 'motion_type': 'bounce'},
    {'track_number': 8, 'num_frames': 200, 'mask_type': 'rectangle', 'motion_type': 'circle'},
    {'track_number': 9, 'num_frames': 200, 'mask_type': 'circle', 'motion_type': 'circle'},
    {'track_number': 10, 'num_frames': 200, 'mask_type': 'rectangle', 'motion_type': 'circle'},
]


def create_mask(shape_type, bounds, img_size):
    height, width = img_size
    mask = np.zeros((height, width), dtype=np.uint8)

    x1, y1, x2, y2 = bounds
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    radius_x = (x2 - x1) // 2
    radius_y = (y2 - y1) // 2

    if shape_type == 'rectangle':
        rr, cc = rectangle(start=(y1, x1), end=(y2, x2), shape=mask.shape)
    elif shape_type == 'circle':
        rr, cc = disk((cy, cx), min(radius_x, radius_y), shape=mask.shape)
    elif shape_type in ('pentagon', 'star'):
        num_points = 5 if shape_type == 'pentagon' else 10
        theta = np.linspace(0, 2 * np.pi, num_points, endpoint=False)
        if shape_type == 'star':
            theta[1::2] += np.pi / num_points  # offset for star spikes
        points = np.vstack((
            cx + radius_x * np.cos(theta),
            cy + radius_y * np.sin(theta)
        )).T
        rr, cc = polygon(points[:, 1], points[:, 0], shape=mask.shape)
    else:
        raise ValueError(f"Unsupported shape type: {shape_type}")

    mask[rr, cc] = 1
    return mask


def circular_motion(num_frames, img_size, shape_size):
    h, w = img_size
    sh, sw = shape_size

    center_x = w // 2
    center_y = h // 2
    radius_x = (w - sw) // 2 - 10
    radius_y = (h - sh) // 2 - 10

    for frame in range(num_frames):
        angle = 2 * np.pi * (frame / num_frames)
        cx = int(center_x + radius_x * np.cos(angle))
        cy = int(center_y + radius_y * np.sin(angle))
        x1, y1 = cx - sw // 2, cy - sh // 2
        x2, y2 = cx + sw // 2, cy + sh // 2
        yield [x1, y1, x2, y2]


def bouncing_motion(num_frames, img_size, shape_size):
    h, w = img_size
    sh, sw = shape_size

    x, y = random.randint(0, w - sw), random.randint(0, h - sh)
    dx, dy = random.choice([-5, 5]), random.choice([-5, 5])

    for _ in range(num_frames):
        x1, y1 = x, y
        x2, y2 = x + sw, y + sh

        if x + dx < 0 or x + dx + sw > w:
            dx = -dx
        if y + dy < 0 or y + dy + sh > h:
            dy = -dy

        x += dx
        y += dy

        yield [x1, y1, x2, y2]


@click.command()
@click.option('--upload', is_flag=True, help='Upload generated masks to Girder.')
def generate_tracks(upload):
    output_masks_exist = os.path.exists('outputMasks')
    rle_json_exist = os.path.exists('RLE_MASKS.json')

    if output_masks_exist and rle_json_exist:
        print("Found existing outputMasks folder and RLE_MASKS.json. Skipping generation.")
    else:
        print("Generating new masks and JSON files...")

        if OUTPUT_MASKS:
            if os.path.exists('outputMasks'):
                shutil.rmtree('outputMasks')
            os.makedirs('outputMasks')

        track_data = {'tracks': {}, 'groups': {}, 'version': 2}
        mask_data = {}
        rle_masks_json = {}

        for config in CONFIG:
            track_id = config['track_number']
            num_frames = config['num_frames']
            mask_type = config['mask_type']
            motion_type = config.get('motion_type', 'circle')

            if motion_type == 'circle':
                motion = circular_motion(num_frames, IMAGE_SIZE, SHAPE_SIZE)
            elif motion_type == 'bounce':
                motion = bouncing_motion(num_frames, IMAGE_SIZE, SHAPE_SIZE)
            else:
                raise ValueError(f"Unsupported motion type: {motion_type}")

            track = {
                'begin': 0,
                'end': num_frames - 1,
                'id': track_id,
                'confidencePairs': [[mask_type, 1.0]],
                'hasMask': True,
                'attributes': {},
                'meta': {},
                'features': []
            }
            mask_data[str(track_id)] = {}
            rle_masks_json[str(track_id)] = {}

            for frame_id, bounds in enumerate(motion):
                mask = create_mask(mask_type, bounds, IMAGE_SIZE)
                binary_mask = (mask > 0).astype(np.uint8) * 255

                rle = mask_utils.encode(np.asfortranarray(binary_mask))
                rle['counts'] = rle['counts'].decode('utf-8')

                feature = {
                    'frame': frame_id,
                    'flick': frame_id * 100000,
                    'bounds': bounds,
                    'attributes': {},
                    'hasMask': True,
                    'interpolate': False,
                    'keyframe': True
                }
                track['features'].append(feature)

                mask_data[str(track_id)][str(frame_id)] = {
                    'rle': {
                        'size': list(IMAGE_SIZE),
                        'counts': rle['counts']
                    }
                }

                rle_masks_json[str(track_id)][str(frame_id)] = {
                    'rle': {
                        'size': [IMAGE_SIZE[0], IMAGE_SIZE[1]],  # width, height
                        'counts': rle['counts']
                    }
                }

                if OUTPUT_MASKS:
                    output_dir = os.path.join('outputMasks/masks', f'{track_id}')
                    os.makedirs(output_dir, exist_ok=True)

                    alpha_channel = (mask > 0).astype(np.uint8) * 255
                    rgba = np.zeros((mask.shape[0], mask.shape[1], 4), dtype=np.uint8)
                    rgba[..., 0:3] = 255
                    rgba[..., 3] = alpha_channel

                    img = Image.fromarray(rgba, mode='RGBA')
                    img_path = os.path.join(output_dir, f'{frame_id}.png')
                    img.save(img_path)

            track_data['tracks'][str(track_id)] = track

        with open('TrackJSON.json', 'w') as f:
            json.dump(track_data, f, indent=2)


        with open('RLE_MASKS.json', 'w') as f:
            json.dump(rle_masks_json, f, indent=2)

        print('Generated TrackJSON.json, RLE_MASKS.json', end='')
        if OUTPUT_MASKS:
            print(', and PNG masks in outputMasks/')
            with open('outputMasks/masks/TrackJSON.json', 'w') as f:
                json.dump(track_data, f, indent=2)

            with open('outputMasks/masks/RLE_MASKS.json', 'w') as f:
                json.dump(rle_masks_json, f, indent=2)

        else:
            print('.')

    if upload:
        upload_to_girder()


def upload_to_girder():
    gc = girder_client.GirderClient(API_URL, port=PORT, apiRoot='girder/api/v1', scheme='http')
    gc.authenticate(interactive=True)

    masks_folder = gc.createFolder(DATASET_ID, name='masks', reuseExisting=True)
    gc.addMetadataToFolder(masks_folder['_id'], {'mask': True})
    print(f'Created or reused folder: masks ({masks_folder["_id"]})')

    for track_config in CONFIG:
        track_id = str(track_config['track_number'])
        track_folder = gc.createFolder(masks_folder['_id'], name=track_id, reuseExisting=True)
        gc.addMetadataToFolder(track_folder['_id'], {'mask_track': True})
        print(f'Created or reused track folder: {track_id} ({track_folder["_id"]})')

        track_path = os.path.join('outputMasks', track_id)
        if not os.path.exists(track_path):
            print(f'Warning: {track_path} does not exist, skipping upload for this track.')
            continue

        for fname in sorted(os.listdir(track_path)):
            if not fname.endswith('.png'):
                continue
            frame_number = int(fname.split('.')[0])
            img_path = os.path.join(track_path, fname)
            item = gc.uploadFileToFolder(track_folder['_id'], img_path, filename=fname)
            gc.addMetadataToItem(item['itemId'], {
                'mask_frame_parent_track': track_id,
                'mask_frame_value': frame_number,
                'mask_track_frame': True
            })
            print(f'Uploaded {fname} to track {track_id} with metadata.')

    # Upload RLE_MASKS.json to base masks folder
    if os.path.exists('RLE_MASKS.json'):
        rle_item = gc.uploadFileToFolder(masks_folder['_id'], 'RLE_MASKS.json')
        gc.addMetadataToItem(rle_item['itemId'], {
            'description': 'Nested JSON with COCO RLE for all tracks and frames',
            'RLE_MASK_FILE': True
        })
        print('Uploaded RLE_MASKS.json to masks folder.')

    # Create a TrackJSON for uploading
    if os.path.exists('trackJSON.json'):
        track_item = gc.uploadFileToFolder(DATASET_ID, 'trackJSON.json')
        gc.sendRestRequest("POST", f"/dive_rpc/postprocess/{DATASET_ID}")
        print('Uploaded trackJSON.json to masks folder.')


if __name__ == '__main__':
    generate_tracks()
