import os
import json
import numpy as np
from PIL import Image
import click


def get_mask_bounds(image: Image.Image):
    """Extract the bounding box of mask pixels: white (with or without alpha)."""
    rgba = image.convert("RGBA")
    data = np.array(rgba)

    r, g, b, a = data[..., 0], data[..., 1], data[..., 2], data[..., 3]

    # Mask is ONLY where pixel is white (R=G=B=255) and visible (alpha > 0)
    mask = (r == 255) & (g == 255) & (b == 255) & (a > 0)

    ys, xs = np.where(mask)
    if len(xs) == 0 or len(ys) == 0:
        return None  # No mask found

    x1, y1 = np.min(xs), np.min(ys)
    x2, y2 = np.max(xs), np.max(ys)
    return [int(x1), int(y1), int(x2), int(y2)]


@click.command()
@click.argument('mask_folder', type=click.Path(exists=True, file_okay=False))
@click.option('--output', default='reconstructed_trackJSON.json', help='Output JSON filename')
def reconstruct(mask_folder, output):
    track_data = {'tracks': {}, 'groups': {}, 'version': 2}

    for track_id in sorted(os.listdir(mask_folder)):
        track_path = os.path.join(mask_folder, track_id)
        if not os.path.isdir(track_path):
            continue

        features = []
        frame_files = sorted(f for f in os.listdir(track_path) if f.endswith('.png'))
        for fname in frame_files:
            frame_id = int(os.path.splitext(fname)[0])
            img_path = os.path.join(track_path, fname)

            with Image.open(img_path) as img:
                bounds = get_mask_bounds(img)
                if bounds is None:
                    print(f"Warning: Empty mask in {img_path}, skipping.")
                    bounds = [0, 0, 0, 0]

            feature = {
                'frame': frame_id,
                'flick': frame_id * 100000,
                'bounds': bounds,
                'attributes': {},
                'hasMask': True,
                'interpolate': False,
                'keyframe': True
            }
            features.append(feature)

        if not features:
            print(f"No valid features found for track {track_id}, skipping.")
            continue

        features.sort(key=lambda f: f['frame'])

        frame_ids = [f['frame'] for f in features]
        track = {
            'begin': min(frame_ids),
            'end': max(frame_ids),
            'id': int(track_id),
            'confidencePairs': [['fromMask', 1.0]],
            'attributes': {},
            'meta': {},
            'features': features
        }

        track_data['tracks'][track_id] = track

    with open(output, 'w') as f:
        json.dump(track_data, f, indent=2)
    print(f'Reconstructed track JSON written to {output}')


if __name__ == '__main__':
    reconstruct()
