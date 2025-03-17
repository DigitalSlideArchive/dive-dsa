import json
import logging
import os
import pprint
import time
from pathlib import Path

import girder_client
import numpy as np
from datetime import timedelta
import cv2

from ctk_cli import CLIArgumentParser  # noqa I004
# imported for side effects
from slicer_cli_web import ctk_cli_adjustment  # noqa


logging.basicConfig(level=logging.CRITICAL)

def process_video(args):
    cap = cv2.VideoCapture(args.DIVEVideo)

    # Check if the video file was opened successfully
    if not cap.isOpened():
        print("Error: Could not open video file")
        exit()

    # Get the video's width and height
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Get the total number of frames in the video
    num_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Release the video capture object
    cap.release()

    # Print the results
    print(f"Video Width: {width}")
    print(f"Video Height: {height}")
    print(f"Number of Frames: {num_frames}")

    return {"width": width, "height": height, "frames": num_frames}

def create_full_frame(width, height, frames):
    track_obj = {
        "id": 0,
        "begin": 0,
        "end": frames - 1,
        "confidencePairs": [
            [
                'slicerCLI',
                1.0,
            ]
        ],
        "attributes": {},
        "features": [],
    }
    for frame in range(frames):
        frame = frame
        feature = {
            "frame": frame,
            "bounds": [0, 0, width, height],
            "attributes": {},
        }
        track_obj["begin"] = min(track_obj["begin"], frame)
        track_obj["end"] = max(track_obj["end"], frame)
        track_obj["features"].append(feature)
    return {
        "tracks": {"0": track_obj},
        "groups": {},
        "version": 2,
    }


def main(args):

    gc = girder_client.GirderClient(apiUrl=args.girderApiUrl)
    gc.setToken(args.girderToken)

    total_start_time = time.time()

    print('\n>> CLI Parameters ...\n')
    pprint.pprint(vars(args))

    start_time = time.time()

    results = process_video(args)

    annotation = create_full_frame(results['width'], results['height'], results['frames'])

    outputFileName = './output.json'

    with open(outputFileName, 'w') as annotation_file:
        json.dump(annotation, annotation_file, separators=(',', ':'), sort_keys=False)
    # of the format: /mnt/girder_worker/{id}/{folderName}
    folderId = args.DIVEDirectory.split('/')[-2]
    print(f'FolderId: {folderId}')
    gc.uploadFileToFolder(folderId, outputFileName)
    gc.post(f'dive_rpc/postprocess/{folderId}', data={"skipJobs": True})
    os.remove(outputFileName)

    total_time_taken = time.time() - start_time

    print('Total analysis time = {}'.format(
        str(timedelta(seconds=total_time_taken))))


if __name__ == '__main__':

    main(CLIArgumentParser().parse_args())