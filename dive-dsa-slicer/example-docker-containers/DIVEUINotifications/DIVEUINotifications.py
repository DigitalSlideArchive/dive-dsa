import json
import logging
import os
import pprint
import time

import girder_client
from datetime import timedelta

from ctk_cli import CLIArgumentParser  # noqa I004
# imported for side effects
from slicer_cli_web import ctk_cli_adjustment  # noqa


logging.basicConfig(level=logging.CRITICAL)

def main(args):

    gc = girder_client.GirderClient(apiUrl=args.girderApiUrl)
    gc.setToken(args.girderToken)

    total_start_time = time.time()

    print('\n>> CLI Parameters ...\n')
    pprint.pprint(vars(args))

    start_time = time.time()


    folderId = args.DIVEDirectory.split('/')[-2]
    print(f'FolderId: {folderId}')
    text = args.notificationText
    print(f'Notification Text: {text}')
    selectedTrack = args.selectedTrack
    print(f'selectedTrack: {selectedTrack}')
    selectedFrame = args.selectedFrame
    print(f'selectedFrame: {selectedFrame}')
    data = {
        "text": text,
    }
    if selectedFrame > -1:
        data['selectedFrame'] = selectedFrame
    if selectedTrack > -1:
        data['selectedTrack'] = selectedTrack

    gc.post(f'dive_rpc/ui_notification/{folderId}', json=data)

    total_time_taken = time.time() - start_time

    print('Total analysis time = {}'.format(
        str(timedelta(seconds=total_time_taken))))


if __name__ == '__main__':

    main(CLIArgumentParser().parse_args())