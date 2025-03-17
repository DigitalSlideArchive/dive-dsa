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
