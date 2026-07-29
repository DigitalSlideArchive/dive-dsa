# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "click",
#     "girder-client",
#     "setuptools",
# ]
# ///
"""Create DIVE datasets from a metadata CSV and emit an import-ready CSV.

Reads rows that include a Filename column, creates a Girder/DIVE dataset folder
per unique filename under a root folder, then writes a CSV with DIVEDataset set
to the new folder IDs (plus all other original columns).

Example:
  uv run scripts/testing/createDatasetsFromCsv.py \\
    /path/to/input.csv ROOT_FOLDER_ID
"""

from __future__ import annotations

import csv
import re
import subprocess
import tempfile
from collections import Counter
from pathlib import Path

import click
import girder_client

# Import matching: DIVEDataset → DIVE_DatasetId → Filename (+ DIVE_Path if needed).
_FILENAME_ALIASES = ("Filename", "filename", "DIVE_Name", "DIVE_Filename")
_ID_COLUMNS = ("DIVEDataset", "DIVE_DatasetId", "DIVE_DatasetID")


def login(
    host: str,
    port: int,
    api_key: str | None,
    scheme: str,
) -> girder_client.GirderClient:
    gc = girder_client.GirderClient(
        host, port=port, apiRoot="girder/api/v1", scheme=scheme
    )
    if api_key:
        gc.authenticate(apiKey=api_key)
    else:
        gc.authenticate(interactive=True)
    return gc


def uniquify_headers(headers: list[str]) -> list[str]:
    """Make duplicate CSV headers unique (pandas-style: name, name.1, name.2, …)."""
    seen: Counter[str] = Counter()
    out: list[str] = []
    for raw in headers:
        name = (raw or "").strip() or "unnamed"
        count = seen[name]
        seen[name] += 1
        out.append(name if count == 0 else f"{name}.{count}")
    return out


