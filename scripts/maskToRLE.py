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
        #'file_name': os.path.basename(png_path),
        #'path': os.path.abspath(png_path),
        #'width': width,
        #'height': height,
        'rle': rle
    }

@click.command()
@click.argument('input_folder', type=click.Path(exists=True, file_okay=False))
@click.argument('output_json', type=click.Path())
def pngs_to_rle(input_folder, output_json):
    """Process INPUT_FOLDER recursively, encode PNGs to COCO RLE, and save as OUTPUT_JSON."""

    results = []

    for root, _, files in os.walk(input_folder):
        for file in files:
            if file.lower().endswith('.png'):
                png_path = os.path.join(root, file)
                item = encode_png_to_rle(png_path)
                results.append(item)

    with open(output_json, 'w') as f:
        json.dump(results, f)

    click.echo(f"Finished! {len(results)} PNG files processed into {output_json}")

if __name__ == '__main__':
    pngs_to_rle()
