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

Uses [SAM 3](https://github.com/facebookresearch/sam3) open-vocabulary text prompts to segment all matching instances on the current DIVE frame and ingest them as new tracks with masks.

### Parameters

- **TextPrompt** (required): phrase describing what to detect (e.g. `person`, `vehicle`).
- **DIVEFrameId**: frame index (auto-filled from the DIVE UI when launched from the app).
- **DIVETrackType**: classification label for new tracks.
- **ConfidenceThreshold**: minimum detection score (default `0.5`).
- **TrackingFrames**: number of frames to track forward from the prompt frame (`1` = single frame only; values greater than `1` use SAM3 video propagation, similar to SAM2Demo).

### Device selection

Single-frame inference (`TrackingFrames` = 1) uses CUDA when available, otherwise CPU. Video propagation (`TrackingFrames` > 1) requires CUDA because the SAM3 video predictor loads the model on GPU. Apple MPS is detected but SAM3 runs on CPU for single-frame mode only.

If you see `RuntimeError: The NVIDIA driver on your system is too old` while the log says `Using inference device: cpu`, PyTorch cannot use the GPU (driver/CUDA mismatch). Single-frame mode should still work on CPU after rebuilding the image (the container patches SAM3’s hardcoded CUDA precompute paths). For GPU inference, update the host NVIDIA driver to match the PyTorch CUDA version in the image, or rebuild with a CPU-only PyTorch wheel.

### Hugging Face checkpoints

SAM 3 weights are gated on Hugging Face. Request access to [facebook/sam3](https://huggingface.co/facebook/sam3), then either:

1. Copy `.env.example` to `.env`, set `HF_TOKEN`, and run `docker compose build --no-cache` to prefetch weights into `/opt/SAM3/models`, or
2. Set `HF_TOKEN` (or run `hf auth login`) at runtime so `build_sam3_image_model` can download on first use, or
3. Set `SAM3_CHECKPOINT` to a local `sam3.pt` path inside the container.

The image build also downloads the text tokenizer vocab (`bpe_simple_vocab_16e6.txt.gz`) into `/opt/SAM3/assets` (the PyPI `sam3` package does not include it). Override with `SAM3_BPE_PATH` if needed.
