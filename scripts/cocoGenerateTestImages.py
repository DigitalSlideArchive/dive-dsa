# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "click",
#     "pillow",
# ]
# ///
"""Generate placeholder images for each entry in a COCO/KWCOCO images list."""

from __future__ import annotations

import json
from pathlib import Path

import click
from PIL import Image, ImageDraw, ImageFont


def require_image_size(image: dict) -> tuple[int, int]:
    missing = [key for key in ("width", "height") if key not in image]
    if missing:
        image_id = image.get("id", "?")
        file_name = image.get("file_name", "?")
        raise click.ClickException(
            f"Image id={image_id} file_name={file_name!r} "
            f"is missing: {', '.join(missing)}"
        )

    width = int(image["width"])
    height = int(image["height"])
    if width <= 0 or height <= 0:
        raise click.ClickException(
            f"Image id={image.get('id', '?')} "
            f"has invalid size: {width}x{height}"
        )
    return width, height


def background_color(image_id: object) -> tuple[int, int, int]:
    seed = int(image_id) if isinstance(image_id, int) else hash(str(image_id))
    return (
        (seed * 37) % 200 + 40,
        (seed * 59) % 200 + 40,
        (seed * 83) % 200 + 40,
    )


def pil_format(path: Path) -> str | None:
    ext = path.suffix.lower().lstrip(".")
    return {
        "jpg": "JPEG",
        "jpeg": "JPEG",
        "png": "PNG",
        "webp": "WEBP",
        "bmp": "BMP",
        "tif": "TIFF",
        "tiff": "TIFF",
    }.get(ext)


def write_test_image(image: dict, output_path: Path) -> None:
    image_id = image.get("id", "?")
    file_name = image["file_name"]
    width, height = require_image_size(image)

    img = Image.new("RGB", (width, height), background_color(image_id))
    draw = ImageDraw.Draw(img)

    step = max(32, min(width, height) // 12)
    for y in range(0, height, step):
        for x in range(0, width, step):
            if ((x // step) + (y // step)) % 2:
                draw.rectangle([x, y, x + step, y + step], fill=(220, 220, 220))

    lines = [f"id: {image_id}", Path(file_name).name, f"{width} x {height}"]
    if "frame_index" in image:
        lines.append(f"frame: {image['frame_index']}")

    try:
        font = ImageFont.load_default(size=min(24, max(12, height // 24)))
    except TypeError:
        font = ImageFont.load_default()

    draw.multiline_text(
        (8, 8), "\n".join(lines), fill=(0, 0, 0), font=font, spacing=4
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    save_format = pil_format(output_path)
    if save_format == "JPEG":
        img.save(output_path, format=save_format, quality=90)
    else:
        img.save(output_path, format=save_format)


@click.command()
@click.argument(
    "coco_json",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
)
@click.option(
    "--output-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=None,
    help=(
        "Output directory "
        "(default: <coco-stem>_images next to the JSON file)."
    ),
)
@click.option(
    "--overwrite",
    is_flag=True,
    help="Replace images that already exist.",
)
def main(coco_json: Path, output_dir: Path | None, overwrite: bool) -> None:
    """Create test images named and sized per COCO/KWCOCO images list."""
    with coco_json.open(encoding="utf-8") as fp:
        data = json.load(fp)

    images = data.get("images")
    if not images:
        raise click.ClickException("COCO JSON has no 'images' list.")

    if output_dir is None:
        output_dir = coco_json.with_name(f"{coco_json.stem}_images")

    output_dir.mkdir(parents=True, exist_ok=True)
    created = 0
    skipped = 0

    for image in images:
        if "file_name" not in image:
            raise click.ClickException(
                f"Image entry missing file_name: {image!r}"
            )

        relative = Path(image["file_name"])
        if relative.is_absolute():
            raise click.ClickException(
                f"file_name must be relative: {image['file_name']!r}"
            )

        out_path = output_dir / relative
        if out_path.exists() and not overwrite:
            skipped += 1
            continue

        write_test_image(image, out_path)
        created += 1

    click.echo(f"Wrote {created} image(s) to {output_dir}")
    if skipped:
        click.echo(
            f"Skipped {skipped} existing file(s) "
            "(use --overwrite to replace)."
        )


if __name__ == "__main__":
    main()
