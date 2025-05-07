import json
import os
from pathlib import Path

import click
import numpy as np
from PIL import Image
from pycocotools import mask as mask_utils


@click.command()
@click.argument('json_file', type=click.Path(exists=True))
@click.argument('output_dir', type=click.Path())
def export_masks(json_file, output_dir):
    """
    Export RLE masks from JSON_FILE to OUTPUT_DIR.
    
    JSON_FILE structure:
    {
        "trackId1": {
            "frameId1": {"size": [width, height], "counts": "<RLE string>"},
            "frameId2": {...},
            ...
        },
        "trackId2": {...}
    }
    
    OUTPUT_DIR will contain subfolders for each trackId and PNGs named by frameId.
    """
    # Ensure output directory exists
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    with open(json_file, 'r') as f:
        data = json.load(f)

    for track_id, frames in data.items():
        track_dir = output_path / str(track_id)
        track_dir.mkdir(exist_ok=True)

        for frame_id, base_obj in frames.items():
            rle_obj = base_obj.get('rle')
            size = rle_obj.get('size')
            counts = rle_obj.get('counts')
            
            if size is None or counts is None:
                click.echo(f"Skipping {track_id}/{frame_id}: missing size or counts")
                continue

            # COCO RLE expects: {'size': [height, width], 'counts': str}
            rle = {
                'size': [size[1], size[0]],  # [height, width]
                'counts': counts
            }

            try:
                mask = mask_utils.decode(rle)  # returns (height, width, 1) or (height, width)
                if len(mask.shape) == 3:
                    mask = mask[:, :, 0]
            except Exception as e:
                click.echo(f"Failed to decode RLE for {track_id}/{frame_id}: {e}")
                continue

            # Convert to PIL Image
            img = Image.fromarray((mask * 255).astype(np.uint8))

            output_file = track_dir / f"{frame_id}.png"
            img.save(output_file)
            click.echo(f"Saved {output_file}")

    click.echo("Export complete.")


if __name__ == '__main__':
    export_masks()
