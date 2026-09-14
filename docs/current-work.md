# Current Work

This is a compact pointer for work that needs a cross-session handoff. The current user request and any active ExecPlan hold detailed scope and acceptance criteria. Do not invent an external task ID while `tracker` is null in `../harness.json`.

## Active Work

| Work | Branch or worktree | Current agent | Status | Blocker | Next action | Updated |
|---|---|---|---|---|---|---|

Update a row at meaningful checkpoints and remove it when the work and handoff are complete. Record validation and decisions in the active ExecPlan when one exists.

## Latest completed work

The [repository bootstrap](exec-plans/completed/stellar-bootstrap.md) establishes `apps/web`, the adapted development harness and local verification/CI. On 2026-09-14 the user authorized integrating and publishing it on `main`, superseding the initial local-only scope. The repository's configured squash strategy combines the bootstrap into one main-branch commit. The original research commit `01d43eb` and foundation commit `76e58d5` remain on `codex/stellar-bootstrap` for provenance.

The next proposed slice is a fixture project with a preview-runner boundary and one persistent token/prop edit on an Astro page. Follow [bootstrap sequencing](BOOTSTRAP-PLAN.md); the [company-site POC](POC-01-company-site.md) continues to seed WP/ACF outside Stellar. Neither slice is implemented by this bootstrap.
