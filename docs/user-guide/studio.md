# Browse a local site in Studio

> **Status:** Local editor proof · **Where:** Projects → Studio

## What it's for

Studio opens a real page from one of the two registered Astro working copies. Use it to inspect responsive layouts and find the source target behind a rendered element.

## Getting there

1. Start the local launcher and connect using its link, as described in [Connect to local projects](local-projects.md).
2. Open **Projects** and choose a working copy. Studio opens the Home page; the **Pages** panel also lists Contact.
3. If Studio was already open in this browser tab, it restores the last page, viewport width and mode for that project. It opens a fresh authorized session when needed.

## View a page at different widths

1. Choose **Mobile** (390 px), **Tablet** (768 px) or **Desktop** (1440 px). The number is the website's CSS viewport width, so its media queries respond as they would in a browser of that width.
2. For an intermediate width, enter an integer from 320 to 1920 in the **Custom viewport width in pixels** field and press Enter or leave the field.
3. Choose **Fit** to see the page within the available canvas or **100%** to see actual pixels. At 100%, scroll the canvas if the chosen width exceeds the Studio window.
4. Use **Refresh preview** if the page loads but the editor has not reconnected. This reloads the page view without restarting the local runner.

## Inspect a source target

1. Choose **Inspect**. Click a marked page element or select its name under **Source targets** in the **Pages** panel. The right inspector shows its page, source file, current revision and whether it is editable.
2. If you click a nested or unmarked element that has no own target, Studio explains that it cannot map that element. Choose the supported parent explicitly from the target list if that is what you meant to inspect.
3. Shared component instances and generated content may be inspectable but read-only. A read-only item will explain why; selecting one never grants a source write.
4. Press Escape while focused inside the preview to clear the selection.

Choose **Interact** to follow page links and use the site normally. Selecting a link in Inspect mode does not navigate. Returning to Inspect restores a still-valid selection; changing the page, session, preview generation or source revision clears an old editable selection until Studio validates it again.

## Troubleshooting

| Symptom | What to do |
|---|---|
| **Workspace unavailable** on Projects | Use the current local launcher link on **Connect workspace**, then choose **Try again**. |
| **Preview needs attention** or **Preview is stopped** | Choose **Retry preview**. The working copy and saved source remain intact. |
| The page is visible but Studio says **Waiting for preview** | Choose **Refresh preview**. If it still cannot connect, retry the session. |
| A target is read-only | Read the inspector reason and choose a supported target. The shared component definition and generated elements are outside this proof's direct edit scope. |

## Related guides

- [Connect to local projects](local-projects.md)

## Last reviewed

September 14, 2026 — M1-04 local implementation and coordinator browser acceptance in progress.
