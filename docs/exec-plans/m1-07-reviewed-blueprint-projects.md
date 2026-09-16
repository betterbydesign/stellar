# Reviewed blueprint projects

## Context
Implement [M1-07](../prds/m1-07-reviewed-blueprint-projects.md) in isolated branch `codex/reviewed-blueprint-projects`, based on committed foundation e8eefbc. No pending company review files are imported.

## Goals
One reviewed Astro blueprint; authenticated, persistent named creation; additive legacy preservation; independent editing, history, reopen and build.

## Non-Goals
Remote imports, WP/ACF, deployment, shared branch changes, and launcher lifecycle changes.

## Scope
Registry/contracts, Projects UI, broker and runner dispatch; regression and browser evidence; local documentation.

## Plan
1. Integrate committed baseline and delegate disjoint registry/contracts and UI work to SOL high.
2. Wire authenticated broker and runtime creation.
3. Run independent SOL high review, fix findings, verify/build and browser acceptance with temporary data and isolated ports.
4. Record evidence and handoff overlap.

## Progress
- 2026-09-15: Read intake and PRD; fast-forwarded isolated branch from main foundation to e8eefbc.
- SOL high agents own registry/contracts, Projects UI and independent review. Root added authenticated broker dispatch and workspace initialization coordination.
- Originating task confirmed server entrypoint/lifecycle changes are disjoint from the Runner class changes here.
- Added named-project browser acceptance, with disposable data and random ports.
- 2026-09-16: Fixed independent review findings, passed final verification/build and acceptance, and recorded local handoff.

## Surprises & Discoveries
Default baseline lacked M1 and M2-01; local foundation integrated as authorized. Registry migration needed to retain legacy names and original executable validation behavior. macOS temporary directories can have canonical ancestor aliases, so leaf and owned-child checks must not reject normal disposable test paths.

## Decision Log
- Preserve launcher, lease, preview worker supervision and server entrypoint. Only project dispatch changes belong here.

## Validation

- `npm ci` and `npm run fixture:install`: pinned dependencies installed in this worktree.
- `npm run verify`: passed; 112 tests in this full run, plus docs/harness, lint, typecheck and fixture validation.
- Final focused registry recovery suite: 7/7 passed, including two recovery tests added after the full test phase. These add coverage without changing production code.
- `npm run build`: passed for packages, production Next application and independent Astro fixture.
- `npm run verify:projects`: passed, using temporary data and random loopback ports. Real Chromium covered two independently named projects, a source token edit at 390/768/1440 preview widths, reload, runner restart, independent histories, lost creation response and same-request retry, legacy preservation and independent edited-site build after services stop. No browser errors.
- `npm run verify:local`: passed for legacy operator/origin/CSRF gates, source editing, duplicate/stale checks, restart and seed isolation.
- `git diff --check`: passed. Lifecycle file diff is empty; server entrypoint remains unchanged.
- [Executed logs and independent review](../evidence/m1-07/review.md) and [browser result](../../output/playwright/m1-projects/result.json) are retained. Screenshots and workflow video are in `output/playwright/m1-projects`.
- Final browser source identity is recorded in the linked result JSON, based on e8eefbc and 128 implementation/test files. Recomputed after verification and matched.
- Early checks found transient missing agent files, macOS temporary-path alias handling, and sandbox loopback restrictions. The implementation issues were fixed and final port-based checks ran with approved local execution. No failed check is represented as passing.

## Outcomes & Retrospective

Completed locally on `codex/reviewed-blueprint-projects`. One pinned Astro Style Lab blueprint, persistent named creation, additive v1 registry migration, independent source/history and real Studio editing are implemented. SOL high registry/contracts, UI and independent review agents completed their bounded work; final review reported no remaining P0–P2 defects.

The user subsequently authorized committing this slice and syncing it into the saved local checkout while preserving its uncommitted launcher lifecycle changes. No remote push or deployment is authorized. No company ACF review artifacts or Agent Hub code were imported. The user's saved checkout, running services and `.stellar-local` data were not used.

Integration overlap: preserve the originating task's lifecycle changes separately. This slice changes `server.ts` imports and the Runner class only. The originating task owns its startup-error import and `main()`/entrypoint, `launcher.mjs`, `managed-child.mjs`, `lease.ts`, `startup-error.ts` and `lifecycle.test.ts`; those changes are not included here.

Boundaries remain one local blueprint, supported CSS/token edits, no arbitrary source import or remote hooks, no deletion or deployment. New projects enforce the reviewed source inventory; legacy copies retain their established executable checks so saved M1 work remains compatible.
