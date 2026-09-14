# Connect to local projects

The first local runner opens two independent copies of Stellar's reviewed Astro example. This is developer mode: project code runs on your computer. It is not a hosted sandbox, and this version does not import arbitrary repositories.

From the Stellar repository root, install dependencies with `npm ci` and `npm run fixture:install`. Start with `npm run dev:local`. Open the connection link printed in that terminal, using its exact `127.0.0.1` address. The page should say **Connected to the local workspace**. Its link is single-use; restarting the launcher prints a fresh link. Keep the launcher running while using local projects.

The connection page can recognize an existing signed-in browser session. Use a fresh launcher link if the session expires or you restart the launcher. Opening the application as `localhost` instead of `127.0.0.1` will not share this session. Website previews deliberately use `localhost` on separate ports.

This release establishes the project API, live previews and durable CSS write engine. The home screen is still the bootstrap shell. Project selection, the canvas and click-to-edit controls arrive in M1-04 and M1-05; connecting alone does not expose those controls yet.

## Saved work and stopping

The runner creates `project-a` and `project-b` under the ignored `.stellar-local` directory. Each copy has its own source and saved history; neither edits the example's original files. Closing a session stops its preview while retaining its copy. Stop the launcher with the terminal's interrupt action when finished. Restarting the launcher retains saved source and receipts.

Do not delete `.stellar-local` to troubleshoot an ordinary startup problem: it contains saved work. To intentionally start over, stop the launcher and preserve or rename that directory before starting again. A fresh directory creates fresh copies. Only one runner can own the same data directory at a time.

If dependencies are missing, stop the launcher, run `npm run fixture:install` from the repository root and relaunch. If a preview port is occupied or a page has a compiler error, its session reports a failure that can be retried after the cause is fixed. Changed executable configuration or fixture capabilities are refused in this limited adapter. It will not silently install or execute a new project setup.

## Development checks

From the root, run `npm run verify`, `npm run build`, then `npm run verify:local`. The last check connects the production application to a temporary runner, opens both real Astro copies, saves a CSS change and verifies it survives a runner restart. It cleans up its temporary copies and leaves your ordinary local workspace intact.
