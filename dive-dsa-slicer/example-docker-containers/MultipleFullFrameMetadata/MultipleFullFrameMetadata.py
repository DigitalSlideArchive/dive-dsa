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
    sleepSeconds = args.sleepSeconds
    process_dive_dataset(folderId, gc, args.trackType, sleepSeconds)
    process_metadata(args, gc)
    
    
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


def process_dive_dataset(folderId,  gc: girder_client.GirderClient, trackType='unknown', sleepSeconds=0):
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
            time.sleep(sleepSeconds)

            gc.uploadFileToFolder(folderId, outputFileName)
            gc.post(f'dive_rpc/postprocess/{folderId}', data={"skipJobs": True})
            os.remove(outputFileName)


def process_metadata(args, gc: girder_client.GirderClient):
    DIVEMetadataId = args.DIVEMetadata
    DIVEDatasetId = args.DIVEDirectory.split('/')[-2]

    DIVEMetadataRoot = args.DIVEMetadataRoot
    MetadataKey = args.MetadataKey
    MetadataValue = args.MetadataValue

    # First we check the root filter to see if there is a MetadataKey that exists
    current_filter_values = gc.get(f'/dive_metadata/{DIVEMetadataRoot}/metadata_keys')
    print(f'Current Filter Values: {current_filter_values}')
    print(f'MetadataRoot: {DIVEMetadataRoot} DatasetId: {DIVEDatasetId} MetadataKey: {MetadataKey} MetadataValue: {MetadataValue}')
    # This only works for the owners of the metadata search field running
    # it will add a new key if it doesn't exist.
    # regular users require that a templated metadataKey be available and the user can edit it
    if MetadataKey not in current_filter_values['metadataKeys'].keys():
        print('Adding the new key to MetadataRoot')
        # Field should be unlocked if the user who is running the task is not the owner.  Only owners can add new data to fields.
        gc.put(f'dive_metadata/{DIVEMetadataRoot}/add_key', {"key": MetadataKey, "value": MetadataValue, "category": "search", "unlocked": False})

        # If we want the new Metadata Item to not be under the Advanced section we should add it to the main Display
        root_data = gc.get(f'folder/{DIVEMetadataRoot}')
        diveMetadataFilter = root_data['meta'].get('DIVEMetadataFilter', False)
        if diveMetadataFilter:
            diveMetadataFilter['display'].append(MetadataKey)
            print(diveMetadataFilter)
            gc.put(f'/folder/{DIVEMetadataRoot}/metadata', json={'DIVEMetadataFilter': diveMetadataFilter})
    # Now we set the actual value to the system
    gc.patch(f'dive_metadata/{DIVEDatasetId}', {"key": MetadataKey, "value": MetadataValue})

def main(args):

    gc = girder_client.GirderClient(apiUrl=args.girderApiUrl)
    gc.setToken(args.girderToken)


    print('\n>> CLI Parameters ...\n')
    pprint.pprint(vars(args))
    process_input_args(args, gc)



if __name__ == '__main__':

    main(CLIArgumentParser().parse_args())