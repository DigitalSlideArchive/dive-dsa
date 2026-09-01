# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "girder-client",
# ]
# ///
"""Create SwimlaneTesting dataset with a full-frame track and text swimlane attributes."""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

import girder_client

HOST = "127.0.0.1"
PORT = 8010
SCHEME = "http"
PARENT_FOLDER_ID = "63d3ca449e23cf44fa9cb1e0"  # Public
DATASET_NAME = "SwimlaneTesting"
VIDEO_SOURCE = Path("/home/local/KHQ/bryon.lewis/Downloads/t.2x.mp4")
UPLOAD_FILENAME = "tx2.mp4"
TRACK_ID = 1
TRACK_TYPE = "object"

TEXT_ATTRIBUTES = [
    {
        "name": "Activity",
        "values": ["idle", "walking", "running"],
        "color": "#2196F3",
        "valueColors": {"idle": "#9E9E9E", "walking": "#FFC107", "running": "#F44336"},
    },
    {
        "name": "Status",
        "values": ["clear", "warning", "alert"],
        "color": "#4CAF50",
        "valueColors": {"clear": "#4CAF50", "warning": "#FF9800", "alert": "#E91E63"},
    },
    {
        "name": "Zone",
        "values": ["north", "south", "east", "west"],
        "color": "#009688",
        "valueColors": {
            "north": "#009688",
            "south": "#3F51B5",
            "east": "#795548",
            "west": "#607D8B",
        },
    },
    {
        "name": "Weather",
        "values": ["sunny", "cloudy", "rain", "windy"],
        "color": "#03A9F4",
        "valueColors": {
            "sunny": "#FFEB3B",
            "cloudy": "#9E9E9E",
            "rain": "#2196F3",
            "windy": "#80CBC4",
        },
    },
    {
        "name": "Phase",
        "values": ["alpha", "beta", "gamma"],
        "color": "#673AB7",
        "valueColors": {"alpha": "#673AB7", "beta": "#9C27B0", "gamma": "#E040FB"},
    },
    {
        "name": "Priority",
        "values": ["low", "medium", "high", "critical"],
        "color": "#FF5722",
        "valueColors": {
            "low": "#8BC34A",
            "medium": "#FFC107",
            "high": "#FF9800",
            "critical": "#F44336",
        },
    },
    {
        "name": "Label",
        "values": ["A", "B", "C", "D"],
        "color": "#795548",
        "valueColors": {"A": "#E91E63", "B": "#3F51B5", "C": "#009688", "D": "#FF5722"},
    },
]


def get_video_info(video_path: Path) -> tuple[int, int, int]:
    import subprocess

    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,nb_frames",
        "-of",
        "json",
        str(video_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    stream = data["streams"][0]
    width = int(stream["width"])
    height = int(stream["height"])
    frames = int(stream.get("nb_frames") or 0)
    if frames <= 0:
        duration_cmd = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ]
        duration = float(subprocess.run(duration_cmd, capture_output=True, text=True, check=True).stdout.strip())
        rate_cmd = [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ]
        rate = subprocess.run(rate_cmd, capture_output=True, text=True, check=True).stdout.strip()
        num, den = rate.split("/")
        fps = float(num) / float(den)
        frames = max(1, int(round(duration * fps)))
    return width, height, frames


def build_attribute_keyframes(frames: int, seed: int = 42) -> dict[str, list[tuple[int, str]]]:
    rng = random.Random(seed)
    keyframes: dict[str, list[tuple[int, str]]] = {}
    for attr in TEXT_ATTRIBUTES:
        entries: list[tuple[int, str]] = []
        frame = 0
        value_idx = 0
        while frame < frames:
            entries.append((frame, attr["values"][value_idx % len(attr["values"])]))
            value_idx += 1
            frame += rng.randint(20, 30)
        keyframes[attr["name"]] = entries
    return keyframes


def build_annotations(width: int, height: int, frames: int) -> dict:
    keyframes = build_attribute_keyframes(frames)
    change_frames: dict[int, dict[str, str]] = {}
    for name, entries in keyframes.items():
        for frame, value in entries:
            change_frames.setdefault(frame, {})[name] = value

    features = []
    for frame in range(frames):
        feature: dict = {
            "frame": frame,
            "bounds": [0, 0, width, height],
        }
        if frame in change_frames:
            feature["attributes"] = change_frames[frame]
        features.append(feature)

    return {
        "version": 2,
        "tracks": {
            str(TRACK_ID): {
                "id": TRACK_ID,
                "begin": 0,
                "end": frames - 1,
                "attributes": {},
                "confidencePairs": [[TRACK_TYPE, 1.0]],
                "features": features,
            }
        },
        "groups": {},
    }


