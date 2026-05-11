# Visual Masks

Visual masks are configuration-backed overlays that let dataset owners and administrators block out portions of the image or video view with styled rectangles.

Unlike track annotations, visual masks are stored with the dataset configuration and are not tied to a track ID. They are intended for display and review workflows where a persistent masked region should appear on top of the media.

## Permissions

Visual masks are restricted to configuration owners and administrators.

Standard users can still see existing visual masks in the annotation view, but they cannot:

- create masks
- edit mask geometry
- rename masks
- change mask styling
- enable or disable masks

## Where to Find Them

When visual masks are enabled in the dataset configuration, owners and administrators can manage them from the **Visual Masks** context sidebar.

If at least one visual mask exists for the current dataset, owners and administrators will also see a visibility toggle in the editing bar:

- ==:material-image-filter-center-focus-strong:== toggles visual mask display

This visibility button is hidden when no visual masks exist, and it is also hidden for non-owner/admin users.

## Creating a Visual Mask

Visual masks are currently **rectangle-only**.

1. Open the **Visual Masks** context sidebar.
1. Click **Add Box**.
1. Move to the annotation view. The cursor will show the rectangle drawing icon when the tool is ready.
1. Click and drag to place the visual mask.
1. Save your changes using the standard save button in the navigation bar.

## Editing a Visual Mask

1. Select a visual mask from the **Visual Masks** sidebar.
1. Click **Edit Current Frame** or right-click the visual mask in the annotation view.
1. Drag the handles to resize the box or drag the center to move it.
1. Save when you are finished.

Visual masks support frame-specific changes. If a mask is edited on a later frame, that change becomes a new keyframe for the mask.

## Frame Behavior

Visual masks persist until changed.

- If a mask is defined on frame 10, it will continue to display on later frames.
- If the mask is changed on frame 25, that updated shape is used from frame 25 onward.
- The **Shape changes** list in the sidebar shows frames where the mask has an explicit change.

## Styling

Each visual mask can store its own style settings in the configuration:

- color
- fill on/off
- opacity
- line thickness

These settings are shared with the dataset configuration, so they persist across sessions just like other configuration-driven UI settings.

## Current Limitations

- Only rectangle visual masks are supported currently.
- Visual masks are configured per camera.
- Visual masks are stored in configuration data, not in the annotation track data.
