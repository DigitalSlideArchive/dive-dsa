#UI-Configuration JSON

Below is a base UI Configuration JSON will all items turn on.
If you see any of these values to false it will turn off the top level item.  If the top level item is turned into an Object it will then read the settings of that object.  You can note that below in the other documentation.


```json
 "UISettings": {
        "UIContextBar": true,
        "UIControls": true,
        "UIInteractions": true,
        "UISideBar": true,
        "UITimeline": true,
        "UIToolBar": true,
        "UITopBar": true,
        "UITrackDetails": true
    },
```

Below is the configuration JSON for a view with all of the items turned off

```json
"configuration": {
    "UISettings": {
        "UITopBar": {
            "UIData": false,
            "UIJobs": false,
            "UINextPrev": false,
            "UIToolBox": false,
            "UIImport": false,
            "UIExport": false,
            "UIClone": false,
            "UIConfiguration": false,
            "UIKeyboardShortcuts": false,
            "UISave": false
        },
        "UIToolBar": {
            "UIEditingInfo": false,
            "UIEditingTypes": [
                false,
                false,
                false
            ],
            "UIVisibility": [
                false,
                false,
                false,
                false,
                false
            ],
            "UITrackTrails": false
        },
        "UISideBar": {
            "UITrackTypes": false,
            "UIConfidenceThreshold": false,
            "UITrackList": false,
            "UIAttributeSettings": false,
            "UIAttributeAdding": false,
            "UIAttributeUserReview": false
        },
        "UIContextBar": {
            "UIThresholdControls": false,
            "UIImageEnhancements": false,
            "UIGroupManager": false,
            "UIAttributeDetails": false,
            "UIRevisionHistory": false
        },
        "UITrackDetails": {
            "UITrackBrowser": false,
            "UITrackMerge": false,
            "UIConfidencePairs": false,
            "UITrackAttributes": false,
            "UIDetectionAttributes": false
        },
        "UIControls": {
            "UIPlaybackControls": false,
            "UIAudioControls": false,
            "UISpeedControls": false,
            "UITimeDisplay": false,
            "UIFrameDisplay": false,
            "UIImageNameDisplay": false,
            "UILockCamera": false
        },
        "UITimeline": {
            "UIDetections": false,
            "UIEvents": false
        },
        "UIInteractions": {
            "UISelection": false,
            "UIEditing": false
        }
    }
}
```