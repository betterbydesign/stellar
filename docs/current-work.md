# Current Work

This is a compact pointer for work that needs a cross-session handoff. The current user request and any active ExecPlan hold detailed scope and acceptance criteria. Do not invent an external task ID while `tracker` is null in `../harness.json`.

## Active Work

No implementation is currently running. The M1 local editor is ready for user visual review; no external tracker or review service is connected.

## Latest completed work

Local startup follow-up (2026-09-14): the authenticated launcher now uses a separate Next development cache, avoiding the web-only server lock conflict. Actual concurrent startup, browser connection/preview/selection, 33 web tests and production build passed. See [startup troubleshooting](user-guide/local-projects.md#development-server-conflicts).

[M1-04 through M1-06](handoffs/m1-editor-review.md) are implemented, integrated and reviewed on `codex/m1-02-project-runner`. Three SOL high agents built canvas, inspector and history in isolated worktrees; the coordinator completed integration, recovery review, production builds and the real browser proof. The [completed plan](exec-plans/completed/m1-04-through-m1-06.md), [M1 PRD index](prds/README.md), [decisions](decisions/004-studio-source-and-recovery-boundaries.md) and evidence record the result. Foundation commit: `29cac07`; integration and evidence commits follow on the same branch.

The root opens Projects. Start the complete app with `npm run dev:local` from the repository root and use the one-time connection link. Studio now supports source-linked selection, responsive widths, supported local/token edits, reset and durable undo/redo. The broader CMS/IA/client portal remains follow-on work after the local workflow review and company WP/ACF POC planning.

The [repository bootstrap](exec-plans/completed/stellar-bootstrap.md) establishes `apps/web`, the adapted development harness and local verification/CI. On 2026-09-14 the user authorized integrating and publishing it on `main`, superseding the initial local-only scope. The repository's configured squash strategy combines the bootstrap into one main-branch commit. The original research commit `01d43eb` and foundation commit `76e58d5` remain on `codex/stellar-bootstrap` for provenance.

The next product slice follows review of the local editor and integration planning for the company WP/ACF POC. Follow [bootstrap sequencing](BOOTSTRAP-PLAN.md); the [company-site POC](POC-01-company-site.md) continues to seed WP/ACF outside Stellar. M1 is a preparatory local editor proof, not completion of the parent product's broader Milestone A.
