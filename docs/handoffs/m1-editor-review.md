# M1 local editor integration review

## Delivered scope

Three SOL high implementation agents supplied M1-04 canvas/selection, M1-05 contextual styles and M1-06 source history in isolated worktrees. The coordinator integrated and reviewed them with the existing M1-01–03 foundation, added executable browser acceptance and updated root verification/CI. The root route now opens a usable Projects dashboard and Studio.

This is the registered local Astro fixture proof. General repository import, HTML authoring, structural drag-and-drop, Lumos adapter validation, hosted isolation, WorkOS/Convex/Letta, WP/ACF content integration and deployment remain follow-on work. The company repositories and seed are unchanged. No ClickUp, Macroscope, remote CI, push, PR, merge or site deployment is claimed.

## Review findings resolved

- Restore stored viewport preferences after hydration, rather than rendering different server/client defaults.
- Reconnect the exact-origin bridge after a same-preview site navigation; a child referrer is not always the app origin.
- Refresh the iframe after confirming the current session revision, avoiding an initial reload stamped with the older revision.
- Guard browser Back as well as in-app navigation, preserving draft choice and the prior route across reloads.
- Treat malformed, mismatched and server-failure save responses as uncertain, including history POST responses.
- Retain the original operation identity for reconciliation, including reload recovery; a missing result cannot authorize a new logical write.
- Accept an old-session receipt only through a newly authorized lookup; current session/model still determine edit authority.
- Keep a durable source receipt visible when preview refresh fails. Distinguish an older receipt from the active newer source revision.
- Preserve approved fallback token references and accessible field labels; trap and restore focus in the draft decision dialog.

## Evidence and acceptance

The executable browser scenario is `test/editor-e2e/run.mjs`. It launches temporary app/runner services and fixture copies, then cleans them up. Run the root build before `npm run verify:editor`; install Chromium once with `npx playwright install chromium`.

Final local results: `npm run verify` passed 72 tests plus harness/docs/lint/typechecks/fixture validation; `npm run build` passed package, production Next and two-route Astro builds; `npm run verify:local` passed the real authenticated API workflow; `npm run verify:editor` passed the expanded browser scenario with zero browser exceptions. Final source fingerprint prefix: `197261adfe7c`, with the full digest and environment in the [result artifact](../../output/playwright/m1-editor/result.json). Evidence is in `output/playwright/m1-editor`; source fingerprints identify the actual code tested even when the final documentation commit follows the run. Browser exceptions are a failure gate. A frame-ready handshake is not independent proof of fresh CSS; rendered computed-style assertions are the freshness gate.

## User review

The workflow is available through `npm run dev:local` from the repository root. Open the launcher's one-time connection link, choose either project, then select a source target. Use Base/Mobile scope and Review change → Apply to source. The [Studio](../user-guide/studio.md), [styles](../user-guide/style-inspector.md) and [history](../user-guide/source-history.md) guides describe the supported controls and recovery.

Implementation review and automated checks do not constitute user visual approval. The broader client portal and CMS dashboard follow this local editor review and the existing [company-site POC](../POC-01-company-site.md).

## Acceptance coverage map

| Criteria | Primary evidence |
|---|---|
| M1-04-A | Real browser opens both copies and Home/Contact, stops a preview, breaks compilation, repairs source and retries; runner lifecycle tests cover occupied ports and startup cancellation. |
| M1-04-B–D | Browser checks 390/768/1024/1440 website widths, Fit/100%, matching outline rectangles, scroll, nested pointer selection, keyboard target selection, read-only component, Interact link navigation and Escape. |
| M1-04-E–F | Exact-window/origin/project/session/page/frame/revision validator tests; authenticated broker and runner denial tests; browser reload/restart/navigation recovery; request sequence and current-scope checks discard late source/selection responses. |
| M1-04-G | Explicit-editor vs ordinary Astro integration tests and real dev checks; independent edited build scan; responsive screenshot/source identity artifacts. |
| M1-05-A–E | Browser shows source/provenance and scope, changes base spacing, changes/reset mobile override, reviews shared token impact and verifies both routes; source diffs and independent copy/seed fingerprints. |
| M1-05-F–H | Invalid-input UI, read-only target, rapid duplicate Apply, stale proposal rejection, draft/Back dialog and keyboard checks, lost response across reload, retained receipt with failed preview; contract/parser tests cover unsupported values and token cycles. |
| M1-06-A–D | Browser undo/redo and reload recovery; journal tests cover multi-file LIFO, redo invalidation, 21 operations across restart, duplicate IDs, external drift, interrupted replacement and third-state conflict. |
| M1-06-E–G | Root commands/CI wiring, isolated real browser scenario, ordinary edited build after stopping Stellar, source identity, screenshots/video, guides and this review handoff. |

The browser suite and lower-level tests are complementary. Malformed frame envelopes, token cycles, same-ID retries and journal fault points are deterministic lower-level cases; they are not all simulated through browser controls. General imported projects, every browser engine and multi-user races are outside this local proof.

## Recorded artifacts and timing

[Workflow video](../../output/playwright/m1-editor/workflow.webm), [desktop Studio](../../output/playwright/m1-editor/studio-1440.png), [dashboard](../../output/playwright/m1-editor/projects-dashboard.png), [narrow inspector](../../output/playwright/m1-editor/studio-narrow-inspector.png), [source diff/receipts](../../output/playwright/m1-editor/source-changes.json) and [verification log](../../output/playwright/m1-editor/verification.log) are retained. All 13 screenshot filenames are listed in the result artifact.

The measured setup-to-A-open time was 9.017 seconds, including project B compilation failure/repair/retry. Four Apply-to-current-frame-handshake measurements were 223–241 ms. Computed CSS checks separately established rendered correctness; these local fixture measurements do not establish general project performance.
