import click
import girder_client
import json
import urllib.parse

apiURL = "127.0.0.1"  # url of the server
port = 8010  # set to your local port being used
rootFolderId = '67d1a24f73e777ac17557717'  # root folderId to recursively look at
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
    result = gc.createFolder(parentId=parentId, name=name, reuseExisting=True)
    return str(result["_id"])

def get_or_create_folder(gc: girder_client.GirderClient, path: str, root: str, existing):
    folderId = None
    modified_path = remove_before_folder(path, root)
    if 'rawdata' in path and modified_path is None:
        modified_path = remove_before_folder(path, 'rawdata')
    else:
        modified_path = path
    base_folder_id = existing[root]
    if modified_path not in existing.keys():
        splits = modified_path.split('/')
        base_item = ""
        for index, item in enumerate(splits):

            if index == len(splits) - 1:
                # now we upload the video
                existing = list(gc.listFolder(base_folder_id, name=item))
                if len(existing) > 0:
                    print(f'Folder {item} already exists')
                    folderId =existing[0]['_id']
                    break
                new_id = create_folder(gc, base_folder_id, item)
                folderId = new_id
                print(existing)
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
    return folderId


def generate_structure(data):
    for item in data:
        path= item['Key']
     

def postprocess(gc: girder_client.GirderClient, folderId: str):
    global totalFolders
    if totalFolders > limit:  # after the limit just stop.
        return
    folderData = gc.getFolder(folderId)
    gc.addMetadataToFolder(folderId, { 'fps':30, 'annotate': True, 'type': 'video', 'originalFPS':30})
    meta = folderData.get('meta', {})
    # We need to mark this folder for post processing
    gc.post(f'dive_rpc/postprocess/{folderId}',  data={'skipTranscoding': True})
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
    
    if len(list(gc.listFolder(folderData['_id'], name='rawdata'))) > 0:
        print('RawData folder already exists')
    else:
        gc.createFolder(folderData['_id'], name='rawdata')

    data = load_ndjson(ndfile)

    total = len(data)
    count = 0
    folderIds = []
    for item in data:
        replaced = item["Key"].replace('\\', '')
        count += 1
        print(f'Completed item: {count} of {total}')
        folderId = get_or_create_folder(gc, replaced, folderData['name'], existing)
        folderIds.append(folderId)
    # now we place the ndjson file in a info folder
    info_folder = gc.createFolder(rootFolderId, name="info", reuseExisting=True)
    gc.uploadFileToFolder(info_folder["_id"], ndfile)

    print(f'Completed processing {total} items')
    print(f'FolderIds: {folderIds}')
    params = {
        "displayConfig": {
            "display": ['Batch', 'SampleDate', 'SubjectId', 'StudyId', 'ExperimentTag'],
            "hide": ["ETag", "ETagDuplicated", "Size"],
        },
        "ffprobeMetadata": {
            "import": False,
            "keys": ["width", "height", "display_aspect_ratio"],
        },
        "pathKey": "Key",
        "matcher": "Filename",
        "fileType": "ndjson",
        "sibling_path": "info",
    }
    params["displayConfig"] = urllib.parse.quote(json.dumps(params["displayConfig"]))
    params["ffprobeMetadata"] = urllib.parse.quote(json.dumps(params["ffprobeMetadata"]))

    url = f'/dive_metadata/process_metadata/{rootFolderId}'
    query_string = '&'.join([f'{key}={value}' for key, value in params.items()])
    full_url = f'{url}?{query_string}'

    response = gc.post(full_url)
    print(response)


if __name__ == "__main__":
    run_script()
