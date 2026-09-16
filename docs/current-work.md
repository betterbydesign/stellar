# Current Work

Compact handoff pointer. No external task IDs are registered while `tracker` is null in `../harness.json`.

## Active Work

M1-07 reviewed blueprint projects is complete locally and awaiting integration review in `codex/reviewed-blueprint-projects`. See [the active ExecPlan](exec-plans/m1-07-reviewed-blueprint-projects.md) and [PRD](prds/m1-07-reviewed-blueprint-projects.md). Registry/contracts and UI passed independent SOL review, full verification/build, named-project browser acceptance and legacy local acceptance. Local commit and saved-checkout synchronization are authorized. Launcher lifecycle changes belong to the originating task.


No implementation is running. Next: [M2-02 — WordPress model and ownership](prds/m2-02-wordpress-model-and-ownership.md), beginning with a concrete company schema proposal and verification of repository/runtime inputs. The [M2 dispatch index](prds/m2.md) records dependencies and repository ownership. Live schema/import/publication/deployment remains unperformed; prepare the reviewable result before requesting any missing authorization. No Agent Hub access is needed for this step.

## Latest completed work

[M2-01](handoffs/m2-01-review.md), on `codex/m2-content-contracts`: portable offline content contracts/planner, synthetic fixture, command-line review and a blocked company evidence audit. Three SOL high subagents contributed package implementation, source audit, PRDs and independent review; the orchestrator integrated and reviewed the result. Full root verification passed 103 tests plus docs/harness/lint/typechecks/fixture checks; production packages/Next/Astro builds passed. See the [completed plan](exec-plans/completed/m2-content-contracts.md), [decision](decisions/005-content-plan-and-company-poc.md), [architecture](architecture/content-import-planning.md) and [operator guide](user-guide/content-planning.md). M2-02–06 are proposed, not implemented.

The company audit confirms 71 source references across 16 tables/176 fields and keeps the research format non-executable. Actual ACF keys/schema, taxonomy, record values, media evidence and target inventory are missing. No company checkout, live data, remote integration, push, merge or deployment changed.

[M1](handoffs/m1-editor-review.md) remains the usable local Projects/Studio foundation. Start from the repository root with `npm run dev:local` and use the launcher's connection link. Source-linked selection, responsive widths, supported CSS/token edits, reset and durable undo/redo work on registered Astro fixtures. The local launcher uses `.next-local`; web-only development and production use `.next`. M1 user visual review is separate from this CLI-only M2 slice. General CMS/IA, hosted accounts, agents, HTML and deployment UI remain follow-on product work.
