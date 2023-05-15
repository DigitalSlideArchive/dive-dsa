# S3 Import

When logged in as an Admin you can go to the main Girder interface and Admin -> AssetStores -> Create new Amazon S3 assetstore.

This will bring up the interface for configuring access to an S3 bucket basked on Access ID/Secret keys and the bucket name.

After creation of an S3 asset store files can be imported into a collection or a folder in the AssetStore menu.

## DIVE S3 Import Process

When importing Video files while using the DIVE-DSA plugin the following process happens:

1.  As the system goes through the bucket paths it will look for files that have typical video extensions (mp4, mov, avi, and others).
1.  When a video file is found it will generate a folder with the name `Video {video filename}`.
1.  It will then place the video file inside of the new folder
1.  The new folder will be tagged with the following metadata:
    * `fps: -1` - sets the fps to -1 so that when post process is called it will set the annotation fps to the video fps
    * `type` - will be 'video' for importing videos
    * `import_path` - information about the folder import path
    * `import_source` - The s3 path for the importing of the video
    * `MarkForPostProcess: true` - inidication for the system that this folder should be postprocessed (See Post Process)[VideoConversion.md]
1. After all videos have been imported a recursive call to a special version of `dive_rpc/batch_postprocess/{folderId}` which will recursive check the folder the S3 data is imported into.
1. This recursive process will look for folders with the `MarkForPostProcess: true` metadata and run the standard Post Process logic on them to transcode the video if required and to convert the folder into a valid DIVE dataset.

NOTE:  This could generate a lot of jobs if there are thousands of videos.  Keep an eye on the jobs and make sure that they are properly finishing with the 'success' status.

## Errors or Failures

If there are any errors or failures during the post-processing of the videos there are a few options that can be done to try to resolve the problems.

* Utilize the `dive_rpc/batch_postprocess/{folderId}` endpoint to try to start the jobs again if needed.
* Within the core repo there is a python script (./scripts/postProcessVideos.py).  pip installing girder-client and running this script will attempt to convert any folder which still has `fps:-1` and has `MarkForPostProcess: any` where the value is either false/true as long as it exists.
    * There are some configuration settings in  the top of the postProcessVideos.py file
    * `apiURL`- the URL or location of the server
    * `port` - default port used for the girder server
    * `rootFolderId` - the base folder you want to recursively check for imported S3 data
    * `limit` - a way to limit the number of jobs created for testing purposes.  If using the script, use a small limit first to make sure the process works before attempting to convert thousands of videos.
