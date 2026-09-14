# Current Work

This is a compact pointer for work that needs a cross-session handoff. The current user request and any active ExecPlan hold detailed scope and acceptance criteria. Do not invent an external task ID while `tracker` is null in `../harness.json`.

## Active Work

| Work | Branch or worktree | Current agent | Status | Blocker | Next action | Updated |
|---|---|---|---|---|---|---|

Update a row at meaningful checkpoints and remove it when the work and handoff are complete. Record validation and decisions in the active ExecPlan when one exists.

## Latest completed work

The initial local editor milestone is decomposed in the [M1 PRD index](prds/README.md), with the [planning record](exec-plans/completed/m1-prd-breakdown.md) on `codex/m1-editor-prds`. Six implementation PRDs cover contracts/fixture, runner, source engine, canvas/selection, inspector and history/recovery. M1-01 is the first implementation handoff; M1-02 and M1-03 can run in parallel only after its contract and fixture are integrated. The milestone implementation has not started.

The [repository bootstrap](exec-plans/completed/stellar-bootstrap.md) establishes `apps/web`, the adapted development harness and local verification/CI. On 2026-09-14 the user authorized integrating and publishing it on `main`, superseding the initial local-only scope. The repository's configured squash strategy combines the bootstrap into one main-branch commit. The original research commit `01d43eb` and foundation commit `76e58d5` remain on `codex/stellar-bootstrap` for provenance.

The next proposed slice is the [M1-01 contract and fixture](prds/m1-01-contracts-and-fixture.md), leading to persistent local CSS and token edits on an Astro page. Follow [bootstrap sequencing](BOOTSTRAP-PLAN.md); the [company-site POC](POC-01-company-site.md) continues to seed WP/ACF outside Stellar. M1 is a preparatory local editor proof, not completion of the parent product's broader Milestone A.
