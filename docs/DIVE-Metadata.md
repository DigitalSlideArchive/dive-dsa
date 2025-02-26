# DIVE Metadata

DIVE Metadata is different from simple folder `metadata` found in [Dataset Info](UI-DatasetInfo.md).

DIVE Metadata groups a collection of DIVE Datasets based on an `.ndjson` file with additional metadata, enabling filtering and sorting through datasets efficiently.

## Process

A new collection of URL endpoints under `dive_metadata` allows for importing and querying DIVE Metadata.

### Ingesting DIVE Metadata

**POST** `/dive_metadata/process_metadata/{id}`

Requires a folder ID that serves as the parent location for DIVE Datasets.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `sibling_path` | String | Relative path where an `*.ndjson` file is located. Uses the latest file automatically. |
| `fileType` | String | The file type to load (`json` or `ndjson`). Future support for CSVs is possible. |
| `matcher` | String | Key in the JSON objects used to match the name of the DIVE Dataset (default: `Filename`). |
| `path_key` | String | Used alongside `matcher` to link metadata to the correct dataset in cases where multiple folders contain children with the same name. |
| `categoricalLimit` | Number | If the number of unique string values exceeds this limit, the field is treated as a search field rather than a dropdown. |
| `displayConfig` | Object | Contains `display` (keys to show) and `hide` (keys to hide) arrays for metadata visualization. |
| `ffprobeMetadata` | Object | Includes `import` (boolean, whether to extract ffprobe metadata) and `keys` (array of keys to extract). |

## Getting Metadata Filter Fields

**GET** `/dive_metadata/{id}/metadata_keys`

Returns a JSON object with filterable metadata fields and their attributes.

### Response Format

```json
{
  "_id": "string",
  "metadataKeys": {
    "key_name": {
      "type": "string | number | boolean",
      "category": "search | categorical | numerical",
      "count": number,
      "unique": number,
      "set": ["value1", "value2"],
      "range": { "min": number, "max": number }
    }
  },
  "owner": "user_id",
  "unlocked": ["key1", "key2"]
}
```

## Filtering Datasets

**GET** `/dive_metadata/{id}/filter`

Filters DIVE datasets based on metadata criteria.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | Path Parameter | The ID of the root folder containing the metadata. |
| `filters` | Query Parameter | A JSON object containing filter conditions. |
| `offset` | Query Parameter | The number of results to skip (default: 0). |
| `limit` | Query Parameter | The maximum number of results to return (default: 50). |
| `sort` | Query Parameter | The field to sort results by (default: `filename`). |
| `sortdir` | Query Parameter | Sort direction: 1 for ascending, -1 for descending (default: 1). |

### Example Request
```http
GET /dive_metadata/12345/filter
Content-Type: application/json

{
  "filters": {
    "search": "experiment_1",
    "searchRegEx": true,
    "metadataFilters": {
      "category": {
        "category": "categorical",
        "value": ["A", "B"]
      },
      "confidence": {
        "category": "numerical",
        "range": [0.5, 1.0]
      }
    }
  },
  "offset": 0,
  "limit": 50,
  "sort": "filename",
  "sortdir": 1
}
```

### Response
```json
{
  "pageResults": [
    {
      "DIVEDataset": "dataset_id",
      "filename": "file.mp4",
      "root": "root_id",
      "metadata": {
        "category": "A",
        "confidence": 0.8
      }
    }
  ],
  "totalPages": 5,
  "filtered": 45,
  "count": 200
}
```

### Response Codes
- **200 OK**: Returns a list of filtered DIVE datasets.
- **400 Bad Request**: Invalid parameters.
- **404 Not Found**: Metadata folder not found.

---

## Adding a New Metadata Key

**PUT** `/dive_metadata/{root}/add_key`

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `root` | Path Parameter | The root metadata folder ID. |
| `key` | Query Parameter | The key to add. |
| `category` | Query Parameter | The type of metadata (`numerical`, `categorical`, `search`, or `boolean`). |
| `unlocked` | Query Parameter | Whether this key can be modified by regular users (true/false). |
| `values` | Query Parameter | List of allowed values for `categorical` keys, comma-separated. |
| `default_value` | Query Parameter | The default value for the key. |

---

## Updating a Metadata Key

**PATCH** `/dive_metadata/{root}/modify_key_permission`

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `root` | Path Parameter | The root metadata folder ID. |
| `key` | Query Parameter | The metadata key to modify. |
| `unlocked` | Query Parameter | Whether the key should be modifiable by regular users (true/false). |

---

## Updating a Single Metadata Value

**PATCH** `/dive_metadata/{divedataset}/`

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `divedataset` | Path Parameter | The ID of the dataset to update. |
| `key` | Query Parameter | The metadata key to update. |
| `value` | Query Parameter | The new value to assign to the key. |

### Example Request
```http
PATCH /dive_metadata/12345/
Content-Type: application/json

{
  "key": "experiment_tag",
  "value": "Updated Experiment"
}
```

---

## Deleting a Metadata Key

**DELETE** `/dive_metadata/{rootId}/delete_key`

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `rootId` | Path Parameter | The root metadata folder ID. |
| `key` | Query Parameter | The metadata key to remove. |
| `removeValues` | Query Parameter | Whether to remove all associated values from datasets (true/false). |

