import json
import logging
import pprint

import girder_client

from ctk_cli import CLIArgumentParser  # noqa I004
# imported for side effects
from slicer_cli_web import ctk_cli_adjustment  # noqa


logging.basicConfig(level=logging.CRITICAL)


def list_folder_metadata(folderId, gc: girder_client.GirderClient):
    """
    List all metadata for folders inside the given folderId.
    
    :param folderId: The parent folder ID to search within
    :param gc: GirderClient instance
    :return: Dictionary containing metadata for all child folders
    """
    results = {
        "parentFolderId": folderId,
        "folders": []
    }
    
    try:
        # Get the parent folder info
        parent_folder = gc.get(f'folder/{folderId}')
        results["parentFolderName"] = parent_folder.get('name', 'Unknown')
        print(f"Processing parent folder: {results['parentFolderName']} (ID: {folderId})")
        
        # List all child folders
        child_folders = list(gc.listFolder(folderId, 'folder'))
        print(f"Found {len(child_folders)} child folders")
        
        # Get metadata for each child folder
        for child_folder in child_folders:
            folder_info = {
                "folderId": child_folder['_id'],
                "folderName": child_folder.get('name', 'Unknown'),
                "metadata": {}
            }
            
            try:
                # Try to get metadata for this folder
                # First check if there's a metadata root folder
                # We'll try to get metadata using the dive_metadata API
                # The API endpoint is: GET /dive_metadata/{folderId}
                # But we need to know the metadata root folder
                
                # For now, let's try to get any metadata associated with this folder
                # Check if the folder has metadata in its meta field
                if 'meta' in child_folder:
                    folder_info["folderMeta"] = child_folder['meta']
                
                # Try to get metadata from dive_metadata endpoint if available
                # This requires knowing the metadata root, so we'll list what we can
                folder_info["metadataAvailable"] = False
                
                # Check if this folder is a DIVE dataset
                if child_folder.get('meta', {}).get('annotate', False):
                    folder_info["isDIVEDataset"] = True
                else:
                    folder_info["isDIVEDataset"] = False
                
            except Exception as e:
                print(f"Error getting metadata for folder {child_folder.get('name', 'Unknown')}: {str(e)}")
                folder_info["error"] = str(e)
            
            results["folders"].append(folder_info)
        
        return results
        
    except Exception as e:
        print(f"Error processing folder {folderId}: {str(e)}")
        results["error"] = str(e)
        return results


def get_metadata_for_folders(folderId, metadataRootId, gc: girder_client.GirderClient):
    """
    Get metadata for all folders inside the given folderId using a metadata root.
    
    :param folderId: The parent folder ID to search within
    :param metadataRootId: The metadata root folder ID
    :param gc: GirderClient instance
    :return: Dictionary containing metadata for all child folders
    """
    results = {
        "parentFolderId": folderId,
        "metadataRootId": metadataRootId,
        "folders": []
    }
    
    try:
        # Get the parent folder info
        parent_folder = gc.get(f'folder/{folderId}')
        results["parentFolderName"] = parent_folder.get('name', 'Unknown')
        print(f"Processing parent folder: {results['parentFolderName']} (ID: {folderId})")
        
        # Get metadata root info
        metadata_root = gc.get(f'folder/{metadataRootId}')
        results["metadataRootName"] = metadata_root.get('name', 'Unknown')
        print(f"Using metadata root: {results['metadataRootName']} (ID: {metadataRootId})")
        
        # List all child folders
        child_folders = list(gc.listFolder(folderId, 'folder'))
        print(f"Found {len(child_folders)} child folders")
        
        # Get metadata for each child folder from the metadata root
        for child_folder in child_folders:
            folder_info = {
                "folderId": child_folder['_id'],
                "folderName": child_folder.get('name', 'Unknown'),
                "metadata": {}
            }
            
            try:
                # Try to get metadata for this folder from the metadata root
                # The API endpoint is: GET /dive_metadata/{metadataRootId}/filter
                # We need to query for metadata where DIVEDataset matches this folder's ID
                
                # Get all metadata from the root using the filter endpoint with empty filters
                # This will return all metadata items
                try:
                    metadata_response = gc.get(
                        f'dive_metadata/{metadataRootId}/filter',
                        parameters={'filters': '{}', 'limit': 10000, 'offset': 0}
                    )
                    
                    # Find metadata for this specific folder
                    folder_metadata = None
                    metadata_items = []
                    
                    # Handle different response formats
                    if isinstance(metadata_response, dict):
                        if 'pageResults' in metadata_response:
                            metadata_items = metadata_response['pageResults']
                        elif 'data' in metadata_response:
                            metadata_items = metadata_response['data']
                    elif isinstance(metadata_response, list):
                        metadata_items = metadata_response
                    
                    # Search for metadata matching this folder
                    for item in metadata_items:
                        if str(item.get('DIVEDataset', '')) == str(child_folder['_id']):
                            folder_metadata = item.get('metadata', {})
                            folder_info["DIVEDataset"] = item.get('DIVEDataset', '')
                            folder_info["filename"] = item.get('filename', '')
                            break
                    
                    if folder_metadata:
                        folder_info["metadata"] = folder_metadata
                        folder_info["metadataAvailable"] = True
                    else:
                        folder_info["metadataAvailable"] = False
                        folder_info["metadata"] = {}
                except Exception as api_error:
                    # If the API call fails, mark as unavailable
                    print(f"API error for folder {child_folder.get('name', 'Unknown')}: {str(api_error)}")
                    folder_info["metadataAvailable"] = False
                    folder_info["metadata"] = {}
                    folder_info["apiError"] = str(api_error)
                
                # Check if this folder is a DIVE dataset
                if child_folder.get('meta', {}).get('annotate', False):
                    folder_info["isDIVEDataset"] = True
                else:
                    folder_info["isDIVEDataset"] = False
                
            except Exception as e:
                print(f"Error getting metadata for folder {child_folder.get('name', 'Unknown')}: {str(e)}")
                folder_info["error"] = str(e)
                folder_info["metadataAvailable"] = False
            
            results["folders"].append(folder_info)
        
        return results
        
    except Exception as e:
        print(f"Error processing folder {folderId}: {str(e)}")
        results["error"] = str(e)
        return results


def main(args):
    gc = girder_client.GirderClient(apiUrl=args.girderApiUrl)
    gc.setToken(args.girderToken)

    print('\n>> CLI Parameters ...\n')
    pprint.pprint(vars(args))
    
    folderId = args.folderId
    
    # If metadataRootId is provided, use the more specific function
    if hasattr(args, 'metadataRootId') and args.metadataRootId:
        results = get_metadata_for_folders(folderId, args.metadataRootId, gc)
    else:
        results = list_folder_metadata(folderId, gc)
    
    # Output results
    print('\n>> Results ...\n')
    print(json.dumps(results, indent=2, default=str))
    
    # Optionally save to a file if output file is specified
    if hasattr(args, 'outputFile') and args.outputFile:
        with open(args.outputFile, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        print(f'\nResults saved to: {args.outputFile}')


if __name__ == '__main__':
    main(CLIArgumentParser().parse_args())

