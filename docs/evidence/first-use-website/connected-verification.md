# Connected-computer verification

Date: 2026-09-24 (browser completion 2026-09-25 UTC). Branch `codex/first-use-website`, isolated worktree `933d`. This continues the [earlier first slice](verification.md).

## Evidence boundary

Connected browser acceptance uses synthetic WorkOS identity and `convex-test` with the real schema/functions/actions. It mounts shipped setup/dashboard/project/Studio components, invokes real platform and connected HTTP handlers, and operates a disposable runner with real Astro source/preview/history. Test-only identity injection and Next navigation aliases are outside production routes. This proves integrated local behavior, not AuthKit middleware, live JWT verification, cloud persistence, production deployment or live identity revocation.

No provider credentials were copied or printed. No WorkOS/Convex deployment, main merge or saved-checkout synchronization occurred. The connected backend must be deployed with the dedicated shared server secret before the user's configured live account can use it.

## Results

- `npm run verify` passed: harness/docs, lint, types, fixture validation and 227 tests (contracts 10, content 14, editor 42, runner 32, web CJS 72, Convex 29, preview 2, root 26). [Full log](connected/stellar-connected-final-verify.log).
- `npm run build` passed packages, production Next and independent Astro fixture. [Build log](connected/stellar-connected-final-build.log). Web lint/typecheck were rerun after the final UI/routing/test refinements; four existing generated-file lint warnings remain, with no errors.
- `npm run verify:connected` passed 1/1. The actor initially has no workspace; real Connection Setup bootstraps it, pairs explicitly, prepares a website, opens Studio and saves a source edit. Source survives runner restart. **All projects** returns to the account dashboard and the same website reopens. Disconnect/reconnect retains the still-valid local operator cookie. Existing Test completes on its original ID after an intentionally lost response. The edited Astro website builds independently and Chromium verifies its static output. [Result](connected/result.json), [log](connected/stellar-connected-final-browser.log).
- `npm run verify:local`, `npm run verify:editor`, `npm run verify:projects` and `npm run verify:proposals` all passed against the final production build. Local mode retains its operator/Origin/CSRF fence, isolated source/history and lost-response/restart behavior. Existing editor checks cover responsive canvas, guarded edits, reset, tokens, undo/redo and independent build; proposal evidence remains synthetic. [Editor result](connected/m1-editor-result.json), [projects result](connected/m1-projects-result.json), [proposal result](connected/proposal-review-result.json).
- Negative tests exercise hostile origins, missing local possession, old-account CSRF, revoked grants/connections, exact account/registry/session scope, proof expiry/mismatch/replay and stable recovery. Runner persistence regression injects a successful disk rename followed by an error; live authority is refused until restart reloads validated state.
- Independent SOL/high review found no remaining release-blocking defect for the same-computer environment. Fixes include actor connection rotation, fresh account CSRF, first-use bootstrap ordering, offer expiry, reconnect state, account Studio navigation and ambiguous disk writes. Reviewer-targeted checks passed; some agents' broader runner invocations hit sandbox loopback EPERM, while root's authorized full aggregate passed 32/32 runner tests.

The first final aggregate attempt stopped at the guide-index harness hash. After reviewing that intentional documentation change, the installed hash was refreshed and full verification passed. The connected browser harness initially scoped global CSS as module CSS; this was corrected and acceptance rerun. Screenshots use test-only navigation/shell wrappers, not a live AuthKit session. No production identity bypass was added.

## Screenshots and samples

Inspected [connected computer](connected/01-connected-computer.png), [guarded edit saved](connected/03-guarded-edit-saved.png), and [independent edited build](connected/07-independent-edited-site-build.png). Seven screenshots and compact results/logs are retained under `connected/`. Full regression media is archived locally under `/tmp/stellar-connected-browser-evidence` (ephemeral); historical committed output artifacts were restored after copying the new evidence.

Final offline connected sample: creation-to-edit **1,964 ms**, save-to-current-preview **301 ms**, full test activity **9,614 ms** on local macOS/Node 22.23.2/Chromium with installed fixture dependencies. These are one-run observations, not p95, live account timings or an SLA. The final connected acceptance includes the latest source and routing fixes.

## Required live acceptance

- Securely configure the isolated connected web server and deploy the updated functions/schema to the independent Stellar development backend through the authorized workflow.
- Confirm exact loopback callback, web-only provider credentials and matching web/Convex connection secret.
- Sign in with a real personal account, confirm this computer, create a website, save/reopen after restart and finish the existing Test record without changing its ID.
- Check real expired login, revoked tenant/project membership, disconnected/reconnected computer and lost-response recovery on persistent cloud state.
- Review the actual signed-in UI and confirm source/history ownership. One local timing sample does not establish p95.
