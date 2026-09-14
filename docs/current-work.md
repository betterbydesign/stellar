# Current Work

This is a compact pointer for work that needs a cross-session handoff. The current user request and any active ExecPlan hold detailed scope and acceptance criteria. Do not invent an external task ID while `tracker` is null in `../harness.json`.

## Active Work

| Work | Branch or worktree | Current agent | Status | Blocker | Next action | Updated |
|---|---|---|---|---|---|---|

Update a row at meaningful checkpoints and remove it when the work and handoff are complete. Record validation and decisions in the active ExecPlan when one exists.

## Latest completed work

The [repository bootstrap](exec-plans/completed/stellar-bootstrap.md) on `codex/stellar-bootstrap` established `apps/web`, the adapted development harness and local verification/CI. The research commit is `01d43eb`; the following bootstrap commit holds the foundation. Changes are local and have not been pushed.

The next proposed slice is a fixture project with a preview-runner boundary and one persistent token/prop edit on an Astro page. Follow [bootstrap sequencing](BOOTSTRAP-PLAN.md); the [company-site POC](POC-01-company-site.md) continues to seed WP/ACF outside Stellar. Neither slice is implemented by this bootstrap.
