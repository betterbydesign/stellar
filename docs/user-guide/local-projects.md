# Connect to local projects

The local runner retains two legacy working copies and lets you create named projects from Stellar's reviewed Astro blueprint. This is developer mode: project code runs on your computer. It is not a hosted sandbox, and this version does not import arbitrary repositories.

From the Stellar repository root, install dependencies with `npm ci` and `npm run fixture:install`. Start with `npm run dev:local`. Open the connection link printed in that terminal, using its exact `127.0.0.1` address. The page should say **Connected to the local workspace**. Its link is single-use; restarting the launcher prints a fresh link. Keep the launcher running while using local projects.

The connection page can recognize an existing signed-in browser session. Use a fresh launcher link if the session expires or you restart the launcher. Opening the application as `localhost` instead of `127.0.0.1` will not share this session. Website previews deliberately use `localhost` on separate ports.

After connecting, open **Projects**. Enter a **Project name** and select **Create project** to create an independent copy of the available reviewed blueprint. You can also select any saved project to reopen its Studio. The left panel lists Home and Contact; the center shows the real Astro page. Switch between 390, 768 and 1440 CSS-pixel presets, or enter a custom width from 320 to 1920. **Fit** scales the view to the available canvas; **100%** shows the page at its actual pixel width and allows scrolling.

Use **Inspect** to select a marked source target on the page or choose one from the target list. The contextual inspector shows its source identity and whether it can be edited. Shared component targets are read-only in this local proof. Switch to **Interact** to follow the site's links normally. An unmarked element does not automatically select an editable ancestor. Press Escape while focused in the preview to clear a selection.

If the preview is still starting, the Studio shows its actual runner state. A failed or stopped preview offers **Retry preview**; **Stop preview** retains the working copy. If a page loaded but has not reconnected to the editor bridge, use **Refresh preview** to reload the iframe without restarting the project runner. A saved edit and its receipt remain separate from preview freshness.

## Saved work and stopping

The runner stores named projects and the retained `project-a` and `project-b` copies under the ignored `.stellar-local` directory. Project names are display labels; generated identities determine storage paths. Each copy has its own source and saved history; neither edits the example's original files. Closing a session stops its preview while retaining its copy. Stop the launcher with the terminal's interrupt action when finished. Restarting the launcher retains saved source and receipts.

Do not delete `.stellar-local` to troubleshoot an ordinary startup problem: it contains saved work. To intentionally start over, stop the launcher and preserve or rename that directory before starting again. A fresh directory creates fresh copies. Only one runner can own the same data directory at a time.

If dependencies are missing, stop the launcher, run `npm run fixture:install` from the repository root and relaunch. If a preview port is occupied or a page has a compiler error, its session reports a failure that can be retried after the cause is fixed. Changed executable configuration or fixture capabilities are refused in this limited adapter. It will not silently install or execute a new project setup.

## Creation and retry

The available blueprint shows its version, renderer, design system and editing capabilities. Creation does not fetch remote templates or install dependencies. If the connection fails while creating a project, retain the pending request and retry it; the same request returns the same saved project. A preview failure is separate from creation: reopen the saved project and use the Studio preview recovery controls.

## Development checks

From the root, run `npm run verify`, `npm run build`, then `npm run verify:local`. The runner check connects the production application to a temporary runner, opens both real Astro copies, saves a CSS change and verifies it survives a runner restart. It cleans up its temporary copies and leaves your ordinary local workspace intact.

For browser verification, install Chromium with `npx playwright install chromium`, then run `npm run verify:editor` after the production build. It opens both copies, exercises responsive source editing and recovery, and writes screenshots, a workflow video and source evidence under `output/playwright/m1-editor`. The suite uses temporary copies rather than your `.stellar-local` work.

Run `npm run verify:projects` after the production build for named creation, independent editing/history, restart recovery, retained legacy copies and an independent Astro build. Its screenshots and video are in `output/playwright/m1-projects`; it uses temporary data and isolated ports.

## Development-server conflicts

The complete local editor uses port 3210 and a separate `.next-local` development cache. A web-only `npm run dev` server on port 3000 can remain running; the two modes no longer share a development lock. If port 3210 itself is already occupied, stop the existing local launcher with Ctrl-C in its terminal before starting another. Use the fresh connection link from the new launcher. Do not delete `.stellar-local`; it holds saved project copies and history.
