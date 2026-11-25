# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "click",
#     "faker",
#     "girder-client",
#     "setuptools",
# ]
# ///
"""Seed N lightweight DIVE datasets + matching NDJSON for metadata scale tests.

Creates folder trees marked annotate:true (no video upload / postprocess) so
timing measures metadata ingest rather than the media pipeline.
"""
from __future__ import annotations

import json
import os
import random
import string
import time
from datetime import date, timedelta
from typing import Any

import click
import girder_client
from faker import Faker

fake = Faker()

ANATOMY_OPTIONS = [
    "heart",
    "lungs",
    "liver",
    "kidney",
    "brain",
    "colon",
    "stomach",
    "pancreas",
    "spleen",
    "bladder",
]

DATASET_META = {
    "fps": 30,
    "annotate": True,
    "type": "video",
    "originalFPS": 30,
}


def login(api_url: str, port: int, api_key: str | None) -> girder_client.GirderClient:
    gc = girder_client.GirderClient(
        api_url, port=port, apiRoot="api/v1", scheme="http"
    )
    if api_key:
        gc.authenticate(apiKey=api_key)
    else:
        gc.authenticate(interactive=True)
    return gc


def sanitize_folder_name(name: str) -> str:
    """Girder folder names cannot contain '/' or be empty."""
    cleaned = name.replace("/", "-").replace("\\", "-").strip()
    return cleaned or "unnamed"


def generate_patient_id() -> str:
    return "P" + "".join(random.choices(string.digits, k=6))


def generate_sample_date() -> str:
    start = date(2000, 1, 1)
    end = date.today()
    return (start + timedelta(days=random.randint(0, (end - start).days))).strftime(
        "%Y-%m-%d"
    )


def generate_records(count: int) -> list[dict[str, Any]]:
    """Build NDJSON rows with Key paths under rawdata/ for process_metadata matching."""
    records: list[dict[str, Any]] = []
    seen_filenames: set[str] = set()
    for i in range(count):
        patient_id = generate_patient_id()
        filename = f"{patient_id}_scan_{i:05d}.mp4"
        while filename in seen_filenames:
            patient_id = generate_patient_id()
            filename = f"{patient_id}_scan_{i:05d}.mp4"
        seen_filenames.add(filename)

        city = sanitize_folder_name(fake.city())
        hospital = sanitize_folder_name(f"{fake.company()} Hospital")
        height = random.randint(58, 78)
        weight = random.randint(100, 250)
        # Prefix with rawdata/ so process_metadata path matching against the
        # rawdata child of the seed root succeeds.
        key = f"rawdata/{city}/{hospital}/{filename}"
        records.append(
            {
                "Filename": filename,
                "Key": key,
                "SampleDate": generate_sample_date(),
                "PatientName": fake.name(),
                "Age": random.randint(1, 100),
                "PatientId": patient_id,
                "Anatomy": random.choice(ANATOMY_OPTIONS),
                "Height": height,
                "Weight": weight,
                "City": city,
                "State": fake.state_abbr(),
                "ZipCode": fake.zipcode(),
            }
        )
    return records


def load_ndjson(path: str) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                data.append(json.loads(line))
    return data


