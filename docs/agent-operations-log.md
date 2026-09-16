# Agent Operations Log

Append concise entries for meaningful implementation sessions. Record the behavior changed, why, validation actually run, and remaining work. This log is durable history, not a duplicate of the current-work pointer.

## Session Log

### 2026-09-14 — M2 PRDs and offline content planning

Executed the next-agent kickoff in the isolated `a4d4/stellar` worktree on `codex/m2-content-contracts`, starting from `bb5a310`. Three SOL high subagents provided source/UX review, the standalone planner, company evidence audit and five dependent PRDs; the coordinator integrated root commands, CLI tests and documentation and reviewed the complete result. Created the six-PRD M2 sequence, [Decision 005](decisions/005-content-plan-and-company-poc.md), [architecture](architecture/content-import-planning.md), operator guide and [review handoff](handoffs/m2-01-review.md).

M2-01 now validates versioned offline mapping/source/target inputs and emits deterministic, ownership-aware intent with schema/mapping/target binding, durable identities, dependency blockers and revisions. The synthetic fixture plans six creates and its replay test yields six no-ops. The legacy company audit verifies 71 source references across 16 tables/176 fields while deliberately reporting eight blockers; it performs no source/target writes and cannot accept fake approval flags. M2-02–06 remain proposed.

Review fixed view-scope back-links, WP-owned dependency traversal, target/type and hash binding, collisions, draft and non-draftable boundaries, batch assignment identities, unordered media comparison, blocked dependency propagation and retained conflicting-field details. Full root verification passed 103 tests plus docs/harness/lint/typechecks/fixture checks; production packages/Next/Astro builds passed. The guide-index hash was refreshed only after inspecting its intentional addition. Existing localhost runner tests required a permissioned rerun after sandbox listener denial; no tests or locks were disabled. CLI process checks and actual report capture passed; no new app UI or browser evidence is claimed.

Read-only company checkout inspection matched the recorded scaffolds; no remote/runtime refresh or company repository modification occurred. Evidence includes exact M2 source fingerprints and deterministic JSON reports. Work is prepared for local commit under the continuing authorization. No external tracker, Macroscope, live WP/Airtable data, push, merge or deployment changed. Next: M2-02 concrete company schema/ownership proposal and runtime inputs.

### 2026-09-14 — M1-02 runner and required M1-03 source engine

Three SOL high agents implemented isolated runner, authenticated web broker and pure source-engine packages. The coordinator integrated them over the preserved uncommitted M1-01 prerequisite, wired both locks and real runtime acceptance into the root/CI commands, and reviewed parser ownership, inverse guards, process lifecycle, exact origin validation, source isolation, stale edits, journal recovery and competing writes.

Clean installs, all 41 tests, lint, typechecks and production app/fixture builds passed. The real authenticated app-to-runner acceptance test passed for two Astro copies, a one-file engine edit, idempotency, stale rejection, restart and receipt reconciliation. Browser inspection confirmed launcher connection, retained session after reload and real Home/Contact rendering. Review fixed a NextURL loopback normalization mismatch, a startup error-state race, interrupted-operation/session recovery and process/data-lease ownership. Updated architecture, setup guide, PRDs and reviewed handoff record downstream seams and trusted-local limits. Changes remain local and uncommitted on `codex/m1-02-project-runner`; no company repo, remote CI, external task, push, PR or deployment changed. M1-04 canvas and source-linked selection is next.

### 2026-09-14 — M1-01 contracts, fixture and parent review

Two SOL high agents implemented `packages/contracts` and the original standalone Astro fixture in isolated worktrees. The coordinator reviewed and integrated both, added independent manifest/source validation, and updated root workspace, separate fixture installation and CI commands. Review fixes bind receipts to their operation, expose complete token controls, and bind proposal file/impact to the exact selected declaration.

Clean root and fixture installs passed, including an isolated fixture build outside Stellar. Full root verification passed with 19 tests; contracts, Next.js and both Astro routes built successfully. Both routes were reviewed at 390/768/1024/1440 without overflow, the explicit mobile override behaved as expected, and ordinary output contained no editor scripts/markers. Updated architecture and reviewed handoff documents describe remaining runtime obligations. User-guide sweep found no newly shipped editor interaction. Work is local and uncommitted on `codex/m1-01-contracts-fixture`; no push, PR, deployment or company repository change occurred. M1-02 and M1-03 are the next handoffs after integration.

### 2026-09-14 — Initial local editor PRDs

