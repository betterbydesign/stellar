# M1-06 — Durable history, recovery and the complete editor proof

Status: dependent on M1-02 through M1-05. Local identifier M1-06. Parent: [M1 index](README.md); integrated exit evidence for this local milestone.

## Overview

Close the first useful editor loop: undo/redo a source change, recover from a stale edit or restart, reopen the project, and build the edited site outside Stellar. Deliver executable regression coverage, a short workflow video and a reproducible handoff. This is a feature and integration PRD, not permission to declare completion after adding a test checklist.

History is a local project capability over the runner's durable receipts. Multi-user collaboration, Git commit management, branching UI, deployment rollback and cloud backup are not included.

## Prerequisites

- Real project opening, source mutation, selection and inspector acceptance from M1-02/03/04/05.
- M1-02 durable intents/receipts and fault-recovery semantics; M1-03 inverse proposal support. If a prerequisite is missing, return the defect to its owner instead of building a duplicate subsystem here.
- M1-01 fixtures and exact source outcomes. No external account, company project or site deployment needed.

## User Stories

- As an editor, I want to undo and redo an applied style change without losing other source edits.
- As a developer, I want to restart the editor and see the actual applied source state rather than an old browser snapshot.
- As the project owner, I want evidence that this workflow operates on ordinary site code I can build without Stellar.

## Technical Requirements

### Endpoints and routes

Add M1-01's history undo/redo operations through the existing session broker and source-write adapter. Use expected revision, request ID and an opaque history-entry target. The engine prepares an inverse/forward patch from stored authorized data; the browser does not send arbitrary historical file contents as a write request.

Do not bypass apply validation for undo. Each undo/redo has its own logical-operation request ID, retained on retries; reconciliation uses M1-02's existing request-outcome store. A stale history base is a conflict. Source models and selection generations refresh after undo/redo just as after an ordinary edit.

### Interface

Add a compact recent-changes view with changed target, scope, source file, timestamp and before/after summary. Expose Undo/Redo in the toolbar with available/disabled reasons. Keyboard shortcuts respect focused text inputs and native field-level undo; they do not issue global source undo while the user edits a text value.

After reopening, show the latest applied revision and available history. A pending unsaved form draft need not survive a full app restart; its loss must not be confused with loss of an applied source edit. Preserve a current draft on in-session recoverable errors as specified by M1-05.

When newer source invalidates an undo or proposal, explain the conflict and offer reload/review. There is no force overwrite or silent last-writer-wins option in M1. Preview failure after a durable undo is reported independently from write success.

### Data model

Use the M1-02 journal as the single durable source of receipts and recovery. Keep at least the most recent 20 undoable operations per project across session/runner restarts; document retention and pruning. Do not prune unresolved operation intents or source needed for recovery. A new ordinary edit after undo invalidates the redo branch, while preserving audit information about what happened.

Undo applies only when the current expected revision matches the stored post-state. It creates a new receipt/revision rather than moving source backwards without an audit record, even if the resulting bytes match an older state. Redo requires the corresponding unmodified undo state. No-op reparse/restart preserves source revision and history; an actual external observed change invalidates unsafe history actions. Never restore a whole historical file over unrelated edits.

History entries can be scoped to a supported single-file command even when a shared token affects multiple routes. Tests must verify such impact without treating the operation as independent per-route edits.

### Integrations

Add the meaningful editor end-to-end suite to root verification and the CI workflow. Provide a deterministic local command that launches and tears down the app, runner and isolated fixture copies without depending on sibling checkouts, preexisting servers or company credentials. CI must install the fixture's locked dependencies and build its edited output as part of the proof.

Validate the edited project with its ordinary build command after stopping Stellar services. Check the resulting output for the applied style/token values and absence of editor scripts, injected markers, session capabilities and Stellar-serving dependencies. Do not claim every possible imported Astro project is portable from one fixture result.

## Acceptance Criteria

