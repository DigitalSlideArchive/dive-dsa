# Visual Masks

Visual masks are configuration-backed overlays that let dataset owners and administrators block out portions of the image or video view with styled rectangles.

Unlike track annotations, visual masks are stored with the dataset configuration and are not tied to a track ID. They are intended for display and review workflows where a persistent masked region should appear on top of the media.

## Permissions

Visual mask management is restricted to configuration owners and administrators.

Non-owner/admin users do not get the **Visual Masks** sidebar or the visual-mask visibility toggle in the editing bar. Existing masks may still appear in the annotation view when they are enabled in the current configuration.

## Where to Find Them

When visual masks are enabled in the dataset configuration, configuration owners and administrators can manage them from the **Visual Masks** context sidebar.

If at least one visual mask exists for the current dataset, configuration owners and administrators will also see a visibility toggle in the editing bar:

- ==:material-image-filter-center-focus-strong:== toggles visual mask display

This visibility button is hidden when no visual masks exist, and it is also hidden for non-owner/admin users.

Within the **Visual Masks** sidebar, each mask row also includes a checkbox with a `Visibility` tooltip so owners/admins can enable or disable that specific mask in the saved configuration.

## Creating a Visual Mask

Visual masks are currently **rectangle-only**.

1. Open the **Visual Masks** context sidebar.
1. Click **Add Box**.
1. Move to the annotation view. The cursor will show the rectangle drawing icon when the tool is ready.
1. Click and drag to place the visual mask.
1. Save your changes using the standard save button in the navigation bar.

New masks default to **Relative positioning**, which stores their bounds as percentages of the current video size instead of raw pixels.

## Editing a Visual Mask

1. Select a visual mask from the **Visual Masks** sidebar.
1. Click **Edit Current Frame** or right-click the visual mask in the annotation view.
1. Drag the handles to resize the box or drag the center to move it.
1. Optionally toggle **Relative positioning** on or off for the selected mask.
1. Save when you are finished.

Visual masks support frame-specific changes. If a mask is edited on a later frame, that change becomes a new keyframe for the mask.

## Positioning Mode

Each mask has a **Relative positioning** toggle in the sidebar.

- When enabled, mask bounds are stored as percentages of the video width and height.
- This mode is useful when the same overall configuration folder may be applied to videos with different resolutions.
- When disabled, bounds are stored as absolute image coordinates.
- Existing masks may still use absolute coordinates if they were created before relative positioning was added or if the toggle is turned off.

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

## Configuration Format

Visual masks live under the top-level `visualMasks` key in the dataset configuration. The value is an object keyed by camera name, where each camera contains an array of masks.

Example:

```json
{
  "visualMasks": {
    "cam1": [
      {
        "id": 0,
        "name": "Doorway Mask",
        "enabled": true,
        "useRelativePositioning": true,
        "type": "rectangle",
        "style": {
          "color": "#000000",
          "fill": true,
          "opacity": 1,
          "strokeWidth": 3
        },
        "frames": [
          {
            "frame": 10,
            "bounds": [11.1111, 7.4074, 38.8889, 24.0741],
            "keyframe": true
          },
          {
            "frame": 25,
            "bounds": [12.963, 7.4074, 38.8889, 24.0741],
            "keyframe": true
          }
        ]
      }
    ]
  }
}
```

Quick notes:

- `visualMasks.cam1` can be replaced with any camera name from the dataset configuration.
- Each mask needs an `id`, `name`, `type`, and `frames` array.
- `useRelativePositioning` controls whether frame bounds are stored as percentages or absolute coordinates.
- `type` is currently always `"rectangle"`.
- `frames` stores the explicit shape changes for that mask. The mask remains in effect until a later frame entry changes it.
- When `useRelativePositioning` is `true`, each frame entry uses `bounds: [x1, y1, x2, y2]` as percentage values of the video size, where `50` means `50%`.
- When `useRelativePositioning` is `false`, each frame entry uses `bounds: [x1, y1, x2, y2]` in image/display coordinates.
- `style` is optional. If omitted, the application fills in defaults such as black, filled, and fully opaque (`opacity: 1`).

## Current Limitations

- Only rectangle visual masks are supported currently.
- Visual masks are configured per camera.
- Visual masks are stored in configuration data, not in the annotation track data.
