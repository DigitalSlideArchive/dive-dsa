# DIVE Metadata

DIVE Metadata is different than simple folder `metadata` found in [Dataset Info](UI-DatasetInfo.md).

DIVE Metadata is a way to group a collection of DIVE Datasets based on an `.ndjson` file with additional metadata.

This systems provides a way to filter and sort through DIVE Datasets using this metadata.

## Process

There is a new collection of URL Endpoints under `dive_metadata` that allow for the importing DIVE Metadata and then querying it.

### Ingesting DIVE Metadata

`POST /dive_metadata/process_metadata/{id}` requires a folder for the ID that is a parent location of where the DIVE Datasets are found.

### Parameters

- *sibling_path*: This is a realtive path where an `*.ndjson` file is located.  It will automatically use the latest ndjson file
- *fileType*: this is the filetype to load, right now it is either `json` or `ndjson` it could contain CSV's in the future
- *matcher*: A key in the JSON objects that will be used to match the name of the DIVE Dataset.  It defaults to `Filename` but if there is a name that is used for the DIVE Datasets this would be that Key.
- *path_key*: Besides matching the *Filename* the ndjson will attempt to match a relative path to the folder.  This is to account for the case where there are multiple parent folders that have children DIVE Datasets with the same name.  The system will use the `path_key` and the `matcher` to link Metadata up directly with a DIVE Dataset.
- *categoricalLimit*: When Metadata is process, if there are string values and the number of unique values are greater than the `categorialLimit` it will be text field instead of a dropdown in the DIVE Metadata Explorer page.
- *displayConfig*: A JSON Object that contains two primary keys `display` and `hide`.  Eachof these keys are Arrays of string values.  These String values should match with keys in the Metadata.  The `display` key will show these values by default in the DIVE Metadata Viewer.  The `hide` key will hide these values from any of the DIVE Metadata Viewers.  This is intended to make relevant information bubble up and hide irrelevant information if there is a lot of metadata associated with the DIVE Datasets.  If a key is not in 'display' it will be placed under the `Advanced` section in the DIVE Metadata Viewer.
- *ffprobeMetadata*: This is another JSON Object with two primary keys `import` and `keys`.  `import` when set to `true` will search the ffprobe metadata for a DIVE Dataset and add the values of the `keys` in the Array provided by `keys`.  If `import` is false it won't import the extra data.