def read_csv_rows(csv_path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with csv_path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.reader(fh)
        try:
            headers = next(reader)
        except StopIteration as exc:
            raise click.ClickException(f"CSV is empty: {csv_path}") from exc
        headers = uniquify_headers(headers)
        rows: list[dict[str, str]] = []
        for line in reader:
            if not any(cell.strip() for cell in line):
                continue
            # Pad / trim to header length
            padded = list(line) + [""] * max(0, len(headers) - len(line))
            rows.append(dict(zip(headers, padded[: len(headers)])))
    return headers, rows


def resolve_filename_column(headers: list[str]) -> str:
    for alias in _FILENAME_ALIASES:
        if alias in headers:
            return alias
    raise click.ClickException(
        "CSV must include a Filename column (or filename / DIVE_Name). "
        f"Found columns: {headers}"
    )


def warn_about_csv_issues(headers: list[str], rows: list[dict[str, str]]) -> None:
    base_names = [re.sub(r"\.\d+$", "", h) for h in headers]
    dups = {name for name, n in Counter(base_names).items() if n > 1}
    if dups:
        click.echo(
            click.style(
                f"Warning: duplicate CSV headers detected (renamed for uniqueness): {sorted(dups)}. "
                "pandas import renames these the same way (e.g. '0' → '0.1').",
                fg="yellow",
            )
        )
    if "DIVE_DatasetId" in headers and "DIVEDataset" not in headers:
        click.echo(
            click.style(
                "Note: CSV has DIVE_DatasetId but not DIVEDataset. "
                "Bulk import will match on DIVE_DatasetId before Filename; "
                "prefer emitting DIVEDataset (current folder ids) for round-trips.",
                fg="yellow",
            )
        )
    empty_names = sum(1 for r in rows if not (r.get(resolve_filename_column(headers), "").strip()))
    if empty_names:
        click.echo(
            click.style(f"Warning: {empty_names} row(s) have an empty Filename.", fg="yellow")
        )


def ensure_sample_video(cache_dir: Path) -> Path:
    video_path = cache_dir / "SampleVideo.mp4"
    if video_path.exists() and video_path.stat().st_size > 0:
        return video_path
    click.echo("Generating placeholder SampleVideo.mp4 via ffmpeg…")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=640x360:rate=30",
            "-t",
            "1",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(video_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return video_path


def find_existing_dataset(
    gc: girder_client.GirderClient, parent_id: str, name: str
) -> dict | None:
    matches = list(gc.listFolder(parent_id, name=name, limit=2))
    return matches[0] if matches else None


def create_dive_dataset(
    gc: girder_client.GirderClient,
    parent_id: str,
    filename: str,
    sample_video: Path,
    *,
    reuse_existing: bool,
    skip_postprocess: bool,
) -> tuple[str, bool]:
    """Create (or reuse) a DIVE dataset folder named ``filename``.

    Returns (folder_id, created_new).
    """
    existing = find_existing_dataset(gc, parent_id, filename)
    if existing and reuse_existing:
        return str(existing["_id"]), False
    if existing and not reuse_existing:
        raise click.ClickException(
            f"Folder already exists for Filename={filename!r} ({existing['_id']}). "
            "Pass --reuse-existing to keep it, or remove/rename the folder."
        )

    folder = gc.createFolder(parentId=parent_id, name=filename, reuseExisting=False)
    folder_id = str(folder["_id"])
    gc.uploadFileToFolder(folder_id, str(sample_video), filename=filename)
    gc.addMetadataToFolder(
        folder_id,
        {"fps": 30, "annotate": True, "type": "video", "originalFPS": 30},
    )
    if not skip_postprocess:
        gc.post(f"dive_rpc/postprocess/{folder_id}", data={"skipTranscoding": True})
    return folder_id, True


def build_output_headers(headers: list[str]) -> list[str]:
    """Ensure DIVEDataset is the first column; drop stale id aliases from the middle."""
    rest = [h for h in headers if h not in _ID_COLUMNS]
    return ["DIVEDataset", *rest]


def write_output_csv(
    path: Path,
    headers: list[str],
    rows: list[dict[str, str]],
    filename_col: str,
    id_by_filename: dict[str, str],
) -> None:
    out_headers = build_output_headers(headers)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=out_headers, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            name = row.get(filename_col, "").strip()
            if not name or name not in id_by_filename:
                continue
            out = {h: row.get(h, "") for h in out_headers if h != "DIVEDataset"}
            out["DIVEDataset"] = id_by_filename[name]
            # Keep Filename canonical even if source used an alias
            if "Filename" in out_headers:
                out["Filename"] = name
            writer.writerow(out)


@click.command()
@click.argument("csv_file", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.argument("root_folder_id")
@click.option(
    "--output",
    "-o",
    type=click.Path(dir_okay=False, path_type=Path),
    default=None,
    help="Output CSV path (default: <script_dir>/<input>_with_dive_ids.csv)",
)
@click.option("--host", default="127.0.0.1", show_default=True, help="Girder host")
@click.option("--port", "-p", default=8010, show_default=True, type=int, help="Girder port")
@click.option(
    "--scheme",
    default="http",
    show_default=True,
    type=click.Choice(["http", "https"], case_sensitive=False),
)
@click.option("--api-key", default=None, envvar="GIRDER_API_KEY", help="Girder API key")
@click.option(
    "--limit",
    "-n",
    default=-1,
    show_default=True,
    type=int,
    help="Only process the first N unique filenames (-1 = all)",
)
@click.option(
    "--reuse-existing/--no-reuse-existing",
    default=True,
    show_default=True,
    help="Reuse an existing folder with the same Filename under the root",
)
@click.option(
    "--skip-postprocess/--postprocess",
    default=False,
    show_default=True,
    help="Skip dive_rpc/postprocess (faster; datasets may need postprocess later)",
)
@click.option(
    "--dry-run",
    is_flag=True,
    default=False,
    help="Parse CSV and report actions without creating folders",
)
def main(
    csv_file: Path,
    root_folder_id: str,
    output: Path | None,
    host: str,
    port: int,
    scheme: str,
    api_key: str | None,
    limit: int,
    reuse_existing: bool,
    skip_postprocess: bool,
    dry_run: bool,
) -> None:
    """Create DIVE datasets from CSV_FILE under ROOT_FOLDER_ID and write an import CSV.

    Each unique Filename becomes a dataset folder (named exactly as Filename).
    The output CSV sets DIVEDataset to the created folder id so bulk metadata
    import can match by id.
    """
    headers, rows = read_csv_rows(csv_file)
    filename_col = resolve_filename_column(headers)
    warn_about_csv_issues(headers, rows)

    # Preserve first-seen order of filenames
    unique_filenames: list[str] = []
    seen: set[str] = set()
    for row in rows:
        name = row.get(filename_col, "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        unique_filenames.append(name)

    if limit >= 0:
        unique_filenames = unique_filenames[:limit]

    script_dir = Path(__file__).resolve().parent
    out_path = output or (script_dir / f"{csv_file.stem}_with_dive_ids.csv")
    click.echo(
        f"CSV={csv_file} rows={len(rows)} unique_filenames={len(unique_filenames)} "
        f"root={root_folder_id}"
    )

    if dry_run:
        for name in unique_filenames[:20]:
            click.echo(f"  would create dataset: {name}")
        if len(unique_filenames) > 20:
            click.echo(f"  … and {len(unique_filenames) - 20} more")
        click.echo(f"Would write: {out_path}")
        return

    click.echo(f"Connecting to {scheme}://{host}:{port}/girder/api/v1 …")
    gc = login(host, port, api_key, scheme)
    parent = gc.getFolder(root_folder_id)
    click.echo(f"Root folder: {parent['name']} ({root_folder_id})")

    id_by_filename: dict[str, str] = {}
    created = 0
    reused = 0

    with tempfile.TemporaryDirectory(prefix="dive-csv-datasets-") as tmp:
        sample_video = ensure_sample_video(Path(tmp))
        with click.progressbar(
            unique_filenames, label="Creating datasets", show_pos=True
        ) as bar:
            for name in bar:
                folder_id, was_created = create_dive_dataset(
                    gc,
                    root_folder_id,
                    name,
                    sample_video,
                    reuse_existing=reuse_existing,
                    skip_postprocess=skip_postprocess,
                )
                id_by_filename[name] = folder_id
                if was_created:
                    created += 1
                else:
                    reused += 1

    write_output_csv(out_path, headers, rows, filename_col, id_by_filename)
    click.echo(
        f"Done. created={created} reused={reused} output={out_path} "
        f"(DIVEDataset column ready for Import Metadata)"
    )
    click.echo(
        "Next: create/index a DIVE metadata set over this root, then import the output CSV."
    )


if __name__ == "__main__":
    main()
