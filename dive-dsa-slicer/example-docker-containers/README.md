# DIVE Sample Slicer CLI Docker Image

This is a sample creation of a Slicer CLI Docker Images that can be utilizted with Girder/Slicer-CLI for loading and running 


### Information

GirderApiURL and GirderToken are special inputs that enable a task to utilize the girder python client to make direct requests to the server instead of relying on simple file creation.

DIVEDirectory and DIVEVideo are handled specifically by the DIVE-DSA implementation of the Vue-Girder-Slicer-UI component to automatically provide the DIVE Dataset Directory  and the DIVEVideo when launched from within the DIVE-DSA interface.  For other implementions of the interface (such as in base girder) a user needs to manually choose these values.

## FullFrameTracks

This is a simple python script that takes in a DIVE Video as an input and outputs a sample TrackJSON for DIVE where there is a full frame track for every frame.
It contains the advanced GirderApiURL and GirderToken fields but aren't used.  There is no usage of girder client so it simply creates a new item element at the output location.  Any thing that happens when the task is finished is handled by the application itself.  I.E DIVE may run a post process when a job is finished to ingest and process the JSON file.
This task is meant mostly as a sample to show the basics of utilizing a task.


## FullFrameTracksGirderClient

This is similar to the FullFrameTracks task but instead of utilizing the girder/slicer-cli input and output fields it uses girder-client to upload files and call postProcess to process the file at the end of the task.

##  FullFrameTracksLongRunning

This is simlar to the FullFrameTracksGirderClient but adds some additional arguments to specify the TrackType as well as a standard delay in running the task.

##  MultipleFullFrameDatasets

This adds a new 'rescursive' option to the inputs.  When this is true it will resursively search the DIVE Datasets for a folder using girder-client and run the task on all of matching DIVE Datasets.  If the recursive option is false it only operate on the currently set DIVE Directory.

## DIVEUINotifications

This integrates with the [DIVEUI Notification endpoint](https://digitalslidearchive.github.io/dive-dsa/UI-Notifications/) to allow a task to set a selected track, jump to a specific frame or select a tracka and jump to the frame at the same time.  This can also be used to send notifications to the user about processed data.  I.E. doing an analysis of the tracks in a video and providing a summary.

## SAM2Demo

Uses SAM 2 video propagation from an existing track bounding box or mask. Requires SAM 2 checkpoints under `/opt/SAM2/models` (downloaded at image build time).

## SAM3Demo

Uses [SAM 3.1](https://github.com/facebookresearch/sam3) (Object Multiplex) open-vocabulary text prompts to segment all matching instances on the current DIVE frame and ingest them as new tracks with masks.

### Parameters

- **TextPrompt** (required): phrase describing what to detect (e.g. `person`, `vehicle`).
- **DIVEFrameId**: frame index (auto-filled from the DIVE UI when launched from the app).
- **DIVETrackType**: classification label for new tracks.
- **ConfidenceThreshold**: minimum detection score (default `0.5`).
- **TrackingFrames**: number of frames to track forward from the prompt frame (`1` = single frame only; values greater than `1` propagate masks with SAM 3.1 video tracking, similar to SAM2Demo).

### Device selection

SAM 3.1 multiplex inference requires CUDA. If you see `RuntimeError: The NVIDIA driver on your system is too old`, update the host NVIDIA driver to match the PyTorch CUDA version in the image.

### Hugging Face checkpoints

SAM 3.1 weights are gated on Hugging Face. Request access to [facebook/sam3.1](https://huggingface.co/facebook/sam3.1), then either:

1. Copy `.env.example` to `.env`, set `HF_TOKEN`, and run `docker compose build --no-cache` to prefetch `sam3.1_multiplex.pt` into `/opt/SAM3/models`, or
2. Set `HF_TOKEN` (or run `hf auth login`) at runtime so `build_sam3_predictor` can download on first use, or
3. Set `SAM3_CHECKPOINT` to a local `sam3.1_multiplex.pt` path inside the container.

The image installs `sam3` from GitHub (SAM 3.1 APIs are not yet on PyPI) and downloads the text tokenizer vocab (`bpe_simple_vocab_16e6.txt.gz`) into `/opt/SAM3/assets`. Override with `SAM3_BPE_PATH` if needed.

### Reducing GPU memory

SAM 3.1 multiplex loads a large detector + tracker stack on GPU. The checkpoint size is similar to SAM 3, but peak VRAM is usually higher because every job uses the full multiplex path (including single-frame jobs).

**Job parameters (no code changes):**

- Set **TrackingFrames** to `1` when you only need one frame (still uses multiplex, but avoids propagation memory).
- Use a higher **ConfidenceThreshold** to drop weak detections (fewer masks/objects held in memory).

**Container environment variables** (on GPUs ≤20 GiB, conservative defaults apply automatically):

| Variable | Typical default (≤20 GiB) | Effect |
|----------|---------------------------|--------|
| `SAM3_MAX_NUM_OBJECTS` | `4` | Cap parallel object slots (was 16 in upstream sam3). |
| `SAM3_GROUNDING_BATCH_SIZE` | `2` | Detector grounding chunk size (upstream default `16` often OOMs on 16 GiB). |
| `SAM3_POSTPROCESS_BATCH_SIZE` | `2` | Postprocess batch size. |
| `SAM3_PROPAGATION_CHUNK_SIZE` | `3` | Propagate a few frames per stream, then `empty_cache` (set `0` for one shot). |
| `SAM3_OFFLOAD_VIDEO_TO_CPU` | `true` | Keep decoded frames on CPU. |
| `SAM3_USE_FA3` | `true` on Ampere+ only | Flash Attention 3 when supported. |

Example if propagation still OOMs on a 16 GiB GPU:

```bash
SAM3_MAX_NUM_OBJECTS=2 \
SAM3_GROUNDING_BATCH_SIZE=1 \
SAM3_PROPAGATION_CHUNK_SIZE=2 \
SAM3_OFFLOAD_VIDEO_TO_CPU=true
```

Also set `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` (enabled by default in `SAM3Demo.py`).

### Pre-Ampere GPUs (Turing / Volta / Pascal)

If you see `RuntimeError: No available kernel` during propagation, the GPU is below CUDA capability 8.0 (no Flash Attention). `SAM3Demo.py` patches sam3 to use math SDPA and runs inference in fp32 on those GPUs. Ensure you are on the latest `SAM3Demo.py` from this repo.

**Hard limits:** Model weights still occupy several GB on GPU; there is no CPU fallback for SAM 3.1 multiplex in this demo. For the lowest VRAM on single-frame text prompts only, the older SAM 3 image-model path (`sam3.pt`) used less memory but is not SAM 3.1.
