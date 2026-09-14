# M1-04 through M1-06 — Usable local studio

## Context

The user requested all foundation changes committed, local decisions/statuses tracked without ClickUp or Macroscope, and SOL high subagents for M1-04 and independent M1-05/06 work. Foundation commit: `29cac07`, on `codex/m1-02-project-runner`. The visible root page is still the bootstrap shell. See [Decision 003](../../decisions/003-local-m1-delivery-and-tracking.md) and the [M1 index](../../prds/README.md).

## Goals

Deliver the real project list and responsive canvas, source-linked selection, supported style/token editing, guarded durable undo/redo, and reviewable end-to-end evidence. Commit the requested local work and keep acceptance status truthful.

## Non-Goals

No external task registration, Macroscope result, push, PR, merge or deployment is implied. General repository import, CMS/IA dashboards, hosted accounts, structural dragging and Agent Hub integration remain later work.

## Scope

Studio and preview integration (M1-04), inspector (M1-05), history backend/UI and integrated proof (M1-06), root verification wiring and local workflow artifacts.

## Plan

1. Commit reviewed M1-01–03 foundation and tracking decision.
2. Dispatch three SOL high implementation agents in isolated worktrees; agree shell extension points.
3. Integrate and review each owned diff. Resolve cross-subsystem failures without weakening guards.
4. Run root checks, production builds, real API acceptance and browser workflow at required widths. Capture screenshots/video and source diffs with tested source identity.
5. Update PRD acceptance, architecture/user guides, local review/handoff, status and operations log; commit integrated work. User visual review remains explicit.

## Progress

- 2026-09-14: Step 1 complete, `29cac07` (88 files). Docs, harness and whitespace checks passed before commit; previous session's foundation test/build/live-browser evidence is linked from its handoff.
- 2026-09-14: M1-04 agent dispatched on `codex/m1-04-canvas`; M1-05 on `codex/m1-05-inspector`; M1-06 on `codex/m1-06-history`. All based on `29cac07`. Existing SOL high agent slots were reused for M1-05/06 because the thread limit prevented more new agents.
- 2026-09-14: Coordinator preparing integrated browser evidence and root verification wiring. No new UI acceptance is claimed yet.

- 2026-09-14: Inspector checkpoint `d02b82d` integrated as `896fe06`; focused agent lint/typecheck and four tests passed. Full integrated UI validation is still pending.

## Surprises & Discoveries

- The existing source/session APIs were complete, but the root page deliberately remained a bootstrap screen. M1-04 is the first usable app shell, not a later optional polish step.
- Preview worker integration is supplied in memory and receives no session data initially. The canvas owner is designing an exact-origin parent handshake with server-model reconciliation; capabilities must stay out of URLs and clean site output.

## Decision Log

- 2026-09-14: Parallelize isolated inspector controls and history persistence behind an agreed canvas interface; completion still requires integrated real browser proof.
- 2026-09-14: Preserve null tracker/review integrations. Local PRDs, plans, handoffs and this decision log are the task record.
- 2026-09-14: Coordinator owns shared root scripts/CI/lockfile and final integration to prevent competing changes.

- 2026-09-14: Add optional bounded history metadata and selection computed-style display fields to the existing protocol. Computed browser styles never grant write authority. The history owner coordinates these shared schema changes.
- 2026-09-14: Pass the configured app origin through the runner worker into the development integration; do not trust arbitrary parent origins or infer trust from referrers.
- 2026-09-14: Pin Playwright 1.63.0 for the requested deterministic browser suite and video evidence. The coordinator owns browser/tooling changes.

## Validation

- Foundation commit preparation: `npm run verify:docs`, `npm run verify:harness`, `git diff --check` passed.
- Isolated production app/runner test-runtime start and cleanup passed; Chromium installed for browser acceptance. This is test infrastructure evidence only.
- Integrated `npm run verify`: passed with 63 tests at the first full review checkpoint (9 contracts, 5 engine, 14 runner, 23 web, 2 integration, 10 root). Follow-up recovery and Back guard tests are being added; this is not the final total.
- `npm run build`: production Next application, package builds and both ordinary Astro routes passed.
- `npm run verify:local`: real authenticated app-to-runner lifecycle, source write, duplicate/stale checks, restart/reconciliation and isolation passed.
- First complete expanded `verify:editor` passed against source fingerprint `17396001f7fc` (prefix; full digest in the result artifact): both project cards, stopped-preview retry, four widths, exact outline geometry, base/mobile/reset/token edits, undo/redo, reload/restart, draft dialog keyboard checks, read-only targets, Interact navigation/Escape, lost Apply response with failed preview, stale apply/undo, independent edited build and zero browser exceptions. Final rerun follows the new reload and Back recovery fixes.

- 2026-09-14 integration review fixes: deterministic preference hydration; same-preview navigation referrer; reload iframe only after the current session revision is confirmed; guard browser Back including repeated reloads; treat all post-dispatch 5xx responses as uncertain; preserve original logical operation metadata across reload for authorized reconciliation. User-requested visual review remains separate.

## Outcomes & Retrospective

M1-04–06 are integrated and locally reviewed. The expanded final browser proof passed on 2026-09-14 against source fingerprint prefix `197261adfe7c`: 13 screenshots, a workflow video, exact source changes/receipts and zero browser exceptions. It includes repaired compilation, browser Back, invalid input, duplicate Apply, and Apply/Undo uncertainty across reload. The edited site built and served after stopping Stellar. The [review](../../handoffs/m1-editor-review.md) maps criteria to browser and lower-level evidence.

The root now opens the actual Projects dashboard and Studio. User visual review remains open; broader CMS/IA, company-site onboarding, hosted isolation, agents and deployment remain later work. All work is committed locally on the existing integration branch; no external status or remote CI is claimed. The initial bootstrap screenshot is superseded by the working app available through the local launcher.

Final observed browser timings: 9.017 seconds from isolated service startup through project B recovery and opening A; four Apply-to-preview-handshake measurements were 223–241 ms. These are fixture observations, not performance guarantees or independent CSS-load timings. Rendered computed values were asserted separately.

Final root verification passed 72 tests (9 contracts, 5 engine, 14 runner, 32 web, 2 Astro integration, 10 root), strict harness/docs/lint/typechecks and source mapping. Production builds and authenticated local API acceptance passed. Final docs/whitespace checks passed after closeout updates.
