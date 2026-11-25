# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "click",
#     "girder-client",
#     "numpy",
#     "pycocotools",
#     "scikit-image",
#     "setuptools",
# ]
# ///
"""Create mask-rendering performance datasets under <admin>/MaskTesting.

Each dataset is a synthetic H.264 video (ffmpeg testsrc2, so every frame shows
its frame number) plus tracks whose every feature has an RLE mask. The datasets
vary the things that drive mask rendering cost:

  * frame resolution    -> texture size uploaded per mask per frame
  * concurrent masks    -> textures per frame, MAX_TEXTURE_PRELOAD window shrink
  * mask complexity     -> RLE length / decode time (noisy "blob" outlines)
  * sparse / staggered  -> cache-window churn when seeking

Only RLE_MASKS.json is uploaded (the client renders from RLE by default), not
per-frame PNGs, which keeps the upload small. Generated media/JSON is cached in
--work-dir so re-runs only re-upload.

    uv run scripts/testing/createMaskTesting.py              # all datasets
    uv run scripts/testing/createMaskTesting.py --only mask-1080p-10trk-900f --force
"""

from __future__ import annotations

import json
import math
import multiprocessing
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

import click
import girder_client
import numpy as np
from pycocotools import mask as mask_utils
from skimage.draw import disk, polygon

FPS = 30
ROOT_FOLDER_NAME = "MaskTesting"
SCRIPT_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class DatasetSpec:
    name: str
    width: int
    height: int
    frames: int
    tracks: int
    # Shape diameter as a fraction of min(width, height)
    shape_frac: float = 0.25
    # 'full': every track spans the whole video; 'sparse': staggered short spans
    layout: str = "full"
    # Vertices on the noisy blob outline (more -> longer RLE counts)
    blob_vertices: int = 48
    description: str = ""


DATASETS: list[DatasetSpec] = [
    DatasetSpec(
        "mask-480p-3trk-900f", 640, 480, 900, 3, 0.3,
        description="Baseline: small frame, few masks.",
    ),
    DatasetSpec(
        "mask-1080p-10trk-900f", 1920, 1080, 900, 10, 0.2,
        description="Typical HD case: 10 concurrent masks.",
    ),
    DatasetSpec(
        "mask-1080p-50trk-600f", 1920, 1080, 600, 50, 0.1,
        description="Stress concurrency: 50 masks/frame, hits MAX_TEXTURE_PRELOAD quickly.",
    ),
    DatasetSpec(
        "mask-4k-5trk-300f", 3840, 2160, 300, 5, 0.25,
        description="Large textures: 4K frame, 5 masks.",
    ),
    DatasetSpec(
        "mask-1080p-sparse-30trk-3000f", 1920, 1080, 3000, 30, 0.15, layout="sparse",
        description="Long video, staggered 5-20s tracks: seeking and cache-window churn.",
    ),
    DatasetSpec(
        "mask-1080p-complex-10trk-900f", 1920, 1080, 900, 10, 0.3, blob_vertices=256,
        description="High-detail outlines: long RLE strings, decode-bound.",
    ),
]


# --------------------------------------------------------------------------- #
# Mask generation
# --------------------------------------------------------------------------- #


def track_span(spec: DatasetSpec, track_id: int, rng: np.random.Generator) -> tuple[int, int]:
    if spec.layout == "full":
        return 0, spec.frames - 1
    length = int(rng.integers(5 * FPS, 20 * FPS))
    length = min(length, spec.frames)
    begin = int(rng.integers(0, spec.frames - length + 1))
    return begin, begin + length - 1


