# Stacki upstream audit and first batch

Branch: `codex/stacki-selective-upstream`, based on authorized kickoff `eac9459`. Review this branch's commits locally; do not sync another checkout, merge a shared branch or push without the user's authorization. The task fast-forwarded only its own worktree from stale `f12d3a5`; main and the saved checkout remain untouched.

## Delivered

- Audited the complete `800fa52..fd2a38f` range from a fresh temporary Stacki reference. Live head matched the kickoff observation: 60 commits, 397 files. See the [decision matrix](../research/stacki-selective-upstream-audit.md) and [exact provenance](../provenance/sources.json).
- Adapted deterministic generated source-preservation tests, then fixed two original Stellar gaps: UTF-8 BOM loss in fingerprints/patch coordinates and case-sensitive matching of standard CSS declaration owners. Escaped property names are conservatively read-only after independent review exposed an additional ownership ambiguity. Authored casing, BOM, line endings and neighboring bytes are preserved.
- Kept upstream source ported at **none**. Runtime package manifests, shared contracts, auth, provider wiring, preview runtime, runner lifecycle, default ports and saved project data are unchanged. Existing MIT provenance remains preserved.

## Verification and evidence

Root `npm run verify` passed 151 tests/subtests plus lint, typechecks and docs/harness/fixture checks; `npm run build` and `npm run verify:local` passed. The focused editor package passed 42 tests/subtests, including 32 deterministic source variants with four edit paths each. The generated regressions failed before the implementation. The isolated browser proof passed UI review/apply, rendered color, exact-byte undo/redo, duplicate-owner refusal, independent clean Astro build, unchanged seed/other project and absence of page errors. See [evidence](../evidence/stacki-upstream/), [browser result](../evidence/stacki-upstream/browser-result.json), [screenshot](../evidence/stacki-upstream/source-preservation.png) and [independent review](../evidence/stacki-upstream/review.md).

Reproduce after installing the pinned workspace and fixture dependencies: `npm run verify`, `npm run build`, `npm run verify:local`, then `node test/editor-e2e/upstream-preservation.mjs`. The browser proof uses temporary data and dynamically allocated listeners and requires Playwright Chromium. It does not use the default launcher ports or user's projects. Browser-computed inspector values are selection observations; the proof reselects the target in the refreshed frame before its screenshot.

## Reproduced follow-up risk: watcher backlog

The exact affected path is `apps/runner/src/workspace.ts`, `serial` at lines 84–88 and `startWatcher` at lines 187–195 in the kickoff runner (unchanged by this branch). The watcher adds a refresh task every 400ms to the same serialized queue as user operations. If snapshots repeatedly take longer than that, outstanding refreshes accumulate and delay edits/session actions. An in-memory 650ms refresh probe over 2.1 seconds observed five scheduled, two completed and three outstanding refreshes; all five eventually drained. The outstanding count includes the active refresh, so two were waiting in that observation. [Probe](../evidence/stacki-upstream/watcher-backlog.mjs), [result](../evidence/stacki-upstream/watcher-backlog.json).

This is a sustained slow-refresh risk, **not an observed blocker for ordinary editing**: ordinary source writes, restart/reconciliation and browser history acceptance passed. It is not a demonstrated WorkOS/Convex or agent-platform prerequisite. A long individual operation may also create a temporary backlog. Coordinate with the runner lifecycle owner before implementing coalesced watcher reads (one active plus at most one pending follow-up), and test that apply/close ordering and explicit writes are retained. Stacki's 256-pass renderer drain cap is not a suitable fix. The user explicitly kept watcher coalescing outside this batch.

## Remaining review boundaries

User integration review remains. The source engine still supports only its manifest-owned, bounded CSS surface; it does not decode escaped property names or prove an arbitrary project's full cascade. Diff-mapping remains a future experiment with adversarial mapping, concurrent edit and exact history gates. No shared-branch merge, cross-task checkout sync, push, deployment, paid operation or external project write occurred.
