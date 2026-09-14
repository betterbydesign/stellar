# M1-05 Style Inspector ExecPlan

## Context

Implement [M1-05](../../prds/m1-05-style-inspector.md) on `codex/m1-05-inspector` from `29cac07`, in the isolated `/private/tmp/stellar-m1-05-inspector` worktree. M1-01 through M1-03 provide contracts, source model and real write APIs. M1-04 provides the canvas shell concurrently. The inspector is a client of that shell and of the existing authenticated API.

## Goals

- Show source-backed local style controls, independent base/mobile edit scope, ownership and read-only reasons.
- Prepare and explicitly apply local set/reset and concrete linked token edits with bounded impact review.
- Preserve drafts through recoverable failures and navigation decisions; keep durable receipts distinct from preview freshness.
- Validate state transitions, late async responses and idempotent/lost-response handling with focused tests.

## Non-Goals

No new backend route, runner writer, parser, contract, fixture or global studio shell change. No arbitrary CSS, aliases edits, temporary iframe-only styling or hosted sandbox behavior.

## Scope

Own `apps/web/features/inspector/**`, its tests/styles, this plan, `docs/user-guide/style-inspector.md`, and `docs/handoffs/m1-05.md`. Root package/dependency/script changes go through the coordinator. Verify lint, typecheck, tests and production build where the isolated branch can run them.

## Plan

1. Agree inspector props and navigation guard with M1-04 shell owner.
2. Implement pure draft/operation state and typed edit-value validation.
3. Implement authenticated prepare/apply/reconcile client against the existing routes.
4. Build accessible local/token controls, impact review, explicit Apply and navigation dialog.
5. Test state and API races, run checks, document behavior and hand off for integrated browser acceptance.

## Progress

- 2026-09-14: Read harness intake, M1 index/PRD and predecessor handoffs; agreed shell props and draft guard. Implemented isolated inspector controls, pure edit-state transitions, API client and focused tests. Canvas integration and browser acceptance remain with coordinator.

## Surprises & Discoveries

- The M1-01 source model has authored/resolved/provenance values. M1-03 later added bounded, optional browser computed styles to the selection envelope; the inspector labels them as observations, never source write authority.

## Decision Log

- 2026-09-14: The canvas shell remains the single session/model owner. Inspector receives source model and selected target, and reports durable receipts through a callback.
- 2026-09-14: A Promise-based navigation guard supplied to the shell resolves only after the user chooses Apply, Discard or Keep editing.

## Validation

- `npm ci`: passed (354 packages).
- `npm run build:contracts`: passed.
- `npm run typecheck --workspace=@stellar/web`: passed after inspector implementation.
- `cd apps/web && ../../node_modules/.bin/eslint features/inspector test/inspector.test.cjs`: passed.
- `node --conditions=react-server -r ./apps/web/test/register.cjs --test apps/web/test/inspector.test.cjs`: 5 tests passed.
- `npm run verify:docs`: passed after the guide and handoff were added.
- `npm run build`: passed, including packages, Next and Astro fixture.
- `npm run verify`: harness, docs, lint, typecheck, contracts and editor-core passed; runner tests hit this sandbox's `listen EPERM 127.0.0.1` restriction. The coordinator will run the combined suite with loopback permission.

## Outcomes & Retrospective

Inspector implementation is ready for the M1-04 mount and integrated browser review. The coordinator owns final acceptance.
