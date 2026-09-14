# M1-06 history backend and controls

## Context

The M1-06 PRD requires durable undo/redo over the existing runner journal. This plan covers the isolated `codex/m1-06-history` worktree at `29cac07`. Canvas, inspector, final browser proof, root verification wiring and shared status are coordinated separately.

## Goals

- Add authenticated, revision-guarded undo/redo using one-file source patches and new durable receipts.
- Preserve history and idempotent request outcomes across runner restart, with at least 20 operations available.
- Show recent changes and safe Undo/Redo controls in the studio toolbar.

## Non-Goals

- A second history store, whole-file restore, Git history, cloud backup, or global collaboration.
- Declaring all M1-06 acceptance complete before the integrated browser and portable-build proof.

## Scope

Runner journal/runtime/server, existing web broker/API, `features/history`, their tests, and this history-specific plan, architecture and handoff. No contracts, engine, fixture, studio or inspector changes without coordinator.

## Plan

1. Agree the history component and API shape with the canvas agent and coordinator.
2. Extend operation journal replay to derive undo/redo availability and invalidate redo after a new edit.
3. Implement guarded inverse/forward patch writes with revision, source digest, journal intent and recovery checks.
4. Expose history command through runner dispatch and authenticated browser broker.
5. Build controls and test restart, conflicts, duplicate IDs, branching, token impact and 20-plus operations.
6. Verify package/root checks, document behavior and hand off a committed isolated change.

## Progress

- 2026-09-14: Read harness intake, PRD, predecessor handoff and current journal. Agreed toolbar props and added guarded journal-backed history operations, broker/API route, controls, contracts metadata, and focused tests.

## Surprises & Discoveries

- The current journal already stores original proposal, full file pre/postimages, fingerprints, sequence and receipt; history listing exists but buttons are disabled.

## Decision Log

- 2026-09-14: Use `POST /history` with `HistoryCommandSchema` and `ApplyChangeResponseSchema`; preserve the journal as the only durable operation store.

## Validation

- Contracts tests: 9 passed.
- Runner tests: 14 passed, including real Astro history/recovery tests.
- Web broker and history logic tests: 10 passed.
- Contracts, runner, and web typechecks and focused lints passed.
- Docs and harness checks passed.

## Outcomes & Retrospective

Scoped backend/UI handoff is ready for coordinator integration. Full M1-06 remains pending integrated browser proof, portable fixture build, and final root verification.
