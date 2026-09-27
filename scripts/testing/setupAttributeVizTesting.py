# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "click",
#     "girder-client",
#     "setuptools",
# ]
# ///
"""Upload sample tracks, attributes, swimlanes, and DiveConfig for attribute viz testing."""

from __future__ import annotations

import json
from pathlib import Path

import click
import girder_client

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR / "attribute-viz-testing"
DEFAULT_FOLDER_ID = "6a93364715d175ac1169888e"
DEFAULT_VIDEO = Path.home() / "Downloads" / "t.2x.mp4"
FALLBACK_VIDEO = Path.home() / "Downloads" / "tx2.mp4"


def login(host: str, port: int, scheme: str, user: str | None, password: str | None, api_key: str | None):
    gc = girder_client.GirderClient(host, port=port, apiRoot="girder/api/v1", scheme=scheme)
    if api_key:
        gc.authenticate(apiKey=api_key)
    elif user and password:
        gc.authenticate(username=user, password=password)
    else:
        gc.authenticate(interactive=True)
    me = gc.get("/user/me")
    if not me:
        raise click.ClickException("Authentication failed")
    click.echo(f"Authenticated as {me['login']}")
    return gc


def resolve_video(video: Path | None) -> Path:
    candidates = [video, DEFAULT_VIDEO, FALLBACK_VIDEO, Path.home() / "Downloads" / "SampleVideo.mp4"]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    raise click.ClickException(
        "No video found. Pass --video or place t.2x.mp4 / tx2.mp4 in ~/Downloads"
    )


def upload_video_if_needed(gc: girder_client.GirderClient, folder_id: str, video: Path) -> None:
    items = list(gc.listItem(folder_id))
    if items:
        click.echo(f"Folder already has {len(items)} item(s); skipping video upload")
        return
    click.echo(f"Uploading video: {video}")
    gc.uploadFileToFolder(folder_id, str(video), filename=video.name)
    gc.addMetadataToFolder(
        folder_id,
        {"fps": 30, "annotate": True, "type": "video", "originalFPS": 30},
    )
    click.echo("Running postprocess…")
    gc.post(f"dive_rpc/postprocess/{folder_id}", data={"skipTranscoding": True})


def upload_tracks(gc: girder_client.GirderClient, folder_id: str, tracks_path: Path) -> None:
    with tracks_path.open() as fh:
        tracks = json.load(fh)
    click.echo(f"Uploading tracks from {tracks_path.name}")
    gc.sendRestRequest(
        "POST",
        "dive_annotation/process_json",
        parameters={"folderId": folder_id, "additive": False},
        json=tracks,
        jsonResp=False,
    )


def patch_json(gc: girder_client.GirderClient, route: str, payload: dict) -> dict:
    return gc.sendRestRequest("PATCH", route.lstrip("/"), json=payload)


@click.command()
@click.option("--folder-id", default=DEFAULT_FOLDER_ID, show_default=True)
@click.option("--host", default="127.0.0.1", show_default=True)
@click.option("--port", default=8010, show_default=True, type=int)
@click.option("--scheme", default="http", show_default=True)
@click.option("--user", default="admin", show_default=True, help="Girder username (local default)")
@click.option("--password", default="letmein", show_default=True, help="Girder password (local default)")
@click.option("--api-key", default=None, help="Girder API key (overrides user/password)")
@click.option("--video", type=click.Path(path_type=Path), default=None, help="Video file to upload")
@click.option("--skip-video", is_flag=True, help="Skip video upload/postprocess")
def main(
    folder_id: str,
    host: str,
    port: int,
    scheme: str,
    user: str | None,
    password: str | None,
    api_key: str | None,
    video: Path | None,
    skip_video: bool,
) -> None:
    """Set up AttributeVizTesting dataset with sample annotations and DiveConfig."""
    folder = None
    gc = login(host, port, scheme, user, password, api_key)

    try:
        folder = gc.getFolder(folder_id)
    except Exception as exc:
        raise click.ClickException(f"Could not access folder {folder_id}: {exc}") from exc
    click.echo(f"Target folder: {folder['name']} ({folder_id})")

    if not skip_video:
        video_path = resolve_video(video)
        if video_path != FALLBACK_VIDEO and not video_path.name.startswith("tx2"):
            click.echo(
                click.style(
                    f"Note: using {video_path.name} (tx2.mp4 was not found; t.2x.mp4 is likely the intended file)",
                    fg="yellow",
                )
            )
        upload_video_if_needed(gc, folder_id, video_path)

    tracks_path = DATA_DIR / "tracks.json"
    attributes_path = DATA_DIR / "attributes.json"
    swimlanes_path = DATA_DIR / "swimlanes.json"
    config_path = DATA_DIR / "dive-config.json"

    for path in (tracks_path, attributes_path, swimlanes_path, config_path):
        if not path.exists():
            raise click.ClickException(f"Missing data file: {path}")

    upload_tracks(gc, folder_id, tracks_path)

    with attributes_path.open() as fh:
        attributes = json.load(fh)
    click.echo("Patching attribute definitions (customUI, value colors, buttons)…")
    patch_json(gc, f"/dive_dataset/{folder_id}/attributes", attributes)

    with swimlanes_path.open() as fh:
        swimlanes = json.load(fh)
    click.echo("Patching swimlane graphs…")
    patch_json(gc, f"/dive_dataset/{folder_id}/swimlanes", swimlanes)

    with config_path.open() as fh:
        config = json.load(fh)
    click.echo("Patching DiveConfig (UI visibility, customUI panel, timeline layout)…")
    patch_json(gc, f"/dive_dataset/{folder_id}/configuration", config)

    click.echo(
        click.style(
            f"\nDone! Open http://{host}:{port}/dive?dataset={folder_id} to test attribute viz features.",
            fg="green",
        )
    )


if __name__ == "__main__":
    main()
