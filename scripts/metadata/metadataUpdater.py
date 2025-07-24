# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "click",
#     "Faker",
# ]
# ///
import json
import random
import click
from faker import Faker
from pathlib import Path

fake = Faker()


# Mapping of type to faker function
FAKER_TYPE_MAP = {
    "name": lambda: fake.name(),
    "first_name": lambda: fake.first_name(),
    "last_name": lambda: fake.last_name(),
    "address": lambda: fake.street_address(),
    "city": lambda: fake.city(),
    "state": lambda: fake.state_abbr(),
    "zip": lambda: fake.zipcode(),
    "email": lambda: fake.email(),
    "phone": lambda: fake.phone_number(),
    "number": lambda min_val, max_val: random.randint(min_val, max_val),
    "float": lambda min_val, max_val: round(random.uniform(min_val, max_val), 2),
    "word": lambda: fake.word(),
    "date": lambda: fake.date(),
}


@click.command()
@click.argument("input_file", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--output-dir", "-o", default="output", type=click.Path(file_okay=False, path_type=Path), help="Directory to write output files")
@click.option("--new-key", "-k", required=True, help="Key to add to each metadata object")
@click.option("--type", "value_type", required=True, type=click.Choice(list(FAKER_TYPE_MAP.keys())), help="Type of fake data to generate")
@click.option("--min", "min_val", default=0, type=int, help="Min value for number/float types")
@click.option("--max", "max_val", default=100, type=int, help="Max value for number/float types")
def generate_bulk_metadata(input_file, output_dir, new_key, value_type, min_val, max_val):
    """
    Analyze a JSON file of metadata objects and create two JSON outputs:
    one with matchers by DIVEDataset, and one with matchers by Filename.
    """
    with input_file.open() as f:
        data = json.load(f)

    matcher_by_dataset = []
    matcher_by_filename = []

    for item in data:
        if value_type in {"number", "float"}:
            value = FAKER_TYPE_MAP[value_type](min_val, max_val)
        else:
            value = FAKER_TYPE_MAP[value_type]()

        metadata = {new_key: value}

        if "DIVEDataset" in item:
            matcher_by_dataset.append({
                "matcher": {"datasetId": item["DIVEDataset"]},
                "metadata": metadata
            })
        if "Filename" in item:
            matcher_by_filename.append({
                "matcher": {"videoName": item["Filename"]},
                "metadata": metadata
            })

    output_dir.mkdir(parents=True, exist_ok=True)

    dataset_path = output_dir / "bulk_update_by_dataset.json"
    filename_path = output_dir / "bulk_update_by_filename.json"

    with dataset_path.open("w") as f:
        json.dump(matcher_by_dataset, f, indent=2)

    with filename_path.open("w") as f:
        json.dump(matcher_by_filename, f, indent=2)

    click.echo(f"✅ Generated {len(matcher_by_dataset)} entries using DIVEDataset → {dataset_path}")
    click.echo(f"✅ Generated {len(matcher_by_filename)} entries using Filename → {filename_path}")


if __name__ == "__main__":
    generate_bulk_metadata()
