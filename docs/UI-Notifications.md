# UI Notifications

UI Notifications provide a way for external events/tasks to provide notifications to users that currently have the system open.  This is especially useful if there are short running Slicer-CLI-Web tasks that want to provide information to the user.  I.E. a quick Slicer-CLI task that finds a specific track and frame combination and wants the user to navigate to the specific location.

When a notification is detected on the client a dialog window will be displayed with custom text specified from the JSON body as well as indication of what actions will be performed such as "selecting TrackId 3" and "Going to Frame 200".

## REST Endpoint

There is a REST endpoint: `POST /dive_rpc/ui_notificaitions/{id}` that takes in a DatasetId and JSON body response to display the notification to the same user with the same DatasetId currently open.  I.E. If you run a task the task is able to provide information back to the user in the form of a Dialog box and provide suggestion actions like selecting a track or going to a specific frame.



## JSON Body Data
The JSON format is relatively simple but may be updated in the future to have additional fields and provide further actions.

* *text* (string) - This is a required string that is displayed to the user.  It provides some context to the user about what is being selected or why data is being changed
* *reloadAnnotations* (boolean) <Optional> - If this is true it is the only action that will be performed.  Instead of performing any other actions it will reload the page.
* *selectedTrack* (number) <Optional> - integer number to select a specific track
* *selectedFrame* (number) <Optional> - interger frame number to seek to that frame.

### Sample JSON Body Data 
```
{
    "text": "Sample Notification to provide to user",
    "selectedFrame": 300,
    "selectedTrack": 2,
}
```

### Adding Actions to UI Notifications

The below example utilizes the UI-Actions to select a track that meets seom requirements.
You can specify a list of `diveActions` that can be executed sequentially
The below action will select the next track that is of type `mouse` and has a detection attribute named `mouseState` that is `=` to `scratching`
the UI-Actions pages has more information about the existing actions and their capabilities and configuration.

```
{
    "text": "Testing the Actions Listing",
    "diveActions": [
        {
            "description": "This is a Description of the action",
            "actions": [
                {
                    "action": {
                        "track": {
                            "Nth": 0,
                            "attributes": {
                                "detection": {
                                    "mouseState": {
                                        "op": "=",
                                        "val": "scratching"
                                    }
                                }
                            },
                            "direction": "next",
                            "startFrame": -1,
                            "startTrack": -1,
                            "type": "TrackSelection",
                            "typeFilter": [
                                "mouse"
                            ]
                        },
                        "type": "GoToFrame"
                    }
                }
            ]
        }
    ]
}
```

Below adds a keyboard shortcut that will be added tied to the action.  Now when hitting `shift+p` it will perform the actions.

```
{
    "text": "Testing the Actions Listing",
    "diveActions": [
        {
            "description": "This is a Description of the action",
            "shortcut": {
                "key": "p",
                "modifiers": ["shift"]
            },
            "actions": [
                {
                    "action": {
                        "track": {
                            "Nth": 0,
                            "attributes": {
                                "detection": {
                                    "mouseState": {
                                        "op": "=",
                                        "val": "scratching"
                                    }
                                }
                            },
                            "direction": "next",
                            "startFrame": -1,
                            "startTrack": -1,
                            "type": "TrackSelection",
                            "typeFilter": [
                                "mouse"
                            ]
                        },
                        "type": "GoToFrame"
                    }
                }
            ]
        }
    ]
}
```

### Type Definitions

UI Notification Type definition. Note:  a `?` at the end of a key means it is optional in Typescript
```
export interface UINotification {
    datasetId: string[];
    text: string;
    selectedFrame?: number;
    selectedTrack?: number;
    reloadAnnotations?: boolean;
    diveActions?: UIDIVEAction[];
}
```

The UIDIVEAction allows for executing actions or for creating shortcuts.


```
export interface UIDIVEAction {
  shortcut?: {
    key: string;
    modifiers?: string[]; //list of modifiers for the keyboard shortcut
  }
  description?: string;
  applyConfig?: boolean; //Add to the system configuration the shortcut/action
  actions: DIVEAction[];
}
```