def build_attribute_defs() -> list[dict]:
    defs = []
    for attr in TEXT_ATTRIBUTES:
        key = f"detection_{attr['name']}"
        defs.append(
            {
                "belongs": "detection",
                "datatype": "text",
                "name": attr["name"],
                "key": key,
                "values": attr["values"],
                "color": attr["color"],
                "valueColors": attr["valueColors"],
                "noneColor": "#EEEEEE",
            }
        )
    return defs


def build_swimlane_defs() -> list[dict]:
    swimlanes = []
    for index, attr in enumerate(TEXT_ATTRIBUTES):
        swimlanes.append(
            {
                "enabled": True,
                "name": f"{attr['name']} Swimlane",
                "default": index == 0,
                "filter": {
                    "type": "key",
                    "active": True,
                    "value": True,
                    # Swimlane filters match annotation attribute names, not metadata keys.
                    "appliedTo": [attr["name"]],
                },
                "displaySettings": {
                    "display": "selected",
                    "trackFilter": ["all"],
                    "renderMode": "classic",
                    "displayTooltip": True,
                    "displayFrameIndicators": True,
                },
            }
        )
    return swimlanes


def build_configuration() -> dict:
    timeline_entries = [
        {
            "name": "Detections",
            "type": "detections",
            "order": 0,
            "maxHeight": 80,
            "dismissable": True,
        }
    ]
    for index, attr in enumerate(TEXT_ATTRIBUTES):
        timeline_entries.append(
            {
                "name": f"{attr['name']} Swimlane",
                "type": "swimlane",
                "order": index + 1,
                "maxHeight": 55,
                "dismissable": False,
            }
        )

    return {
        "actions": [
            {
                "action": {
                    "type": "TrackSelection",
                    "startTrack": 0,
                    "startFrame": 0,
                    "Nth": 0,
                    "direction": "next",
                }
            }
        ],
        "timelineConfigs": [
            {
                "name": "SwimlaneTesting",
                "maxHeight": 450,
                "timelines": timeline_entries,
            }
        ],
        "UISettings": {
            "UITimeline": {
                "UIDetections": True,
                "UIEvents": True,
                "UILegendForceOpen": True,
            },
        },
    }


def login() -> girder_client.GirderClient:
    gc = girder_client.GirderClient(HOST, port=PORT, apiRoot="girder/api/v1", scheme=SCHEME)
    gc.authenticate("admin", "letmein")
    return gc


def main() -> None:
    if not VIDEO_SOURCE.exists():
        print(f"Video not found: {VIDEO_SOURCE}", file=sys.stderr)
        sys.exit(1)

    width, height, frames = get_video_info(VIDEO_SOURCE)
    print(f"Video: {width}x{height}, {frames} frames")

    annotations = build_annotations(width, height, frames)
    attribute_defs = build_attribute_defs()
    swimlane_defs = build_swimlane_defs()
    configuration = build_configuration()

    gc = login()
    parent = gc.getFolder(PARENT_FOLDER_ID)
    print(f"Uploading to folder: {parent['name']} ({PARENT_FOLDER_ID})")

    existing = list(gc.listFolder(PARENT_FOLDER_ID, name=DATASET_NAME, limit=1))
    if existing:
        folder_id = str(existing[0]["_id"])
        print(f"Reusing existing dataset folder: {folder_id}")
    else:
        folder = gc.createFolder(parentId=PARENT_FOLDER_ID, name=DATASET_NAME, reuseExisting=False)
        folder_id = str(folder["_id"])
        print(f"Created dataset folder: {folder_id}")

    items = list(gc.listItem(folder_id))
    if not items:
        gc.uploadFileToFolder(folder_id, str(VIDEO_SOURCE), filename=UPLOAD_FILENAME)
        gc.addMetadataToFolder(
            folder_id,
            {"fps": 30, "annotate": True, "type": "video", "originalFPS": 30},
        )
        gc.post(f"dive_rpc/postprocess/{folder_id}", data={"skipTranscoding": True})
        print("Uploaded video and started postprocess")

    gc.post(
        "dive_annotation/process_json",
        json=annotations,
        parameters={"folderId": folder_id},
    )
    print("Uploaded annotations")

    gc.patch(
        f"dive_dataset/{folder_id}/attributes",
        json={"upsert": attribute_defs, "delete": []},
    )
    print("Updated attributes")

    gc.patch(
        f"dive_dataset/{folder_id}/swimlanes",
        json={"upsert": swimlane_defs, "delete": []},
    )
    print("Updated swimlanes")

    gc.patch(
        f"dive_dataset/{folder_id}/configuration",
        json=configuration,
    )
    print("Updated configuration")

    print(f"\nDone. Dataset: {DATASET_NAME}")
    print(f"Folder ID: {folder_id}")
    print(f"Launch: http://{HOST}:{PORT}/dive?folder={folder_id}")


if __name__ == "__main__":
    main()
