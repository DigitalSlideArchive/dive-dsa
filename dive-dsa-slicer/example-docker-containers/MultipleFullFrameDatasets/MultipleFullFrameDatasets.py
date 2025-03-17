import json
import logging
import os
import pprint
import time
from pathlib import Path
import tempfile

import girder_client
import numpy as np
from datetime import timedelta
import cv2

from ctk_cli import CLIArgumentParser  # noqa I004
# imported for side effects
from slicer_cli_web import ctk_cli_adjustment  # noqa


logging.basicConfig(level=logging.CRITICAL)


def process_input_args(args, gc):
    folderId = args.DIVEDirectory.split('/')[-2]
    recursive = args.recursive
    print(f"folderId: {folderId} recursive: {recursive}")
    if not recursive:  # only a single file to process
        process_dive_dataset(folderId=folderId, gc=gc, trackType=args.trackType)
    else:  # Get the list of datasets to process
        datasets = gc.get(f"dive_dataset/{folderId}/recursive")
        # iterate over the DIVE datasets
        counter = 1
        total = len(datasets)
        for dataset in datasets:
            print(f"Processing Dive Dataset: {dataset['lowerName']} - {counter} of {total} ")
            process_dive_dataset(str(dataset["_id"]), gc, args.trackType)
            counter += 1
    
    
def process_video(path):
    cap = cv2.VideoCapture(path)

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


def create_full_frame(width, height, frames, trackType='unknown'):
    track_obj = {
        "id": 0,
        "begin": 0,
        "end": frames - 1,
        "confidencePairs": [
            [
                trackType,
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


def process_dive_dataset(folderId,  gc: girder_client.GirderClient, trackType='unknown'):
    task_defaults = gc.get(f'dive_dataset/{folderId}/task-defaults')
    print(f"Task Defaults: {task_defaults}")
    videoId = task_defaults.get('video', {}).get('fileId', False)
    if videoId:
        videoName = task_defaults.get('video', {}).get('filename', 'default.mp4')
        with tempfile.TemporaryDirectory() as _working_directory:
            _working_directory_path = Path(_working_directory)
            file_name = str(_working_directory_path / videoName)
            print(f"Processing Video: {videoName}")
            gc.downloadFile(videoId, file_name)
            data = process_video(file_name)
            trackJSON = create_full_frame(data['width'], data['height'], data['frames'], trackType)
            outputFileName = './output.json'
            with open(outputFileName, 'w') as annotation_file:
                json.dump(trackJSON, annotation_file, separators=(',', ':'), sort_keys=False)
            gc.uploadFileToFolder(folderId, outputFileName)
            gc.post(f'dive_rpc/postprocess/{folderId}', data={"skipJobs": True})
            os.remove(outputFileName)


def main(args):

    gc = girder_client.GirderClient(apiUrl=args.girderApiUrl)
    gc.setToken(args.girderToken)

    total_start_time = time.time()

    print('\n>> CLI Parameters ...\n')
    pprint.pprint(vars(args))
    process_input_args(args, gc)



if __name__ == '__main__':

    main(CLIArgumentParser().parse_args())