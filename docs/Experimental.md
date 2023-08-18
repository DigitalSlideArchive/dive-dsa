# Experimental

This includes some documentation for experimental features which may not be fully complete but are in place for testing purposes.


## Video Overlays

This allows for the configuration of a video that can be overlayed over the dataset base video.  It is useful for display heatmaps or other information on top of the current video.

Requirements:

- The Overlay Video should be the same dimensions (width x height) of the original video, the same length (duration in seconds) and the same framerate.
- To implement video overlays a knowledge of how to add JSON metadata to Girder Folders and Items are required.
- There should be a folder in the dataset with the Metadata value of `overlayVideo: true`.  Make sure that the metadata is JSON.
- Within the above folder should be a video with Metadata value of `overlayVideoItem: true`. Make sure that the metadata is JSON.

Having the above requirements met there will be a new icon in the visibile for the DIVE Dataset: ==:material-layers:==

![Video Layer Options](images/Experimental/layer-icon.png)

The Video Layer can be toggled on/off like any other annotation.
- *Opacity* - The global opacity of the video overlay
- *Color Transparency* - If there is metadata value set with transparency this will attempt to replace the color in the video and make it transparent.  **NOTE** THIS IS AN EXPERIMENTAL FEATURE WHICH CURRENTLY HAS PERFORMANCE ISSUES AND POTENTIALLY FLASHES

### Video Overlay Color Transparency

**NOTE** THIS IS AN EXPERIMENTAL FEATURE WHICH CURRENTLY HAS PERFORMANCE ISSUES AND POTENTIALLY FLASHES
Utilizing another Metadata field on the video overlay item (`overlayVideoItem: true`) you can specify colors to be replaced in the video and made transparent.
This is configured by adding a new Metadata tag to the video Item : `overlayMetadata: true`

```
{
    "transparency": [
        {
            "rgb": [0, 255, 0],
            "variance": 20,
        }
    ]
}
```
Multiple colors can be added to transparency where each color has an RGB array value of 0-255.
Variance allows a +/- variance to the exact color that is selected.