Created six local implementation PRDs and a dependency/dispatch index for the first source-backed browser editor proof. Followed the harness PRD template and ExecPlan lifecycle, assigned bounded agent ownership and required real preview/source/reopen evidence. M1 starts with a registered trusted Astro fixture and prepares for the parent product's broader company-site milestone; it does not replace the WP/ACF POC or claim hosted/HTML support.

SOL high source and cross-PRD review informed the boundary between pure patch preparation, runner writes and browser selection. Resolved shared definitions for token targets/aliases, authored reset fallback and revision/idempotency/reconnect behavior. Template coverage, all-document checks and strict harness verification passed; no app code, dependency, company repository or external task changed. The [M1 index](prds/README.md) points to the first implementation handoff. This session created local planning files without committing or publishing them.

### 2026-09-14 — Integrate the bootstrap into main

The user authorized merging and publishing the completed bootstrap to `main`. The fetched remote main had no intervening changes, and the bootstrap worktree was clean. Applied the configured squash strategy and retained the original bootstrap branch and its two commits for provenance. This authorization supersedes the earlier session's local-only boundary; it does not add site deployment or company-repository changes. The application is unchanged from the validated bootstrap; only the current-work pointer and this integration record changed during merge preparation.

### 2026-09-14 — Repository bootstrap

Preserved the research, mockups and selected preview evidence in commit `01d43eb`. Verified and separated the original Stacki source into an adjacent pinned reference checkout while retaining Git ancestry and its MIT notice. Added a minimal Next.js web workspace, root npm commands, local CI definition and a documented adaptation of the supplied Altitude agent harness. Source links now resolve to relative project documents or pinned upstream source instead of one machine's paths.

Clean installation, full verification and production build passed; four harness/scanner regression tests passed. Browser inspection verified the starter at desktop and mobile widths without overflow or browser warnings/errors. Independent SOL high review identified the scanner's source-link false positives and omission of untracked all-files candidates; both were fixed with regression coverage. User-guide sweep found no shipped interactive feature requiring a guide yet.

The company Astro and WordPress checkouts are unchanged. There was no push, PR, deployment, live content import or external task update. The next proof and remaining boundaries are in the [completed ExecPlan](exec-plans/completed/stellar-bootstrap.md).

## 2026-09-14 — Foundation commit and next editor wave

The user authorized committing all current M1-01–03 changes and launching SOL high subagents for M1-04, plus independent M1-05/06 work. The completed foundation already passed the recorded 41 tests, package/app/fixture builds, authenticated live acceptance and browser checks in the previous implementation session. The screenshot correctly shows the remaining bootstrap home page; M1-04 owns its replacement. Local tracking and scope are recorded in [Decision 003](decisions/003-local-m1-delivery-and-tracking.md). No ClickUp, Macroscope, remote CI, push, merge or deployment is claimed.

### 2026-09-14 — Complete the local Studio editor wave

Committed the preserved M1-01–03 foundation as `29cac07`. Three SOL high agents implemented M1-04 canvas, M1-05 style controls and M1-06 history in isolated worktrees; the coordinator integrated and reviewed their commits on `codex/m1-02-project-runner`. Projects replaces the bootstrap entry. Studio opens actual Astro copies, supports responsive source selection, local/base/mobile/reset/shared-token commands, and durable guarded undo/redo.

Integration review fixed preference hydration, same-preview navigation, revision refresh ordering, browser Back draft loss, 5xx uncertainty, missing-result retry identity, recovery across reload, fallback provenance and recovered receipt display. Decisions 003/004, subsystem guides, local PRD acceptance, completed plans and the [review handoff](handoffs/m1-editor-review.md) record the boundaries and evidence. ClickUp/Macroscope remain null; user visual review is ready and distinct from implementation review.

Final root verification passed 72 tests plus harness/docs/lint/typechecks/fixture checks. Production package/Next/Astro builds and the real authenticated API acceptance passed. The expanded browser proof passed with 13 screenshots, a video, exact source diffs/receipts and zero browser exceptions. It covered both copies, four widths, failed compilation/retry, geometry/keyboard/navigation, invalid input/duplicate Apply, base/mobile/reset/token writes, Undo/Redo, reload/restart, uncertain Apply/Undo recovery, retained save with failed preview, stale rejection and independent edited build after stopping Stellar. The coordinator inspected desktop/narrow screenshots.

All requested work is committed locally. No company checkout, external task, remote CI, push, PR, merge or deployment changed. The next product work follows user review of the local editor and the existing company WP/ACF POC; broader CMS, IA, hosted accounts, agents, HTML and structural composition remain explicit follow-ons.

