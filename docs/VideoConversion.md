# DIVE Dataset and Video Conversion

## Video Transcoding

Not all videos are capable of being used on the web.  There are some requirements that need to be met for the video to be displayed in a web interface.  Typically those include having a web compatible container and codec.

The Container is the format of the video, like .mp4, .avi, .mov and other.
The Codec is the encoding of the data and codec include h264, h265, av1 and others.

For simplicity  DIVE requires .mp4 containers in the h264 codec format.

When a video is uploaded/processed it uses ffprobe to check the current container and codec formats.  If the codec and container don't match .mp4 and h264 it will start a Girder Job to conver the video using ffmpeg to the proper format.  Depending on the worker node this will typically take 10-30% of the realtime playback length of the video.  This varies based on resolution and other quality settings of the video.

DIVE does transcoding by default.  This is done because transcoding can fix issues in videos if they weren't encoding properly to begin with.  Videos coming from devices that encode in real time like cameras sometimes have errors and issues during the encoding process.  The transcoding can fix some of these errors.  When uploading in the DIVE interface there is an option to 'Skip Transcoding'.  When this is selected the worker job will check and see if the video meets the following conditions:

* The video container is .mp4
* The video codec is h264
* There are no duplicate frames or other oddities in the first 5 seconds of the video

If those conditions are met the video will not be transcoded.

## Video Frame Rate

DIVE will only support videos which maintain a consistent framerate throughout the length of the video.
DIVE relies on this information to properly align the visualization of annotations with specific timepoints in the video on a frame by frame basis.

Annotation is better performed when the frame rate is a consistent multiple.  While DIVE supports frame rates of 29.97fps and 59.94fps there needs to be care in subsampling these frame rates if annotations are being done at a lower rate than the video.

### Annotation Frame Rate

The Annotation Frame rate can be set to subsample the frame rate of the video.  During upload you can choose and FPS or default to the Video FPS.  The subsample rate is best to be a interger divisor of the frame rate.  I.E using a annotation framerate of 10 when the video is 30fps works best and using a annotation frame rate of 10 when the video is 24fps is not recommended.  


### Post Process Conversion

1. When a video is uploaded it will create a folder which will place the default video inside of the folder
1. The folder metadata will set `fps` to chosen Annotation FPS or -1 if the Annotation FPS is set to the video fps
1. Additionally, the `type` metadata will be set to 'video' or 'image-sequence' depending on the uploaded media type.
1. First it will look for any sibling CSV or JSON files and determine if they are annotation or configuration files and import them properly.  This will import VIAME CSV and TrackJSON or the configuration JSON files specified in (DataFormats)[DataFormats.md]
1. The endpoint `dive_rpc/postprocess/{folderId}` is then used.  This endpoint will take the folder and look for images/videos in it and run ffprobe on videos to check the container format and the codec.
    1. if the codec and container don't match h264 and mp4 it will transcode the video
    1. transcoding will also be done if there are frame errors discovered in the first 5 seconds of the video
    1. During the ffprobe process the default data for the video is recorded and added to the folder metadata as ffprobe_info
    1.  The orignal FPS is also recorded as well as the originalFPS string for accuracy.
1. Once the video is complete and every succeeds it will add the metadata `annotate: true` to the folder to indicate that this is now a DIVE Dataset that can be viewed in the dive interface.