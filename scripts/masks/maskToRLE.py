import os
import json
import click
import numpy as np
from PIL import Image
from pycocotools import mask as mask_utils

def encode_png_to_rle(png_path):
    # Load image and convert to binary mask (0,1)
    img = Image.open(png_path).convert('1')
    np_img = np.array(img)

    height, width = np_img.shape

    # COCO expects Fortran order and uint8
    rle = mask_utils.encode(np.asfortranarray(np_img.astype(np.uint8)))
    rle['counts'] = rle['counts'].decode('utf-8')  # Make JSON serializable

    return {
        'size': [width, height],
        'counts': rle['counts']
    }

@click.command()
@click.argument('input_folder', type=click.Path(exists=True, file_okay=False))
@click.argument('output_json', type=click.Path())
def pngs_to_rle(input_folder, output_json):
    """
    Process INPUT_FOLDER recursively, encode PNGs to COCO RLE,
    and save as nested JSON: {trackId: {frameId: {size, counts}}}.
    """
    results = {}

    for root, _, files in os.walk(input_folder):
        track_id = os.path.relpath(root, input_folder)
        if track_id == '.':
            continue  # Skip the root folder itself

        for file in files:
            if file.lower().endswith('.png'):
                frame_id, _ = os.path.splitext(file)
                png_path = os.path.join(root, file)

                rle_obj = encode_png_to_rle(png_path)

                # Initialize track if not seen yet
                if track_id not in results:
                    results[track_id] = {}

                results[track_id][frame_id] = { 'rle': rle_obj }

    with open(output_json, 'w') as f:
        json.dump(results, f)

    total_images = sum(len(frames) for frames in results.values())
    click.echo(f"Finished! {total_images} PNG files processed into {output_json}")

if __name__ == '__main__':
    pngs_to_rle()