- [ ] M1-06-A: Undo/redo local and shared-token edits updates source, preview and selection with new durable receipts and correct availability state.
- [ ] M1-06-B: New edits after undo invalidate redo. Duplicate/lost-response undo requests do not apply twice. Observed newer source blocks stale undo/apply without overwriting it.
- [ ] M1-06-C: Browser reload, preview restart, runner restart and project close/reopen preserve the final applied source and recoverable history; project A/B remain independent.
- [ ] M1-06-D: Simulated interruption before/after source replacement recovers a matching receipt or reports the third-state conflict; no false saved state or duplicate edit occurs.
- [ ] M1-06-E: The complete script below runs from a clean setup, with actual source assertions and browser evidence at the specified widths.
- [ ] M1-06-F: The edited fixture builds/serves without Stellar, and output contains no editor instrumentation or capabilities.
- [ ] M1-06-G: Root verification and production builds pass, the workflow video/screenshots and source diffs identify the tested revision, known limitations are documented and the user review handoff is ready.

## Testing Plan

Use a single acceptance scenario with independent failure tests around its boundaries:

1. From clean seed copies, open project A/Home and confirm real Astro output. Inspect 390/768/1440 plus a 1024 CSS-pixel intermediate width; capture relevant responsive evidence.
2. Select the unique hero target, apply a base spacing override, set a mobile override, switch widths and assert the expected independent values in rendered output and source.
3. Reset the mobile override and verify its fallback. Review/change the shared color token, visit Contact and verify both routes changed. Confirm project B and seed source did not.
4. Undo/redo the token change and inspect the new receipt/revision. Reload the browser, restart the runner and reopen; assert the actual disk and rendered state match the last accepted operation.
5. Prepare an edit, make a controlled external source change, then apply the old proposal and attempt stale undo. Both must conflict without overwriting the newer observed bytes. Verify read-only repeated/unsupported targets and malformed cross-project frame/API requests cannot write.
6. Inject a lost response and interruptions around the apply boundary. Reconcile via durable request IDs/history instead of replaying writes. Confirm preview-refresh failure does not erase a successful save record.
7. Stop Stellar, build and serve the edited fixture ordinarily, and verify output/capability absence. Preserve a short video, screenshots, source diffs and a command/result summary under the evidence root, labelled with source revision and environment.

Tests should assert useful behavior, not mirror helper implementation. Use temporary runtime directories and deterministic failure injection. Record timings for startup and apply-to-preview on the fixture; the parent PRD's 100 ms/2 second goals remain measurements, not unverified promises or arbitrary CI timing gates. Manual review checks focus clarity, keyboard behavior, scope comprehension and visual alignment; it complements automated tests.

## Rollback Plan

Disable undo/redo UI and retain journals if a history defect is found. Fix or revert source code without deleting project data. Recover a site file from an inspected preimage only through the same scope/revision checks or an explicitly reviewed developer recovery operation. No Git reset, deployment rollback or bulk project cleanup is implicit.

## Timeline

1. Persistent history listing and guarded undo/redo: first user-facing recovery slice.
2. Restart, conflict and request-reconciliation integration tests.
3. Full workflow evidence, portable build and user-guide completion; evaluate every M1 exit checkbox and record remaining follow-on work.

## Dependencies On Other Work

Requires M1-01 through M1-05. Acceptance defects should be fixed in the owning subsystem and rerun at the affected level. Passing M1 enables the real company POC/canvas integration and hosted-runner planning; it does not implement those milestones.

## Agent handoff

Own history feature code and tests, additions to existing runner history/broker modules, the toolbar integration agreed with M1-04, `test/editor-e2e/**`, evidence and the complete editor guide. Coordinate root scripts/CI with the integrator. Do not rewrite the engine, fixture or inspector to avoid a failing acceptance case; route those fixes to their owners. Deliver a pass/fail matrix for every M1 exit item and a concise next-milestone handoff. Use SOL high and a separate review pass; do not equate an agent's review with the user's requested visual approval.
