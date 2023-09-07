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
- *Color Transparency* - If there is metadata value set with transparency this will attempt to replace the color in the video and make it transparent.
- *Override* - Allows for specifying the current variance and color independently from the JSON file.  It's used to figure out the settings that you want to use for the system.  You can then click on the copy button to copy the JSON and past it into the metadata fro the video.
- *ColorScale* - Allows for rescaling grayscale heatmaps to a custom beginning and end color.  This is limited to two colors but will replace the black/white color range to whatever the user selects.

### Video Overlay Color Transparency

Utilizing another Metadata field on the video overlay item (`overlayVideoItem: true`) you can specify colors to be replaced in the video and made transparent.
This is configured by adding a new Metadata tag to the video Item : `overlayMetadata: true`

```
{
    "transparency": [
        {
            "rgb": [0, 255, 0],
            "variance": 20,
        }
    ],
    colorScale: {
        black: '#000000',
        white: '#FFFFFF'
    }
}
```
Right now it only supports the first color in the array.
Variance allows a +/- variance to the exact color that is selected.
The colorScale isn't required but if it is found it will utilize it to scale grayscale imagery.