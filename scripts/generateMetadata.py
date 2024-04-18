import click
import girder_client
import json

apiURL = "127.0.0.1"  # url of the server
port = 8010  # set to your local port being used
rootFolderId = '662155dc50595d98ae1821d6'  # root folderId to recursively look at
limit = 5  # only want to process X videos
# Below is a global variable which shouldn't be edited
totalFolders = 0  # use to maintain a total count of items added

def login():
    gc = girder_client.GirderClient(apiURL, port=port, apiRoot='girder/api/v1', scheme='http')
    gc.authenticate(interactive=True)
    return gc

def remove_before_folder(path, folder_name):
    index = path.find(folder_name)
    if index != -1:
        return path[index:]
    else:
        return None


def load_ndjson(file_path):
    data = []
    with open(file_path, 'r') as file:
        for line in file:
            data.append(json.loads(line))
    return data   

def create_folder(gc: girder_client.GirderClient, parentId: str, name: str):
    result = gc.createFolder(parentId=parentId, name=name)
    return str(result["_id"])

def get_or_create_folder(gc: girder_client.GirderClient, path: str, root: str, existing):
    modified_path = remove_before_folder(path, root)
    if modified_path is None:
        modified_path = remove_before_folder(path, 'rawdata')
    base_folder_id = existing[root]
    if modified_path not in existing.keys():
        splits = modified_path.split('/')
        base_item = ""
        for index, item in enumerate(splits):

            if index == len(splits) - 1:
                # now we upload the video
                new_id = create_folder(gc, base_folder_id, item)
                gc.uploadFileToFolder(new_id, './SampleVideo.mp4', filename=item)
                postprocess(gc, new_id)
                break
            if base_item == "":
                modified_item = f'{root}/{item}'
            else:
                modified_item = f'{base_item}/{item}'
            if modified_item in existing.keys():
                base_folder_id = existing[modified_item]
            else:
                new_id = create_folder(gc, base_folder_id, item)
                existing[modified_item] = new_id
                base_folder_id = new_id

            base_item = modified_item



def generate_structure(data):
    for item in data:
        path= item['Key']
     

def postprocess(gc: girder_client.GirderClient, folderId: str):
    global totalFolders
    if totalFolders > limit:  # after the limit just stop.
        return
    folderData = gc.getFolder(folderId)
    gc.addMetadataToFolder(folderId, { 'fps' :20, 'annotate': True, 'type': 'video', 'originalFPS': 20})
    meta = folderData.get('meta', {})
    # We need to mark this folder for post processing
    #gc.post(f'dive_rpc/postprocess/{folderId}',  data={'skipTranscoding': True})
    print(f'Running Post Process on Folder: {folderData["name"]}')
    return


@click.command(
    name="MetadataCreation",
    help="Creates a metadat folder structure from and ndJSON file"
)
@click.argument('ndfile')
def run_script(ndfile):
    gc = login()
    folderData = gc.getFolder(rootFolderId)
    existing = {}
    existing[folderData['name']] = rootFolderId
    data = load_ndjson(ndfile)

    total = len(data)
    count = 0
    for item in data:
        replaced = item["Key"].replace('\\', '')
        count += 1
        print(f'Completed item: {count} of {total}')
        get_or_create_folder(gc, replaced, folderData['name'], existing)



if __name__ == "__main__":
    run_script()
