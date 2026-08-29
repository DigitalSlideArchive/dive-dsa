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
            "UISlicerCLI": false,
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
            "UIRevisionHistory": false,
            "UIDatasetInfo": false
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
            "UIEvents": false,
            "UILegendControls": false,
            "UILegendForceOpen": true,
            "UILegendHideToggle": true,
            "UILegendKeyMinWidth": 100,
            "UILegendKeyMaxWidth": 180
        },
        "UIInteractions": {
            "UISelection": false,
            "UIEditing": false
        }
    }
}
```

## UITimeline settings

When `UITimeline` is expanded to an object, these keys control timeline visibility and the inline legend column:

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `UIDetections` | boolean | `true` | Show the Detections timeline view button. Set to `false` to hide. |
| `UIEvents` | boolean | `true` | Show the Events timeline view button. Set to `false` to hide. |
| `UILegendControls` | boolean | `true` | Show the legend/key toggle button in the timeline control bar. Set to `false` to hide. |
| `UILegendForceOpen` | boolean | `false` | When `true`, always show the legend and prevent closing it. |
| `UILegendHideToggle` | boolean | `false` | When `true`, hide the legend toggle button (often used with `UILegendForceOpen`). |
| `UILegendKeyMinWidth` | number | `80` | Minimum legend column width in pixels. |
| `UILegendKeyMaxWidth` | number | `150` | Maximum legend column width in pixels. |

Example with legend forced open and a wider key column:

```json
"UITimeline": {
    "UILegendForceOpen": true,
    "UILegendHideToggle": true,
    "UILegendKeyMinWidth": 100,
    "UILegendKeyMaxWidth": 180
}
```

!!! note

    `UILegendControls`, `UILegendForceOpen`, and `UILegendHideToggle` previously lived under `UIControls`. Older configurations still work; the UI migrates those keys to `UITimeline` when Timeline settings are saved.