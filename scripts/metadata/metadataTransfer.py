# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "click",
# ]
# ///
import json
import click
from pathlib import Path

DEFAULT_KEYS = [
    "Average Throttle",
    "Average Battery",
    "Total Crashes",
    "Recovered Crashes",
    "Ending Crashes"
]

@click.command()
@click.argument("input_file", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option(
    "--keys", "-k",
    multiple=True,
    default=DEFAULT_KEYS,
    show_default=True,
    help="Metadata keys to include in output (use multiple times or defaults to common drone fields)"
)
@click.option(
    "--output-file", "-o",
    type=click.Path(dir_okay=False, path_type=Path),
    default="matcher_by_filename.json",
    show_default=True,
    help="Output JSON file"
)
def extract_selected_metadata(input_file, keys, output_file):
    """
    Create a new metadata file where each entry matches by videoName (from DIVE_Name),
    and includes only the specified metadata keys.
    """
    with input_file.open() as f:
        data = json.load(f)

    output = []

    for item in data:
        video_name = item.get("DIVE_Name")
        if not video_name:
            continue  # Skip entries without DIVE_Name

        metadata = {}
        for key in keys:
            if key in item:
                metadata[key] = item[key]

        if metadata:
            output.append({
                "matcher": {"videoName": video_name},
                "metadata": metadata
            })

    with output_file.open("w") as f:
        json.dump(output, f, indent=2)

    click.echo(f"✅ Wrote {len(output)} entries to {output_file}")


if __name__ == "__main__":
    extract_selected_metadata()
