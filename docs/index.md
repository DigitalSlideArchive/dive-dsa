# DIVE Documentation

<p>
  <img width="160" style="margin-right: 50px;" src="images/General/Kitware-Logo-Stacked.png">
</p>

This is the documentation site for DIVE-DSA (DIVE - Digital Slide Archive), which is a fork based on [**DIVE**](https://github.com/Kitware/dive) a [**free and open-source**](https://www.kitware.com/open-philosophy/) annotation and analysis platform for web and desktop built by [Kitware](https://kitware.com). This fork eliminates DIVE's integration with VIAME and provides some enhanced annotation features when compared to base DIVE.  It is also meant to be integrated in with [Digital Slide Archive](https://digitalslidearchive.github.io/digital_slide_archive/).


![Home](images/Banner.png)

## DIVE-DSA Plugin

DIVE-DSA can be installed as a plugin into the Digital Slide Archive.  When installed as a plugin it provides the capbilities to annotate and view videos/image sequences in the DIVE interface.

To access the home of DIVE when installed on a server with Digital Slide Archive the endpoint `localhost:8080/dive` will bring you to the core DIVE interface.

## Convert Videos to DIVE Format

![Home](images/Plugin/ConvertToDive.png)


When videos are annotated in DIVE they need to be first processed and converted into a Dataset.  A Dataset is a folder which includes the source video and a transcoded video if required.

When The DIVE-DSA plugin is installed and there is a Girder Item which contains a standard video extension (.mp4, .wmv, .move, .avi, ...others) there will be a button which will allow you to 'Convert to DIVE'.
This button will create a folder with the name `Video {filename}` and process the video.  It will also launch the DIVE interface and navigate to the parent folder.  Once the job is complete you can click on 'Launch Annotator' to view the video and annotate.  For more information please see [Video-Conversion](VideoConversion.md)

## Open Existing DIVE Datasets

Folders that have already been converted to DIVE can be open directly by clicking the 'Open in DIVE' button next to the folder name.  There is also an additional Open in DIVE button when viewing the contents of a folder that has been converted.


## Concepts and Definitions

**DIVE** is the annotator and data management software system.  It is our name for the code and capabilities, including both web and desktop, that can be deployed and configured for a variety of needs.  For this frok of DIVE (DIVE-DSA)

**Detection** - A single annotation.  A detection could be associated with a point in time within a track, or it could have no temporal association.

**Features** - Bounding box, polygon, head/tail points or other visible elements of a detection.

**Track** - A collection of detections spanned over multiple frames in a video or image sequence.  Tracks include a start and end time and can have gap periods in which no detections exist.

**Group** - A collection of one or more tracks, which can be given a definite frame range, type annotation, confidence, and attributes.
 
**Types** - Every track (or detection, if tracks aren't applicable) has one or more types that should be used to annotate the primary characteristic you are interested in classifying.  Types are typically used to train a single or multi-class classifier.  A track (or detection) may have multiple types with confidence values associated.

**Frame** - A single image or point in time for a video or image sequence.

**Key Frame** - Every manually drawn annotation is considered a keyframe, and all automated pipelines produce keyframes. Only keyframes can have attributes.  Key frame detections are differentiated from interpolated detections, which are the implicit bounding boxes you see when linear interpolation is enabled.

**Interpolation** - The implicit bounding boxes between keyframes in a track.

**Attributes** - Attributes are free-form secondary characteristics on both tracks and detections. For example, a `fish` type track may have an `is_adult` boolean attribute.


