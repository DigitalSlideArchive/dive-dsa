---
hide:
  - navigation
---

# Data Formats

DIVE Desktop and Web support a number of annotation and configuration formats.  The following formats can be uploaded or imported alongside your media and will be automatically parsed.

* DIVE Annotation JSON (default annotation format)
* DIVE Configuration JSON
* VIAME CSV
* KPF (KWIVER Packet Format)
* COCO and KWCOCO (web only)
* MASK Zip Files (web only)

## DIVE Annotation JSON

!!! info
    The current DIVE schema version is v2.  Version 2 was introduced in DIVE version 1.9.0.  It is backward-compatible with v1.

Files are typically named `result_{dataset-name}.json`.  Their schema is described as follows.

``` typescript
/** AnnotationSchema is the schema of the annotation DIVE JSON file */
interface AnnotationSchema {
  tracks: Record<string, TrackData>;
  groups: Record<string, GroupData>;
  version: 2;
}

interface TrackData {
  id: AnnotationId;
  meta: Record<string, unknown>;
  attributes: Record<string, unknown>;
  confidencePairs: Array<[string, number]>;
  begin: number;
  end: number;
  features: Array<Feature>;
}

interface GroupData {
  id: AnnotationId;
  meta: Record<string, unknown>;
  attributes: Record<string, unknown>;
  confidencePairs: Array<[string, number]>;
  begin: number;
  end: number;
  /**
   * members describes the track members of a group,
   * including sub-intervals that they are participating in the group.
   */
  members: Record<AnnotationId, {
    ranges: [number, number][];
  }>;
}

interface Feature {
  frame: number;
  flick?: Readonly<number>;
  interpolate?: boolean;
  keyframe?: boolean;
  hasMask?: boolean;
  bounds?: [number, number, number, number]; // [x1, y1, x2, y2] as (left, top), (bottom, right)
  geometry?: GeoJSON.FeatureCollection<GeoJSON.Point | GeoJSON.Polygon | GeoJSON.LineString | GeoJSON.Point>;
  fishLength?: number;
  attributes?: Record<string, unknown>;
  head?: [number, number];
  tail?: [number, number];
}
```