def blob_outline(n_vertices: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Per-vertex radius jitter and phase for a wobbly closed outline."""
    base = 0.75 + 0.25 * rng.random(n_vertices)
    phase = rng.random(n_vertices) * 2 * np.pi
    return base, phase


def generate_track(args: tuple[DatasetSpec, int]) -> tuple[int, dict, dict]:
    """Returns (track_id, track_json, {frame: rle_entry})."""
    spec, track_id = args
    rng = np.random.default_rng(1000 + track_id)
    h, w = spec.height, spec.width
    radius = spec.shape_frac * min(w, h) / 2
    begin, end = track_span(spec, track_id, rng)
    shape_kind = ("blob", "circle", "blob", "star")[track_id % 4]
    base, phase = blob_outline(spec.blob_vertices, rng)
    theta = np.linspace(0, 2 * np.pi, spec.blob_vertices, endpoint=False)

    # Lissajous path kept inside the frame
    ax = (w / 2 - radius - 2) * (0.4 + 0.6 * rng.random())
    ay = (h / 2 - radius - 2) * (0.4 + 0.6 * rng.random())
    fx, fy = rng.uniform(0.5, 2.0, size=2)
    p0 = rng.random() * 2 * np.pi
    period = max(1, end - begin + 1)

    buf = np.zeros((h, w), dtype=np.uint8, order="F")
    features = []
    rle_frames: dict[str, dict] = {}
    for frame in range(begin, end + 1):
        t = (frame - begin) / period * 2 * np.pi
        cx = w / 2 + ax * math.sin(fx * t + p0)
        cy = h / 2 + ay * math.sin(fy * t)
        if shape_kind == "circle":
            rr, cc = disk((cy, cx), radius, shape=(h, w))
        else:
            if shape_kind == "star":
                r = np.where(np.arange(spec.blob_vertices) % 2 == 0, radius, radius * 0.45)
            else:
                wobble = 0.12 * np.sin(phase + t * 3)
                r = radius * (base + wobble)
            xs = cx + r * np.cos(theta)
            ys = cy + r * np.sin(theta)
            rr, cc = polygon(ys, xs, shape=(h, w))
        if len(rr) == 0:
            continue
        buf[rr, cc] = 1
        rle = mask_utils.encode(buf)
        buf[rr, cc] = 0
        bounds = [int(cc.min()), int(rr.min()), int(cc.max()), int(rr.max())]
        features.append(
            {
                "frame": frame,
                "bounds": bounds,
                "attributes": {},
                "hasMask": True,
                "interpolate": False,
                "keyframe": True,
            }
        )
        rle_frames[str(frame)] = {
            "rle": {"size": [h, w], "counts": rle["counts"].decode("utf-8")},
        }

    track = {
        "id": track_id,
        "begin": features[0]["frame"],
        "end": features[-1]["frame"],
        "confidencePairs": [[f"{shape_kind}", 1.0]],
        "attributes": {},
        "meta": {},
        "features": features,
    }
    return track_id, track, rle_frames


def generate_annotations(spec: DatasetSpec, out_dir: Path) -> tuple[Path, Path]:
    tracks_path = out_dir / "tracks.json"
    rle_path = out_dir / "RLE_MASKS.json"
    if tracks_path.exists() and rle_path.exists():
        print(f"  using cached {tracks_path.name}, {rle_path.name}")
        return tracks_path, rle_path

    start = time.perf_counter()
    tracks: dict[str, dict] = {}
    rle_masks: dict[str, dict] = {}
    with multiprocessing.Pool() as pool:
        for track_id, track, rle_frames in pool.imap_unordered(
            generate_track, [(spec, i) for i in range(spec.tracks)]
        ):
            tracks[str(track_id)] = track
            rle_masks[str(track_id)] = rle_frames
    tracks = dict(sorted(tracks.items(), key=lambda kv: int(kv[0])))
    rle_masks = dict(sorted(rle_masks.items(), key=lambda kv: int(kv[0])))

    tracks_path.write_text(json.dumps({"version": 2, "tracks": tracks, "groups": {}}))
    rle_path.write_text(json.dumps(rle_masks))
    n_masks = sum(len(v) for v in rle_masks.values())
    avg_counts = np.mean([len(e["rle"]["counts"]) for v in rle_masks.values() for e in v.values()])
    print(
        f"  generated {n_masks} masks in {time.perf_counter() - start:.1f}s "
        f"(avg RLE counts length {avg_counts:.0f} chars, "
        f"RLE_MASKS.json {rle_path.stat().st_size / 1e6:.1f} MB)"
    )
    return tracks_path, rle_path


def generate_video(spec: DatasetSpec, out_dir: Path) -> Path:
    video_path = out_dir / f"{spec.name}.mp4"
    if video_path.exists():
        print(f"  using cached {video_path.name}")
        return video_path
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi",
        "-i", f"testsrc2=size={spec.width}x{spec.height}:rate={FPS}",
        "-frames:v", str(spec.frames),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
        "-pix_fmt", "yuv420p", "-g", str(FPS), "-movflags", "+faststart",
        str(video_path),
    ]
    subprocess.run(cmd, check=True)
    print(f"  encoded {video_path.name} ({video_path.stat().st_size / 1e6:.1f} MB)")
    return video_path


# --------------------------------------------------------------------------- #
# Girder upload
# --------------------------------------------------------------------------- #


def get_root_folder(gc: girder_client.GirderClient) -> dict:
    me = gc.get("user/me")
    return gc.createFolder(
        me["_id"], ROOT_FOLDER_NAME, parentType="user", reuseExisting=True,
        description="Synthetic datasets for measuring mask rendering performance.",
    )


def upload_dataset(
    gc: girder_client.GirderClient,
    root_id: str,
    spec: DatasetSpec,
    video: Path,
    tracks_path: Path,
    rle_path: Path,
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
    gc.addMetadataToFolder(
        folder_id, {"fps": FPS, "originalFps": FPS, "annotate": True, "type": "video"}
    )
    gc.post(f"dive_rpc/postprocess/{folder_id}", data={"skipTranscoding": True})

    gc.post(
        "dive_annotation/process_json",
        parameters={"folderId": folder_id},
        json=json.loads(tracks_path.read_text()),
    )

    masks_folder = gc.createFolder(folder_id, "masks", reuseExisting=True)
    gc.addMetadataToFolder(masks_folder["_id"], {"mask": True})
    rle_item = gc.uploadFileToFolder(masks_folder["_id"], str(rle_path))
    gc.addMetadataToItem(rle_item["itemId"], {"RLE_MASK_FILE": True})
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
    default=SCRIPT_DIR / "mask-testing-data",
    show_default=True,
)
def main(host, port, scheme, user, password, only, force, skip_upload, work_dir: Path):
    specs = [s for s in DATASETS if not only or s.name in only]
    if not specs:
        raise click.UsageError(f"No datasets match {only}. Known: {[s.name for s in DATASETS]}")

    gc = None
    root = None
    if not skip_upload:
        gc = girder_client.GirderClient(host, port=port, apiRoot="api/v1", scheme=scheme)
        gc.authenticate(user, password)
        root = get_root_folder(gc)
        print(f"Root folder: {ROOT_FOLDER_NAME} ({root['_id']})")

    created: dict[str, str] = {}
    for spec in specs:
        print(f"\n{spec.name}: {spec.width}x{spec.height}, {spec.frames}f, {spec.tracks} tracks ({spec.layout})")
        out_dir = work_dir / spec.name
        out_dir.mkdir(parents=True, exist_ok=True)
        video = generate_video(spec, out_dir)
        tracks_path, rle_path = generate_annotations(spec, out_dir)
        if gc is not None and root is not None:
            created[spec.name] = upload_dataset(
                gc, str(root["_id"]), spec, video, tracks_path, rle_path, force
            )

    if created:
        print("\nDatasets:")
        for name, fid in created.items():
            print(f"  {name:34s} {scheme}://{host}:{port}/#/viewer/{fid}")


if __name__ == "__main__":
    main()
