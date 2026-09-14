# M1-04 canvas and selection — implementation handoff

## Context

The user requested the first real Stellar Studio on `codex/m1-04-canvas` in `/private/tmp/stellar-m1-04-canvas`, based on `29cac07`. [M1-04](../../prds/m1-04-canvas-and-selection.md) governs this slice. The runner and pure source engine from M1-02/03 are prerequisites. Inspector and history are parallel, separately owned features.

## Goals

- Show both registered projects and open real Home/Contact previews.
- Provide exact responsive widths, fit/actual scaling, inspect/interact modes, and source-linked selection.
- Reject stale or foreign frame messages and expose the selected source target to the inspector.
- Keep editor instrumentation out of ordinary preview and build output.

## Non-Goals

- Inspector controls, history mutations, structural editing, arbitrary repository import, and deployment.

## Scope

`apps/web/app/{page.tsx,globals.css,projects/**}`, `apps/web/features/studio/**`, `apps/web/test/bridge.test.cjs`, `packages/astro-editor-integration/**`, `apps/runner/src/preview-integration/index.mjs`, and a local Studio guide. Root lockfile is coordinator-owned.

## Plan

1. Implement the dev-only Astro integration and frame protocol.
2. Build typed Studio API/state and strict frame validation.
3. Add project list, shell, responsive canvas and accessible selection UI.
4. Verify checks, integration behavior and clean output; hand off the feature branch for combined browser acceptance.

## Progress

- 2026-09-14: Read intake, PRD, handoff, contracts, runner seam, fixture, and design references. Agreed inspector and history prop seams with their owners.
- 2026-09-14: Implemented the project dashboard, Studio shell, exact-width iframe, frame handshake, source-target validation, Astro development injection, and user/architecture documentation. Inspector and history render through separately owned feature imports.
- 2026-09-14: Follow-up hardening added strict preview URL parsing, full fit scaling at narrow widths, history-busy interaction lock, a reachable iframe refresh action and CSRF rehydration for a deep-linked tab.
- 2026-09-14: Combined browser run reported a hydration mismatch after reloading with a saved 390 px width. Studio now renders deterministic defaults first, restores saved preferences after hydration and writes them back only after restoration. The coordinator will rerun the real browser reload gate.
- 2026-09-14: Expanded browser run found an Interact link navigation bug: the child frame's referrer changed from app origin to the preview's own origin. The development script now accepts only those two exact referrer origins while retaining exact configured app-origin/window postMessage checks. A VM regression test covers the route hello after internal navigation and foreign-referrer rejection.
- 2026-09-14: Read-only review found browser Back bypassed the Inspector draft guard because Next handled it as client navigation. A same-URL history checkpoint now re-arms synchronously and invokes the existing async guard; unit tests cover Keep editing, repeated Back, approved leave, and deep-link fallback. Coordinator browser acceptance remains required.
- 2026-09-14: An intermittent redo run showed a durable new receipt while the preview retained its previous computed color. Studio had reloaded the iframe before its session read returned the new revision. Receipt handling now waits for the current authenticated session before a revision-keyed reload; if reconciliation reports an already-known revision, it forces one refresh after that confirmation.
- 2026-09-14: Review of the Back checkpoint found it could stack after reload/remount. The guard now reuses an existing same-URL sentinel and retains whether a prior route was available, with tests for both dashboard navigation and direct deep-link fallback after remount.

## Surprises & Discoveries

- The runner starts the trusted integration for managed previews but supplies no session scope to it. The frame must obtain the scope through a parent-window handshake after the shell has the fresh server model.
- Reading sessionStorage in a client component state initializer differs between server rendering and hydration. Preference restoration must occur after the first render, with persistence held until the saved values have been read.

## Decision Log

- 2026-09-14: Keep frame messages as observations. Parent correlates source keys to its current fetched model; no preview-supplied edit authority is trusted.

## Validation

- `npm install --package-lock-only --offline` and `npm ci --offline --ignore-scripts --no-audit --no-fund` succeeded for this worktree. The generated lockfile is coordinator-owned and excluded from this commit.
- `npm run build:contracts`, the five bridge tests, the integration package test, Astro integration JavaScript syntax checks, scoped web lint, `npm run verify:docs`, and `git diff --check` passed.
- Standalone `npm run typecheck --workspace=@stellar/web` found only the intentionally cross-owner missing imports for `../inspector/Inspector` and `../history/HistoryControls`; a combined typecheck follows their integration.
- Pinned Astro 7.3.2 actual dev server with explicit local app origin returned HTTP 200 and injected the bridge. An ordinary dev server returned HTTP 200 without bridge/protocol markers. A clean fixture build also contained none of the editor identifiers.

## Outcomes & Retrospective

Pending.

Coordinator closeout, 2026-09-14: integrated production build and expanded real-browser acceptance passed. The final [integration review](../../handoffs/m1-editor-review.md) supersedes the intermediate pending integration gates above. User visual review remains open.
