# M1-01 implementation and review

## Context

The user requested SOL high subagents to implement the first local editor PRD and the coordinating agent to review it. Work starts from the committed PRD set at commit `703e12c` on `codex/m1-01-contracts-fixture`. The worktree was clean. Scope is [M1-01](../../prds/m1-01-contracts-and-fixture.md); the next runner/editor PRDs are not included.

## Goals

- Provide an importable contract package with strict runtime validation and examples for the later runner, source engine and canvas.
- Provide a pinned, self-contained Astro fixture whose source declarations and supported edit manifest agree.
- Integrate root/CI checks and independently review the combined deliverable against all six M1-01 acceptance items.

## Non-Goals

No project runner, visual editor UI, source writer, CMS, live company import, agent runtime, hosted service or deployment is implemented. This request does not publish changes or create external tasks.

## Scope

Contracts agent owns `packages/contracts` in the isolated `codex/m1-01-contracts-agent` worktree. Fixture agent owns `fixtures/astro-style-lab` in `codex/m1-01-fixture-agent`. Both use SOL with high reasoning. The coordinator owns root workspace/lock/CI changes, source-to-manifest verification, documentation, integration and independent review. Agents coordinate the shared fixture manifest before its validation hardens.

## Plan

1. Read the harness intake, PRD and supported-case matrix; establish disjoint worktrees.
2. Implement and agree contract/manifest shapes while the fixture pages and styles are built independently.
3. Review and integrate the two owned directories; validate schema, source mapping and package boundaries.
4. Exercise negative cases and fix confirmed defects with the owning agent.
5. Run clean installation, all root checks, ordinary fixture and app builds, and inspect both fixture routes in a browser.
6. Record actual acceptance evidence and the next-agent handoff; finish only the authorized M1-01 scope.

## Progress

- 2026-09-14: created implementation and two isolated agent branches from the clean PRD commit.
- 2026-09-14: dispatched SOL high contracts and fixture agents in isolated worktrees.
- 2026-09-14: integrated the reviewed contracts and fixture, added independent source assertions and wired both dependency locks into root/CI checks.
- 2026-09-14: resolved review findings, completed clean installs, 19 tests, full root checks, production builds and responsive browser review. No commit, push or deployment was performed.

## Surprises & Discoveries

Review found a mismatched reconciliation operation, missing token inspector metadata, and proposals whose file/impact were not bound to the selected target. All were fixed with regressions. The fixture must keep its own dependency lock to build outside Stellar. TypeScript 6 is scoped to contracts for lint compatibility while the app retains TypeScript 7. Contract validation is separate from runtime authorization, filesystem containment and atomic persistence owned by M1-02.

## Decision Log

- 2026-09-14: keep the fixture outside npm workspaces with its own lockfile and ordinary Astro build so portability can be demonstrated without Stellar.
- 2026-09-14: keep generated contract output untracked and compile before importing it in validation/tests. Root checks will cover all new source rather than only the existing web app.
- 2026-09-14: no source engine or runner is required to pass M1-01; validators and fixture/source assertions must not claim those runtime capabilities.

## Validation

All checks below ran successfully on 2026-09-14 after review fixes:

- Root `npm ci --no-audit --no-fund`: clean installation from the updated workspace lock.
- Root `npm run fixture:install -- --no-audit --no-fund`: independent fixture clean installation.
- Root `npm run verify`: strict harness integrity/profile, all-document scan, web/contracts/checker lint, both workspace typechecks, 9 contract tests, 6 fixture source tests, 4 harness tests, and source validation of 2 pages / 11 targets / 15 rules. All 19 tests passed.
- Root `npm run build`: contracts, Next.js production build and both Astro static routes passed.
- Isolated fixture copy outside the repository: its own `npm ci --no-audit --no-fund` and `npm run build` passed with no Stellar or sibling services; generated Home and Contact HTML was byte-identical to the build in this checkout.
- Rendered HTML assertion: each declared anchor appears once on its expected page; no duplicate IDs, editor markers, source paths or browser scripts.
- Browser inspection: both routes had no horizontal overflow at 390/768/1024/1440; CTA spacing followed the explicit mobile/base CSS, navigation worked, no warning/error logs. Desktop/mobile captures were inspected in the task. The temporary preview server was stopped and viewport override reset.
- Coordinator read the combined source and harness/CI diff, confirmed generated output is ignored, and swept user guides. No new user guide is appropriate until the editor exists.

All M1-01 acceptance items A–F are satisfied locally. Exact handoff and review limits are in [the handoff](../../handoffs/m1-01.md); remote CI has not run for this change.

## Outcomes & Retrospective

M1-01 is complete locally and independently reviewed. The branch contains the validated editor protocol, original two-page Astro fixture, reproducible root/fixture setup and source-verification coverage. M1-02 and M1-03 may start in parallel once this local change is committed/integrated; neither is implemented here. Source ownership and impact must be checked against manifest data even when a proposed file is generally allowlisted. Full runtime safety, editor interaction and persistence proof remain explicit downstream requirements.
