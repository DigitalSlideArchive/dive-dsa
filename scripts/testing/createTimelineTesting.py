# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "click",
#     "girder-client",
# ]
# ///
"""Create timeline (numeric graph) rendering datasets under <admin>/TimelineTesting.

Reproduces the report that zoomed-out numeric timelines on long videos draw
long "triangle" ramps after single-frame spikes instead of a narrow up/down
pulse. The customer video was ~8h15m at ~25 fps (~742k frames) with one
full-length track whose numeric attributes sit at 0 and spike for a frame.

Datasets:

  * long-8h-dense-spikes   742,500 frames, attribute value on EVERY frame
                           (0 baseline + 1-frame / short spikes). Expected to
                           show the triangles when zoomed out.
  * long-8h-sparse-spikes  same video/spikes, but values only on the spike
                           frames and the frame either side. Control for the
                           sparse-pulse path covered by timelineSampling.spec.ts.
  * short-10m-dense-spikes 15,000 frames with the same dense pattern. Also
                           shows triangles (~20 frames/px): the bug triggers
                           whenever several samples share a pixel column.

Each dataset has Linear+area graphs Ref_Left / ALG_Left / Ref_Right / ALG_Right
(matching the customer screenshot) plus an "ALG_Left (Step)" graph that uses
the Step curve, which skips the linear simplification and is a visual baseline.

    uv run scripts/testing/createTimelineTesting.py
    uv run scripts/testing/createTimelineTesting.py --only short-10m-dense-spikes --force
"""

from __future__ import annotations

import json
import random
import subprocess
from dataclasses import dataclass
from pathlib import Path

import click
import girder_client

FPS = 25
WIDTH = 320
HEIGHT = 240
ROOT_FOLDER_NAME = "TimelineTesting"
TRACK_TYPE = "TimelineSignal"
SCRIPT_DIR = Path(__file__).resolve().parent

SIGNALS = {
    # name: (line color, area color)
    "Ref_Left": ("#E53935", "#2E7D32"),
    "ALG_Left": ("#FFA726", "#C62828"),
    "Ref_Right": ("#E53935", "#2E7D32"),
    "ALG_Right": ("#FFCDD2", "#C62828"),
}
STEP_CONTROL = "ALG_Left (Step)"


@dataclass(frozen=True)
class DatasetSpec:
    name: str
    frames: int
    dense: bool
    description: str
    # Frames between features. A track is one Mongo document (16MB cap), so an
    # 8h video can't carry a feature on every frame; 10 keeps it ~8MB.
    stride: int = 1


DATASETS = [
    DatasetSpec(
        "long-8h-dense-spikes", 742_500, True,
        "8h15m @25fps, numeric value every 10th frame with 1-sample spikes (expect triangles).",
        stride=10,
    ),
    DatasetSpec(
        "long-8h-sparse-spikes", 742_500, False,
        "8h15m @25fps, values only at spike samples and their neighbours (control).",
        stride=10,
    ),
    DatasetSpec(
        "short-10m-dense-spikes", 15_000, True,
        "10m @25fps, numeric value on every frame with 1-frame spikes (also shows triangles).",
    ),
]


