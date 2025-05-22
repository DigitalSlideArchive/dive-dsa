import os
from pathlib import Path
from typing import Optional, Tuple
import girder_client
# ------------------ CONFIG ------------------
API_URL = 'localhost'  # Replace with your actual API endpoint
PORT = 8010
API_KEY = os.getenv('GIRDER_API_KEY')  # Or hardcode it here if desired
DATASET_ID = '682f124811622ee316e5cac6'    # Replace with actual dataset ID
TRACK_ID = 0        # Replace with actual track ID (string or int)
START_FRAME = 98                        # Replace with actual start frame number
WORKING_DIR = Path('./working_dir')   # Directory to store downloaded files
# -------------------------------------------

def get_mask_or_bbox(
    gc: girder_client.GirderClient,
    dataset_id: str,
    track_id: str,
    start_frame: int,
    working_directory: Path
) -> Tuple[Optional[list], Optional[Path], dict]:
    existing_tracks = gc.get('dive_annotation/track', {'folderId': dataset_id})
    track_map = {str(track['id']): track for track in existing_tracks}
    track = track_map.get(str(track_id))

    bbox = None
    mask_location = None

    if track:
        features = track.get('features', [])
        matching_feature = next((f for f in features if f.get('frame') == int(start_frame)), None)
        if matching_feature:
            print(f'Found feature at frame {start_frame}')
            if matching_feature.get('hasMask', False):
                print(f'Feature has a mask, checking media...')
                try:
                    media_results = gc.get(f'dive_dataset/{dataset_id}/media')
                    masks = media_results.get('masks', [])
                    print(f'Found {len(masks)} masks in media results')
                    matching_mask = next(
                        (m for m in masks if m.get('metadata', {}).get('frameId') == int(start_frame)),
                        None
                    )
                    if matching_mask:
                        print(f'Found matching mask for frame {start_frame}, track {track_id}')
                        print(matching_mask)
                        mask_file_id = matching_mask.get('id')
                        mask_dir = working_directory / 'base_mask'
                        mask_dir.mkdir(exist_ok=True, parents=True)
                        gc.downloadItem(mask_file_id, str(mask_dir))
                        mask_location = mask_dir / matching_mask['filename']
                        print(f'Mask downloaded to: {mask_location}')
                    else:
                        print(f'No matching mask found for frame {start_frame} and track {track_id}')
                        print(masks)
                except Exception as e:
                    print(f'Error fetching or downloading mask: {e}')
            else:
                print('Feature does not have a mask.')
            bbox = matching_feature.get('bounds')
        else:
            print(f'No feature found at frame {start_frame}')
    else:
        print(f'Track {track_id} not found in dataset. Available tracks: {list(track_map.keys())}')

    return bbox, mask_location, track_map


if __name__ == '__main__':
    # Setup Girder client
    gc = girder_client.GirderClient(API_URL, port=PORT, apiRoot='girder/api/v1', scheme='http')
    gc.authenticate(interactive=True)
    # Ensure working directory exists
    WORKING_DIR.mkdir(parents=True, exist_ok=True)

    # Run the function
    bbox, mask_location, track_map = get_mask_or_bbox(
        gc=gc,
        dataset_id=DATASET_ID,
        track_id=TRACK_ID,
        start_frame=START_FRAME,
        working_directory=WORKING_DIR
    )

    print('\n=== RESULTS ===')
    print(f'BBox: {bbox}')
    print(f'Mask Location: {mask_location}')
    print(f'Available Tracks: {list(track_map.keys())}')