def write_ndjson(path: str, records: list[dict[str, Any]]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        for item in records:
            handle.write(json.dumps(item) + "\n")


def get_or_create_child(
    gc: girder_client.GirderClient, parent_id: str, name: str
) -> str:
    existing = list(gc.listFolder(parent_id, name=name))
    if existing:
        return str(existing[0]["_id"])
    created = gc.createFolder(parentId=parent_id, name=name, reuseExisting=True)
    return str(created["_id"])


def ensure_dataset_folder(
    gc: girder_client.GirderClient,
    root_id: str,
    key_path: str,
    path_cache: dict[str, str],
) -> str:
    """Create rawdata/city/hospital/filename folders; set annotate on the leaf."""
    parts = [p for p in key_path.split("/") if p]
    if not parts:
        raise click.ClickException(f"Empty Key path: {key_path!r}")

    parent_id = root_id
    cumulative = ""
    for part in parts:
        cumulative = f"{cumulative}/{part}" if cumulative else part
        if cumulative in path_cache:
            parent_id = path_cache[cumulative]
            continue
        folder_id = get_or_create_child(gc, parent_id, part)
        path_cache[cumulative] = folder_id
        parent_id = folder_id

    leaf_id = parent_id
    gc.addMetadataToFolder(leaf_id, DATASET_META)
    return leaf_id


@click.command(name="SeedMetadataScale")
@click.option("--count", default=10000, show_default=True, help="Number of datasets to seed")
@click.option("--root-folder-id", required=True, help="Parent Girder folder for the test root")
@click.option(
    "--test-root-name",
    default="metadata_scale_test",
    show_default=True,
    help="Name of the dedicated test root folder created under --root-folder-id",
)
@click.option("--api-url", default="127.0.0.1", show_default=True)
@click.option("--port", default=8010, show_default=True, type=int)
@click.option("--api-key", default=None, envvar="GIRDER_API_KEY", help="Optional API key")
@click.option(
    "--ndjson",
    "ndjson_path",
    default=None,
    help="Existing NDJSON to seed from (skips generation)",
)
@click.option(
    "--output",
    default="scale_test.ndjson",
    show_default=True,
    help="Local NDJSON path to write (and upload under info/)",
)
@click.option(
    "--batch-report",
    default=100,
    show_default=True,
    type=int,
    help="Print progress every N datasets",
)
def seed_metadata_scale(
    count: int,
    root_folder_id: str,
    test_root_name: str,
    api_url: str,
    port: int,
    api_key: str | None,
    ndjson_path: str | None,
    output: str,
    batch_report: int,
) -> None:
    """Create N annotate:true folders + matching NDJSON under info/."""
    started = time.perf_counter()
    gc = login(api_url, port, api_key)

    parent = gc.getFolder(root_folder_id)
    click.echo(f"Using parent folder: {parent['name']} ({root_folder_id})")

    test_root_id = get_or_create_child(gc, root_folder_id, test_root_name)
    rawdata_id = get_or_create_child(gc, test_root_id, "rawdata")
    info_id = get_or_create_child(gc, test_root_id, "info")
    click.echo(f"Test root: {test_root_name} ({test_root_id})")
    click.echo(f"rawdata: {rawdata_id}")
    click.echo(f"info: {info_id}")

    if ndjson_path:
        records = load_ndjson(ndjson_path)
        click.echo(f"Loaded {len(records)} records from {ndjson_path}")
        if len(records) > count:
            records = records[:count]
            click.echo(f"Truncated to --count {count}")
        output_path = ndjson_path
    else:
        records = generate_records(count)
        write_ndjson(output, records)
        output_path = output
        click.echo(f"Generated {len(records)} records → {output_path}")

    # path_cache keys are relative to test root (include rawdata/...)
    path_cache: dict[str, str] = {"rawdata": rawdata_id}
    created = 0
    for index, record in enumerate(records, start=1):
        key = record.get("Key")
        if not key:
            raise click.ClickException(f"Record {index} missing Key")
        ensure_dataset_folder(gc, test_root_id, key, path_cache)
        created += 1
        if batch_report > 0 and index % batch_report == 0:
            elapsed = time.perf_counter() - started
            click.echo(f"Seeded {index}/{len(records)} datasets ({elapsed:.1f}s)")

    # Upload NDJSON (replace prior scale_test.ndjson item if present)
    remote_name = os.path.basename(output_path)
    for item in gc.listItem(info_id, name=remote_name):
        click.echo(f"Removing existing info item: {item['name']}")
        gc.delete(f"item/{item['_id']}")

    click.echo(f"Uploading {output_path} → info/{remote_name}")
    gc.uploadFileToFolder(info_id, output_path, filename=remote_name)

    elapsed = time.perf_counter() - started
    click.echo("")
    click.echo("Seed complete")
    click.echo(f"  test_root_id: {test_root_id}")
    click.echo(f"  datasets:     {created}")
    click.echo(f"  ndjson:       info/{remote_name}")
    click.echo(f"  wall_time_s:  {elapsed:.2f}")
    click.echo("")
    click.echo("Next:")
    click.echo(
        f"  uv run scripts/metadata/run_metadata_scale_test.py "
        f"--root-folder-id {test_root_id} --timeout 3600 --phases A,B"
    )


if __name__ == "__main__":
    seed_metadata_scale()
