# Decision 004 — Studio source and recovery boundaries

Date: 2026-09-14. Status: accepted for the local M1 implementation.

## Visible app and parallel ownership

The root route opens Projects. The first dashboard lists the two registered Astro working copies; Studio contains page navigation, responsive preview, contextual controls and recent source history. CMS, IA, deployments and agency navigation wait for implemented capabilities. Three SOL high agents own canvas, inspector and history in separate worktrees. The coordinator owns shared scripts, CI, integration review and executable browser evidence.

## Source and preview authority

The runner remains the only source writer. The browser prepares supported commands and applies a server proposal; it never posts arbitrary patches. The canvas joins exact fixture DOM anchors to the current server model. Repeated, generated and ambiguous targets remain read-only. Browser computed values are observations, not edit authority. The optional control fallback value preserves approved source/token provenance without broadening writes.

The runner passes the exact configured app origin to a development-only Astro integration. Session scope arrives through a validated parent/iframe handshake. No wildcard target origin, permanent authored marker, company checkout edit or ordinary-build injection is required. A fresh model/frame is required after a receipt. Saved source and preview freshness are separate states; a failed preview does not erase a durable receipt.

## Recovery and history

Use the existing journal as the only durable source of write receipts and history. Undo/redo creates new guarded receipts. The server supplies authoritative stack entry IDs; the client never infers undo order from its rendered recent list. The journal is retained without pruning for M1, with the latest 200 audit entries exposed. Tests exercise more than 20 undoable operations across restart.

A malformed, mismatched or server-failure response after dispatch is an uncertain result. Keep the original logical request ID, reconcile it and block new writes. A missing lookup is not evidence that the original request cannot still arrive. Retry only the exact original request while its session, revision and target remain current. Browser recovery metadata may identify that request, scoped to the current local operator; it cannot contain cached source authority or establish that a save succeeded.

## Local verification and tracking

Pin Playwright for the requested browser proof. `verify:editor` launches an isolated production app and runner, edits temporary fixture copies, captures responsive screenshots/video and source diffs, then stops Stellar and builds/serves the edited Astro site independently. Root scripts and CI include the relevant unit/integration checks and browser command. Record actual local results and a source fingerprint; do not claim remote CI, Macroscope, ClickUp or user visual approval.

See the [M1 index](../prds/README.md), [Studio bridge](../architecture/studio-preview-bridge.md), [history journal](../architecture/history-journal.md) and [local tracking decision](003-local-m1-delivery-and-tracking.md).
