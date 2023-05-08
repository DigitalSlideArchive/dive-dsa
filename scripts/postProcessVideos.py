import click
import girder_client

apiURL = "127.0.0.1"  # url of the server
port = 8010  # set to your local port being used
rootFolderId = '63fcf7e931949275f05194b0'  # root folderId to recursively look at
limit = 5  # only want to process X videos
# Below is a global variable which shouldn't be edited
totalFolders = 0  # use to maintain a total count of items added

def login():
    gc = girder_client.GirderClient(apiURL, port=port, apiRoot='girder/api/v1', scheme='http')
    gc.authenticate(interactive=True)
    return gc


def getData(gc: girder_client.GirderClient, folderId: str):
    global totalFolders
    if totalFolders > limit:  # after the limit just stop.
        return
    folderData = gc.getFolder(folderId)
    meta = folderData.get('meta', {})
    fps = meta.get('fps', None)
    markForPostProcess = meta.get('MarkForPostProcess', None)
    if fps == -1 and markForPostProcess is not None:
        # We need to mark this folder for post processing
        gc.post(f'dive_rpc/postprocess/{folderId}')
        print(f'Running Post Process on Folder: {folderData["name"]}')
        totalFolders = totalFolders + 1
    childFolders = gc.get(f'folder?parentType=folder&parentId={folderId}')

    for item in childFolders:
        getData(gc, str(item['_id']))

    return


@click.command(
    name="PostProcess",
    help="Takes a Parent folder and recursive checks for FPS = -! and markForPostProcess False and will kick off a post process job until limit is reached",
)
def run_script():
    gc = login()
    getData(gc, rootFolderId)


if __name__ == "__main__":
    run_script()
