# M2 planning and content import contracts

## Context

The user asked to execute [the next-agent kickoff](../../handoffs/next-agent-kickoff.md) with SOL high subagents on 2026-09-14. This task runs in the isolated `a4d4/stellar` worktree on `codex/m2-content-contracts`, starting at `bb5a310`. M1 is complete locally. ClickUp, Macroscope and deployment remain unconfigured in Stellar's harness.

## Goals

- Produce a dependency-ordered M2 PRD wave for the existing company WP/ACF and Astro POC.
- Implement and review the first useful unblocked slice: versioned content mapping validation and deterministic offline dry-run planning.
- Preserve the external Airtable-to-WP seed boundary, explicit schema approval and accurate completion claims.
- Commit the reviewed local result with verification and a next-task handoff.

## Non-Goals

Live content writes, publication, deployments, a new production CMS, Airtable-to-Astro loading, Agent Hub source reuse and new dashboard chrome are outside this task. The existing proposed company field paths are not approved ACF keys or evidence of a deployed schema.

## Scope

M2 PRDs and dispatch index; a separate content-import contract/planner package; synthetic offline fixtures; root workspace verification wiring; architecture, decision, operator and handoff records. No M1 source or company checkout edits are planned. Run applicable root docs/harness, lint, typecheck, tests and build checks; exercise the CLI with valid and blocked inputs.

## Plan

1. Inspect current evidence and company repository state using two independent SOL high research/review agents.
2. Freeze the M2-01 contract, acceptance criteria and file ownership; write the remaining dependent PRDs.
3. Delegate bounded package implementation while the coordinator owns root wiring, fixture/CLI integration and documentation.
4. Review failure modes and deterministic behavior, fix confirmed findings and run verification.
5. Record actual evidence and remaining inputs, then commit locally.

## Progress

- 2026-09-14: Read the harness intake, kickoff and existing POC/mapping evidence. Confirmed a clean detached checkout at `bb5a310`, created `codex/m2-content-contracts`, and started dependency installation.
- 2026-09-14: Dispatched SOL high agents `m2_contract_review` and `m2_ux_dependencies` with read-only, independent scopes. No source implementation is claimed yet.
- 2026-09-14: Frozen six M2 PRDs after independent review. `m2_import_engine` owns the standalone contract/planner package; the evidence reviewer implemented the company audit in two disjoint files; the UX reviewer drafted M2-02–06. Coordinator owns M2-01/index, commands, root wiring and documentation.
- 2026-09-14: Company audit implementation reviewed and hardened: the legacy format cannot become ready through injected approval flags, dynamic report paths cannot echo arbitrary keys, owner-table mismatches fail, and missing media/target evidence is explicit. Agent's 12 targeted tests passed; coordinator verification is still pending.
- 2026-09-14: Coordinator ran the audit's 12 tests and four CLI process tests successfully. The actual synthetic example produced six ordered creates with zero writes. Integration review found and requested fixes for root-view back-links, WP-owned dependency traversal, exact schema/mapping/target binding, duplicate identities, draft-only updates, multi-record taxonomy mapping reuse and unordered multi-media no-op comparison.
- 2026-09-14: Package frozen after fixes and 14 package tests. Independent review's final global-blocker propagation and retained conflict-detail findings were fixed with regressions. Full coordinator verification passed 103 tests and production package/Next/Astro builds. Captured deterministic reports/file fingerprints, completed acceptance and prepared the M2-02 handoff for local commit.

## Surprises & Discoveries

- The existing company mapping is deliberately `draft_not_executable`; it contains proposed logical paths, unresolved taxonomy definitions and a source schema snapshot, not an executable import manifest.
- The selected Airtable view contains one root page. Whole-table import or inverse-link recursion could silently import the excluded second page.
- Company checkouts are under the adjacent `altitude` directory and still match the recorded clean Astro/WP scaffold revisions. No remote or runtime refresh was performed.

## Decision Log

- 2026-09-14: Start with an offline planning contract so useful implementation does not depend on live credentials or invent approval of the company schema. A plan must distinguish proposed operations from any executed writes.
- 2026-09-14: Keep editor contracts separate from content planning. Freeze a minimum normalized schema format instead of pretending the research draft compiles arbitrary ACF composition. The company executor remains a later independently runnable asset in its own repository.

## Validation

- `npm ci` and `npm run fixture:install`: passed in the isolated worktree. `npm install --ignore-scripts` added the new workspace link/lock entry without introducing new dependency versions.
- `npm run verify:docs` and `npm run verify:harness`: passed at the PRD drafting checkpoint; repeat after final documents exist.
- `node --test test/company-content-map.test.mjs`: 12/12 passed in coordinator verification.
- `node --test test/content-plan-cli.test.mjs`: 4/4 passed in coordinator verification.
- Targeted script/test ESLint: passed after adding an explicit URL import in the CLI test.
- Actual `content:plan:example`: ready with six proposed creates and zero writes. Actual `content:audit:company`: expected blocked exit 2, eight blockers, no reference errors.
- Full `npm run verify`: passed 103 tests, docs/harness/lint/typechecks and fixture source validation. The initial guide-index drift was an intentional local guide link; after inspecting the one-file change, refreshed `harness-lock.json`. A sandboxed attempt then failed at existing runner localhost listeners; reran with server permission and all tests passed.
- `npm run build`: passed workspace packages, production Next app and independent Astro fixture.
- Verified two target posts can share one mapping-level taxonomy assignment ID; the previous incorrect global uniqueness check is removed.
- Final code review found no remaining confirmed in-scope defects. No new browser/UI evidence is needed for this offline-only slice; M1 historical visual evidence is not presented as fresh testing.

## Outcomes & Retrospective

M2-01 is implemented and reviewed; M2-02–06 are proposed and dependency-ordered. The [review handoff](../../handoffs/m2-01-review.md) and [evidence](../../evidence/m2-01/verification.json) record source fingerprints, acceptance and remaining inputs. The company draft remains blocked rather than being silently promoted. Next is M2-02's concrete schema and ownership-service proposal in the company WP repository. No live import, publication, company checkout mutation, remote task, push, merge or deployment occurred. Keep the portable format separate from both application runtime and actual execution authority.