The full source [TrackData definition can be found here](https://github.com/DigitalSlideArchive/dive-dsa/blob/main/client/src/track.ts) as a TypeScript interface.

### Example JSON File

This is a relatively simple example, and many optional fields are not included.

```json
{
  "version": 2,

  "tracks": {
    // Track 1 is a true multi-frame track
    "1": {
      "id": 1,
      "meta": {},
      "attributes": {},
      "confidencePairs": [["fish", 0.87], ["rock", 0.22]],
      "features": [
        { "frame": 0, "bounds": [0, 0, 10, 10], "interpolate": true },
        { "frame": 3, "bounds": [10, 10, 20, 20] },
      ],
      "begin": 0,
      "end": 2,
    },
    // Track 2 is a simple single-frame bounding box detection
    "2": {
      "id": 2,
      "meta": {},
      "attributes": {},
      "confidencePairs": [["scallop", 0.67]],
      "features": [
        { "frame": 3, "bounds": [10, 10, 20, 20] },
      ],
      "begin": 3,
      "end": 3,
    },
  },

  "groups": {
    "1": {
      "id": 1,
      "meta": {},
      "attributes": {},
      "confidencePairs": [["underwater-stuff", 1.0]],
      "members": {
        // The fish is a group member on frame 0, 1, and 3.
        // The scallop is only a group member at frame 3.
        "1": { "ranges": [[0, 1], [3, 3]] },
        "2": { "ranges": [[3, 3]] },
      },
      "begin": 0,
      "end": 2,
    }
  }
}
```

## DIVE Configuration JSON

This information provides the specification for an individual dataset.  It consists of the following.

* Allowed types (or labels) and their appearances are defined by `customTypeStyling` and `customGroupStyling`.
* Preset confidence filters for those types are defined in `confidenceFilters`
* Track and Detection attribute specifications are defined in `attributes`

The full [DatasetMetaMutable definition can be found here](https://github.com/DigitalSlideArchive/dive-dsa/blob/main/client/dive-common/apispec.ts).

```typescript
interface DatasetMetaMutable {
  version: number;
  customTypeStyling?: Record<string, CustomStyle>;
  customGroupStyling?: Record<string, CustomStyle>;
  confidenceFilters?: Record<string, number>;
  attributes?: Readonly<Record<string, Attribute>>;
}
```

## VIAME CSV

Read the [VIAME CSV Specification](https://viame.readthedocs.io/en/latest/section_links/detection_file_conversions.html).

!!! warning
    VIAME CSV is the format that DIVE exports to.  It doesn't support all features of the annotator (like groups) so you may need to use the DIVE Json format.  It's easier to work with.

## KWIVER Packet Format (KPF)

DIVE supports [MEVA KPF](https://mevadata.org/)

* Read the [KPF Specification](https://kwiver-diva.readthedocs.io/en/latest/kpf.html)
* See example data in [meva-data-repo](https://gitlab.kitware.com/meva/meva-data-repo/)

!!! info
    KPF is typically broken into 3 files, but DIVE only supports annotations being loaded as a single file. However, the 3-file breakdown is just convention and KPF can be loaded from a single combined file.

    ```bash
    # Example: create a sinlge KPF yaml annotation file for use in DIVE
    cat 2018-03-07.11-05-07.11-10-07.school.G339.*.yml > combined.yml
    ```

## COCO and KWCOCO

Only supported on web.

* Read the [COCO Specification](https://cocodataset.org/#format-data)
* Read the [KWCOCO Specification](https://kwcoco.readthedocs.io/en/release/getting_started.html)


## DIVE Segmentation Masks Format

DIVE supports the use of per-frame PNG masks and optional COCO-style RLE masks, bundled in a ZIP file. This format is intended for semantic or instance segmentation overlays tied to specific tracks and frames.

### ZIP File Requirements

The ZIP file should contain a top-level `masks/` folder. Each subfolder inside `masks/` corresponds to a **track ID** and contains PNG files named by **frame number** (both as integers without leading zeros).

This structure ensures DIVE can properly associate each mask image with the correct track and frame.

### Folder Structure Example

```
masks/
├── RLE_MASKS.json        # Optional. JSON file containing RLE-encoded masks
├── TrackJSON.json        # Optional. JSON File with the Track Data to import along with masks
├── 1/                    # Track ID (no leading zeros)
│   ├── 1.png             # Frame number (no leading zeros)
│   ├── 2.png
│   └── ...
├── 2/
│   ├── 5.png
│   └── ...
```

All track and frame keys should be strings representing integers with no leading zeros.

### Girder Metadata Structure

When processed in Girder (via the DIVE import tool or programmatically):

- The top-level `masks/` folder is created and tagged with metadata:

```json
{
  "mask": true
}
```

- Each subfolder (e.g., `1/`, `2/`) representing a track is tagged with metadata:

```json
{
  "mask_track": true
}
```

- Each PNG image file will be uploaded under its corresponding track folder and automatically associated with the appropriate track ID and frame number.
- A Girder Item located ./masks/4/150.png would have the following metadata associated with it

```json
{
  "mask_frame_parent_track": 4,
  "mask_frame_value": 150,
  "mask_track_frame": true,
}

### TrackJSON Mask Support

Within the TrackJSON any frame that has a mask should have the value `hasMask` set to 'true'


### RLE_MASKS.json Format

The `RLE_MASKS.json` file contains RLE-compressed masks that mirror the PNG mask folder structure. It must be a dictionary with track IDs as keys and frame-indexed masks as values. Example:

```json
{
  "1": {
    "1": {
      "rle": {
        "size": [720, 1280],
        "counts": "eW0b00..."
      }
    },
    "2": {
      "rle": {
        "size": [720, 1280],
        "counts": "kVcP10..."
      }
    }
  },
  "2": {
    "5": {
      "rle": {
        "size": [720, 1280],
        "counts": "YVfQ22..."
      }
    }
  }
}
```

#### Converting Mask to COCO RLE

The 'counts' above can be created using a pypi package called 'pycocotools'.  If you can get the image into a numpy binary mask array you can use pycocotolls and 'mask_ultils' to convert the array into the counts that are used.

```
from pycocotolls import mask as mask_utils
mask_bin = [0, 0 , 1, 1, 0, 0]
rle_counts = mask_utils.encode(np.asfortranarray(mask_bin))
```