### 2026-09-14 — Fix local launcher development lock conflict

The user reported `dev:local` refusing to start while naming the earlier web-only server on port 3000. Inspection confirmed that process still held the shared Next development lock. The Next configuration now selects `.next-local` only for the local-launcher development phase; web-only development and production retain `.next`. Normal locking stays enabled. Added ignored output and generated type paths, a phase-selection regression test, and startup troubleshooting guidance. The user-created Cursor indexing ignore file is included unchanged under the request to commit everything.

Web lint/typecheck and all 33 web tests passed. The actual root local launcher started successfully beside the existing port-3000 server; Chromium connected the operator, opened Projects/Studio, rendered Astro and selected an element with no browser exceptions. The production package/Next/Astro build passed. The test launcher shut down cleanly, freeing ports 3210 and 4310 without stopping the other server. Local authenticated production acceptance also passed. No saved project source, credentials, remote integration or deployment changed.

### 2026-09-14 — Prepare the next agent kickoff

Created [the next-agent handoff prompt](handoffs/next-agent-kickoff.md), grounded in completed M1 and the independent Airtable → WP/ACF → WPGraphQL → Astro POC. It preserves the current orchestrator configuration and SOL high subagent requirement, directs creation of the next local PRD wave and implementation of its first unblocked slice, and records verification, ownership and external-action boundaries. Docs and harness checks passed.

A remote ref check found main at `f12d3a5` with no remote implementation branch; cloud coding cannot assume the local editor is available there. The cloud task tool cannot pin the requested models. Destination/model choice is pending; no new task, push or deployment has been performed at this checkpoint.


## 2026-09-16 — Reviewed blueprint project creation

Implemented M1-07 in isolated `codex/reviewed-blueprint-projects`, based on local foundation e8eefbc. Added one pinned Astro blueprint, additive registry v2 migration, authenticated named creation with idempotent recovery, independent source/history and a responsive Projects catalog. SOL high agents implemented registry/contracts and UI; a separate SOL high reviewer found no remaining P0–P2 defects after fixes.

Validation: full verify passed (112 tests), final focused registry recovery 7/7, production build, real named-project browser proof and legacy local acceptance all passed. Evidence is in [the ExecPlan](exec-plans/m1-07-reviewed-blueprint-projects.md), `docs/evidence/m1-07` and `output/playwright/m1-projects`.

No commit, push, shared branch merge or deployment. The user's saved data/services were untouched. Preserve the originating task's launcher lifecycle fix separately; only disjoint imports/Runner-class versus startup/entrypoint sections overlap in `server.ts`.


### Local commit and sync authorization

The user authorized committing M1-07 and syncing it locally. The saved checkout's separate launcher lifecycle changes must be preserved as uncommitted work, including disjoint server and local-project guide edits. No remote push or deployment is included.


## 2026-09-16 — Parallel upstream and platform plans

Scheduled selective Stacki review immediately, in parallel with a WorkOS/Convex foundation task. Applicable editor correctness fixes precede the first write-enabled Letta proof; OpenRouter draft generation follows that controlled agent boundary. Company M2 remains separate. Added two ExecPlans and a coordination handoff with isolated ownership, verification, provider prerequisites and no automatic cross-task integration. Separate user-owned Codex tasks are requested for execution.

## 2026-09-16 — Selective upstream audit and source-preservation fixes

On isolated `codex/stacki-selective-upstream` from kickoff `eac9459`, audited Stacki `800fa52..fd2a38f` (60 commits, 397 files). Three SOL high agents handled upstream behavior, queue/preview comparison and independent review. Adapted generated property-testing methodology and implemented original Stellar BOM/byte-coordinate and standard CSS property ownership fixes; escaped identifiers conservatively refuse edits after a reviewed counterexample. No upstream code, dependencies, history or preview runtime was imported.

Full root verification, production build, authenticated local acceptance and dedicated browser save/preview/undo/redo/independent-build evidence passed. Editor package: 42 tests/subtests, with 128 generated edit cases. Independent re-review found no residual actionable defects. See [audit](research/stacki-selective-upstream-audit.md), [plan](exec-plans/stacki-selective-upstream-adoption.md), and [handoff](handoffs/stacki-upstream-first-batch.md).

The audit reproduced watcher backlog only under slow refresh conditions; ordinary editing passed. Coalescing is explicitly deferred to separately owned runner work, not labeled a platform prerequisite. Only a local work-branch commit is authorized; no saved data/services, default ports, main, shared checkout sync, push or deployment changed.