def build_spikes(frames: int, stride: int = 1, seed: int = 7) -> dict[str, dict[int, float]]:
    """Return {signal: {frame: value}} for the non-zero frames.

    Events are scattered across the video: mostly single-frame spikes, some
    2-5 frame pulses, and close pairs (a few hundred frames apart) like the
    screenshot. ALG signals echo the Ref events with a small offset. Widths,
    gaps and offsets are in samples; every frame lands on the stride grid.
    """
    rng = random.Random(seed)
    n_events = max(8, frames // 12_000)
    spikes: dict[str, dict[int, float]] = {name: {} for name in SIGNALS}
    for side in ("Left", "Right"):
        ref = spikes[f"Ref_{side}"]
        alg = spikes[f"ALG_{side}"]
        for _ in range(n_events):
            start = rng.randint(10, (frames - 2000) // stride) * stride
            starts = [start]
            if rng.random() < 0.35:  # close pair / cluster
                starts.append(start + rng.randint(150 // stride, 900 // stride) * stride)
            for s in starts:
                width = 1 if rng.random() < 0.7 else rng.randint(2, 5)
                height = rng.choice([1.0, 1.0, 0.8, 0.6])
                for f in range(s, s + width * stride, stride):
                    ref[f] = height
                offset = rng.randint(-3, 3) * stride
                for f in range(s + offset, s + offset + width * stride, stride):
                    alg[f] = round(height * rng.uniform(0.5, 1.0), 3)
    return spikes


def build_annotations(spec: DatasetSpec, out_path: Path) -> Path:
    if out_path.exists():
        print(f"  using cached {out_path.name}")
        return out_path
    spikes = build_spikes(spec.frames, spec.stride)
    sparse_frames: set[int] = set()
    if not spec.dense:
        for values in spikes.values():
            for f in values:
                sparse_frames.update((f - spec.stride, f, f + spec.stride))

    bounds = f"[0, 0, {WIDTH}, {HEIGHT}]"
    # Stream the JSON; ~750k features is too large to build comfortably as dicts.
    with out_path.open("w") as fh:
        fh.write('{"version": 2, "groups": {}, "tracks": {"1": {"id": 1, "begin": 0, ')
        last_frame = (spec.frames - 1) // spec.stride * spec.stride
        fh.write(f'"end": {last_frame}, "attributes": {{}}, ')
        fh.write(f'"confidencePairs": [["{TRACK_TYPE}", 1.0]], "features": [')
        for frame in range(0, spec.frames, spec.stride):
            if frame:
                fh.write(",")
            fh.write(f'{{"frame": {frame}, "bounds": {bounds}, "keyframe": true, "interpolate": false')
            if spec.dense or frame in sparse_frames:
                attrs = {name: spikes[name].get(frame, 0) for name in SIGNALS}
                fh.write(f', "attributes": {json.dumps(attrs)}')
            fh.write("}")
        fh.write("]}}}")
    print(f"  wrote {out_path.name} ({out_path.stat().st_size / 1e6:.1f} MB)")
    return out_path


def generate_video(frames: int, out_dir: Path) -> Path:
    video_path = out_dir / f"timeline-{frames}f.mp4"
    if video_path.exists():
        print(f"  using cached {video_path.name}")
        return video_path
    print(f"  encoding {frames} frames (this can take several minutes for 8h)...")
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi",
        # Flat background + frame number compresses ~20x better than testsrc2,
        # which matters at 742k frames.
        "-i", f"color=c=0x303040:size={WIDTH}x{HEIGHT}:rate={FPS}",
        "-vf", "drawtext=text='%{n}':fontcolor=white:fontsize=40:x=(w-tw)/2:y=(h-th)/2",
        "-frames:v", str(frames),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "35",
        "-pix_fmt", "yuv420p", "-g", str(FPS * 10), "-movflags", "+faststart",
        str(video_path),
    ]
    subprocess.run(cmd, check=True)
    print(f"  encoded {video_path.name} ({video_path.stat().st_size / 1e6:.1f} MB)")
    return video_path


def attribute_defs() -> list[dict]:
    return [
        {
            "belongs": "detection",
            "datatype": "number",
            "name": name,
            "key": f"detection_{name}",
            "color": line,
            "values": [],
        }
        for name, (line, _) in SIGNALS.items()
    ]


def graph_settings(name: str, curve: str = "Linear") -> dict:
    line, area = SIGNALS[name]
    return {
        name: {
            "type": curve,
            "area": True,
            "areaColor": area,
            "areaOpacity": 0.5,
            "lineOpacity": 1.0,
            "max": False,
        }
    }


def timeline_defs() -> list[dict]:
    def graph(title: str, attr: str, curve: str = "Linear", default: bool = False) -> dict:
        return {
            "name": title,
            "enabled": True,
            "default": default,
            "filter": {"type": "key", "active": True, "value": True, "appliedTo": [attr]},
            "settings": graph_settings(attr, curve),
            # Pinned so the graphs render without having to select the track.
            "displaySettings": {"display": "pinned", "pinnedTrackId": 1, "trackFilter": ["all"]},
            "yRange": [0, -1],
            "ticks": -1,
        }

    graphs = [graph(name, name, default=index == 0) for index, name in enumerate(SIGNALS)]
    graphs.append(graph(STEP_CONTROL, "ALG_Left", curve="Step"))
    return graphs


def configuration() -> dict:
    names = [*SIGNALS, STEP_CONTROL]
    return {
        "general": {"configurationMerge": "disabled"},
        "timelineConfigs": {
            "maxHeight": 520,
            "timelines": [
                {"name": n, "type": "graph", "order": i, "maxHeight": 85, "dismissable": False}
                for i, n in enumerate(names)
            ],
        },
        "UISettings": {
            "UITimeline": {"UIDetections": True, "UIEvents": True, "UILegendForceOpen": True},
        },
    }


def upload_dataset(
    gc: girder_client.GirderClient,
    root_id: str,
    spec: DatasetSpec,
    video: Path,
    tracks: Path,
    force: bool,
) -> str:
    existing = list(gc.listFolder(root_id, name=spec.name))
    if existing:
        if not force:
            print(f"  exists ({existing[0]['_id']}), skipping (use --force to recreate)")
            return str(existing[0]["_id"])
        gc.delete(f"folder/{existing[0]['_id']}")

    folder = gc.createFolder(root_id, spec.name, description=spec.description)
    folder_id = str(folder["_id"])
    gc.uploadFileToFolder(folder_id, str(video))
    gc.uploadFileToFolder(folder_id, str(tracks), filename="tracks.json")
    gc.addMetadataToFolder(
        folder_id, {"fps": FPS, "originalFps": FPS, "annotate": True, "type": "video"}
    )
    # Imports tracks.json and starts the (skip-transcode) video conversion job.
    gc.post(f"dive_rpc/postprocess/{folder_id}", data={"skipTranscoding": True})
    gc.patch(f"dive_dataset/{folder_id}/attributes", json={"upsert": attribute_defs(), "delete": []})
    gc.patch(f"dive_dataset/{folder_id}/timelines", json={"upsert": timeline_defs(), "delete": []})
    gc.patch(f"dive_dataset/{folder_id}/configuration", json=configuration())
    return folder_id


@click.command()
@click.option("--host", default="localhost", show_default=True)
@click.option("--port", default=8010, show_default=True)
@click.option("--scheme", default="http", show_default=True)
@click.option("--user", default="admin", show_default=True)
@click.option("--password", default="letmein", show_default=True, help="Local dev default")
@click.option("--only", multiple=True, help="Dataset name(s) to process (default all)")
@click.option("--force", is_flag=True, help="Delete and recreate datasets that already exist")
@click.option("--skip-upload", is_flag=True, help="Only generate files in --work-dir")
@click.option(
    "--work-dir",
    type=click.Path(file_okay=False, path_type=Path),
    default=SCRIPT_DIR / "timeline-testing-data",
    show_default=True,
)
def main(host, port, scheme, user, password, only, force, skip_upload, work_dir: Path):
    work_dir.mkdir(parents=True, exist_ok=True)
    specs = [s for s in DATASETS if not only or s.name in only]
    gc = None
    root_id = None
    if not skip_upload:
        gc = girder_client.GirderClient(host, port=port, scheme=scheme, apiRoot="api/v1")
        gc.authenticate(user, password)
        me = gc.get("user/me")
        root = gc.createFolder(
            me["_id"], ROOT_FOLDER_NAME, parentType="user", reuseExisting=True,
            description="Synthetic datasets for numeric timeline rendering on long videos.",
        )
        root_id = str(root["_id"])

    created = {}
    for spec in specs:
        print(f"[{spec.name}]")
        video = generate_video(spec.frames, work_dir)
        tracks = build_annotations(spec, work_dir / f"{spec.name}.tracks.json")
        if gc is not None:
            created[spec.name] = upload_dataset(gc, root_id, spec, video, tracks, force)

    for name, folder_id in created.items():
        print(f"{name}: {scheme}://{host}:{port}/dive/#/viewer/{folder_id}")


if __name__ == "__main__":
    main()
