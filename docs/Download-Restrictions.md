# Download Restrictions

Site administrators can globally control what users may download from the DIVE Export / Download menu. Settings live under **DIVE Admin → Config → Download Restrictions**.

## Defaults

When `DownloadRestrictionSettings` have never been saved:

* **Prevent media downloads** is **on** — video/image exports and media inside zip exports are blocked.
* Track/annotation downloads, configuration downloads, and “prevent all” are **off**.

Existing deployments that have not configured this panel will therefore block media exports after upgrade until an admin allows them.

## Options

| Setting | Effect |
| --- | --- |
| **Prevent all downloads** | Hides the Download menu and rejects all DIVE export endpoints with HTTP 403. Overrides the options below. |
| **Prevent media downloads** | Blocks media-only exports and media included in zip (“Everything”) exports. In-viewer playback still works. |
| **Prevent track / annotation downloads** | Blocks annotation CSV/JSON and mask exports, and annotations inside zip exports. |
| **Prevent configuration downloads** | Blocks standalone configuration export and strips configuration fields (attributes, styles, filters, timelines, swimlanes, etc.) from zip `meta.json`. |

Individual options are disabled in the UI when **Prevent all downloads** is enabled.

## User experience

* Restricted export choices are hidden from the Download menu.
* If every category is blocked (or “prevent all” is on), the Download control itself is hidden.
* “Everything” exports only include categories that remain allowed (for example annotations and config without media).
* Direct API calls to blocked export routes return **403**.

See also [Download or export data](Web-Version.md#download-or-export-data).
