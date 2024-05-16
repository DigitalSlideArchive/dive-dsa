### Slicer CLI Task Runner

**BETA Feature** 

This a temporary tool to use Girder Slicer CLI inside of DIVE itself.

When enabled there is a an icon * ==:material-docker:== in the main toolbar that will open the Slicer CLI task tool.

It begins with choosing a task.  The task button will automatically filter the existing tasks in the system for 'DIVE' or 'dive' contained in the image name or the description.

#### Defaults 

The system will automatically populate the file input with a reference to the video file for the DIVE Dataset specificially if it has the ID/Name **DIVEVideo**

The system will also populate any folder output with the DIVE Dataset Folder if it has the ID/name **DIVEDirectory**

#### Examples

There are examples located at [**DIVE-DSA-Slicer Repository**](https://github.com/BryonLewis/dive-dsa-slicer/tree/main/small-docker).  These are simple examples that show the generation of fullframe tracks.  The more important one is the LongRunning or GirderClient versions.  They show how to automatically push the data back to the system and kick off the post process event to load the new tracks in to the Dataset.


