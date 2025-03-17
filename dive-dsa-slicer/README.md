# dive-dsa-slicer
Integration of slicer-cli plugin into [DIVE-DSA](https://github.com/DigitalSlideArchive/dive-dsa)

## Demo Docker Container

Within the ./example-docker-containers folder is are tools for creating DIVE Tasks

This is following the [Girder/Slicer-CLI-Web](https://github.com/girder/slicer_cli_web) format for creating Slicer CLI docker images that can be run inside of girder.

Navigate to the folder to View the README for the DIVE Sample Slicer CLI docker image


## vue-girder-slicer-ui

This is a vue component library that can connect into a Vue girder application and be used to navigate and set the inputs/outputs for girder slicer cli tasks.
There are props to override default behavior and provide default values to items.  A specific one used in DIVE-DSA interface allows DIVEVideo and DIVEDirectory to automatically be populated with the proper folder and video item when loaded.