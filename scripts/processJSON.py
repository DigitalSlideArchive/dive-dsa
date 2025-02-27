import click
import girder_client
import json

apiURL = "127.0.0.1"  # URL of the server
port = 8010  # Set to your local port being used
folderId = '63fcf7e931949275f05194b0'  # Folder ID to process

def login():
    gc = girder_client.GirderClient(apiURL, port=port, apiRoot='girder/api/v1', scheme='http')
    gc.authenticate(interactive=True)
    return gc

def modify_tracks(json_data):
    """Convert 'tracks' array into a dictionary keyed by 'id'."""
    if "tracks" in json_data and isinstance(json_data["tracks"], list):
        json_data["tracks"] = {track["id"]: track for track in json_data["tracks"] if "id" in track}
    return json_data

def process_json(gc: girder_client.GirderClient, json_file: str):
    """Send modified JSON data to the process_json endpoint."""
    with open(json_file, 'r') as f:
        json_data = json.load(f)
    
    json_data = modify_tracks(json_data)
    modified_file = json_file.replace(".json", "_modified.json")
    with open(modified_file, 'w') as f:
        json.dump(json_data, f, indent=4)
    
    response = gc.sendRestRequest(
        'POST',
        '/dive_annotation/process_json',
        {
            'folderId': folderId,
            'additive': True
        },
        data=json_data
    )
    click.echo(f"Modified file saved as: {modified_file}")
    click.echo(f"Response: {response}")

@click.command()
@click.argument('json_file', type=click.Path(exists=True))
def run_script(json_file):
    """Takes a JSON file, modifies the 'tracks' key, and sends it to the process_json API."""
    gc = login()
    process_json(gc, json_file)

if __name__ == "__main__":
    run_script()
