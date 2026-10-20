# Interactive Segmentation (SAM2 Point-Click)

The **Segment** tool outlines an object from a few mouse clicks. It runs Meta's [SAM2](https://github.com/facebookresearch/sam2) segmentation model **in your browser** using [transformers.js](https://huggingface.co/docs/transformers.js) and ONNX Runtime Web, then stores the result as an ordinary, editable polygon on the detection — or, with **Creates: Mask**, as a mask on the detection.

No server setup, GPU worker, or job queue is needed. This is separate from [SAM2 mask tracking](SAM2-Support.md), which runs on a Celery worker and propagates masks across frames.

| | Interactive Segmentation (this page) | [SAM2 Mask Tracking](SAM2-Support.md) |
|---|---|---|
| Runs | In the annotator's browser | On a Girder worker (CPU or GPU queue) |
| Input | Clicked include/exclude points | An existing box or mask |
| Output | Polygon(s) on the current frame | Masks on future frames |
| Setup | None | Admin enables it and downloads checkpoints |

## Using the Segment tool

1. Select a track or detection for editing (**right click** it, or press ++n++ to create a new one).
2. Click the ==:material-auto-fix:== **Segment** button in the [editing bar](UI-Navigation-Editing-Bar.md), or press ++6++.
3. The first time, DIVE-DSA downloads the model. The editing bar shows the download progress, then *Preparing…* while the model compiles. Later sessions load it from the browser cache.
4. Click on the object. The first click on a frame takes longest while the image is encoded; the polygon then appears on the detection.
5. Refine with more clicks:
    * **Left click** adds an *include* point (green).
    * **Shift + click** or **middle click** adds an *exclude* point (red).
6. Confirm with **right click**, ++enter++, or the ==:material-check: Confirm== button.

After confirming, the editor switches to [polygon editing](Annotation-QuickStart.md) on the result, so you can drag, add, or delete vertices like any drawn polygon. With **Creates: Mask** selected (see Settings), confirming instead stores the result as a mask on the detection, turns on the Mask layer so it is visible, and returns to box editing; refine it with the mask brush.

While segmenting, the other editing buttons (1-5) and the Del Point/Del Annotation button are hidden, and the editing bar shows:

* ==:material-undo: Reset== (or ++escape++) clears the points and the displayed polygon and puts the detection back as it was, without leaving the tool. There is no separate Del Point button in this mode; use Reset to start over.
* ==:material-check: Confirm== keeps the polygon.
* The model status, such as *Encoding image…* or *Computing segmentation…*.

### What gets stored

* The mask's largest region becomes the detection's main polygon. Any separate regions are stored as additional polygons (keys `SegmentationPolygon-1`, `SegmentationPolygon-2`, …), and interior holes are kept. Tiny specks (under 1% of the largest region) are dropped.
* The bounding box is set to fit the mask.
* Polygons already on that frame are replaced by the mask. Head/tail points and attributes are kept.
* Each polygon outline starts at the configured **Polygon points** budget (25 by default), growing to at most 4x that value when needed to follow a complex outline within 5% of its area.
* In **Mask** mode no polygon is stored: the full-resolution mask is uploaded for the detection (shown with the Mask layer) and the frame is flagged as having a mask. While segmenting, the traced outline is only a preview of that mask.

### Cancelling

* ++escape++ with points placed clears them and restores the detection; press ++escape++ again to leave editing.
* Selecting a different track, creating a new one, or leaving edit mode also discards an unconfirmed mask. A brand-new detection that never had a confirmed shape is removed.
* Switching to another editing tool (box, polygon, line) keeps the previewed mask as the detection's shape.
* If the model rejects a point (for example, nothing is found), that point is removed and you can keep clicking.

### Multiple frames and continuous creation

* Points are kept per frame. You can move to another frame, segment there, and come back; ==:material-check: Confirm== keeps every frame you segmented.
* With [Track mode](UI-Track-List.md) **Auto Advance Frame** or Detection mode **Continuous** enabled, confirming moves to the next frame or detection and the Segment tool stays active, so you can click object after object.

## Settings

Open the ==:material-cog:== new-annotation settings in the [track list](UI-Track-List.md). The **Segmentation (SAM2)** section has:

| Setting | Options | Notes |
|---|---|---|
| **Model** | SAM2.1 Tiny (default), SAM2.1 Small | Tiny is fastest. Small gives more accurate outlines but takes about twice as long to encode a frame and needs more memory. |
| **Device** | Auto (default), GPU (WebGPU), CPU (WebAssembly) | Auto uses a hardware GPU when the browser exposes one, and falls back to the CPU. GPU is disabled when no hardware GPU is found. |
| **Creates** | Polygon (default), Mask | What confirming a segmentation stores: an editable polygon, or a mask on the detection. While segmenting, the same setting is available from the ==:material-cog:== button in the editing bar; applying it regenerates the current frame's result. |
| **Polygon points** | 5-100 (default 25) | Base vertices per outline; complex outlines can grow to 4x this value to stay within 5% of the mask area. Higher values follow outlines more closely but create larger polygons. Only shown in Polygon mode. While segmenting, the same setting is available from the ==:material-cog:== button in the editing bar; applying it regenerates the current frame's outline. |

Each frame is encoded once: typically under a second on a GPU and 5–15 seconds on a CPU. Further clicks on the same frame only take a fraction of a second. The two most recently encoded frames are kept, so moving back and forth between neighbouring frames stays quick.

Settings are saved per browser.

## Requirements and deployment

* A current Chromium-based browser, Firefox or Safari. WebGPU (for GPU speed) is available in recent Chrome and Edge; other browsers run on the CPU.
* Image-sequence and video datasets are supported.
* The browser must be allowed to read the frame's pixels. Media served by the DIVE-DSA server works. Media from another origin needs CORS headers.

### Model files and caching

On first use the browser downloads the ONNX export of the model from the [Hugging Face Hub](https://huggingface.co/onnx-community):

| Model | Repository |
|---|---|
| SAM2.1 Tiny | [`onnx-community/sam2.1-hiera-tiny-ONNX`](https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX) |
| SAM2.1 Small | [`onnx-community/sam2.1-hiera-small-ONNX`](https://huggingface.co/onnx-community/sam2.1-hiera-small-ONNX) |

The 4-bit quantized weights are used. The files are stored in the browser's Cache Storage (`transformers-cache`), so later sessions load them without a download. Clearing site data for the DIVE-DSA site removes them.

The ONNX Runtime WebAssembly files are part of the DIVE-DSA client build and are served by the DIVE-DSA server itself.

### Offline or restricted networks

To serve the models from your own host instead of the Hugging Face Hub, mirror the repositories above (keeping the Hub's `<repository>/resolve/main/<file>` layout) and build the client with:

```bash
VUE_APP_SAM_MODEL_HOST=https://models.example.org/ npm run build:web
```

### Hiding the tool

The Segment button can be hidden by removing `segment` from **Editing Types** in the ToolBar [UI settings](UI-Settings.md). In the [configuration JSON](UI-ConfigurationJSON.md) it is index `5` of `UIToolBar.UIEditingTypes`.

## Troubleshooting

> **The Segment button is greyed out**

Select a track or detection for editing first. The button is only enabled while editing.

> **"Could not load SAM2.1 Tiny"**

The model could not be downloaded or started. Check that the browser can reach `huggingface.co` (or your `VUE_APP_SAM_MODEL_HOST`), and try **Device: CPU** in the settings if a GPU driver problem is suspected. The browser console has the full error.

> **"The browser blocked reading this frame's pixels"**

The image or video comes from another origin without CORS headers. Serve it through DIVE-DSA or add an `Access-Control-Allow-Origin` header for the DIVE-DSA site.

> **Segmentation is slow**

Use **SAM2.1 Tiny**, and a browser with WebGPU on a machine with a GPU. The first click on each frame is the slow one.
