# Proposal review foundation handoff

Branch: `codex/proposal-review-foundation`. Base: local `545ef9e`, fast-forwarded into this isolated task branch from bootstrap ancestry. No saved-checkout changes, main merge, push, deployment or other-worktree synchronization.

## Implemented behavior

- Typed jobs/proposals, strict reuse of the supported GUI prepare/source proposal contracts, canonical digests, initiating actor/namespace, tenant/project, source revision, expiry and bounded adapter provenance.
- Convex application records and current-grant authorization for project review queries, decisions and replay. Viewers read; editors decide. Approved intent can be withdrawn by cancellation. Exact request replay preserves one result and audit history; conflicting, altered, stale and expired requests fail closed.
- Account project review area with before/after patch, exact command, digest/revision/expiry, decision history, approval/reject/cancel controls and retained ambiguous-request recovery.
- Production submission authorizes then returns `RUNNER_DISCONNECTED`; no production fixture insertion or source apply endpoint exists. Provider execution and source application are disabled, maximum spend is zero.
- Explicitly synthetic development browser harness, isolated from account APIs and disabled in production.

See [architecture](../architecture/proposal-review.md), [PRD](../prds/e01-proposal-review-foundation.md), [ExecPlan](../exec-plans/e01-proposal-review-foundation.md), [user guide](../user-guide/proposal-review.md) and [independent review](../evidence/proposal-review/review.md).

## Evidence

Browser screenshots and video are in `output/playwright/proposal-review`; `result.json` records passing checks and zero account API calls. Run `npm run verify:proposals` to reproduce the development-only harness checks. Root verified production returns 404 even with the development opt-in enabled. Full verification and real local-source acceptance are recorded in [verification](../evidence/proposal-review/verification.md).

## Limitations and next gates

Review decisions are metadata, never permission to apply. The browser's expected revision identifies reviewed content; it cannot attest current runner source. No trusted proposal ingestion is exposed until authenticated runner preparation exists, so real project queues remain empty in this disconnected slice. Offline tests seed synthetic records directly in convex-test; browser storage is a separate synthetic UI demonstration. Neither proves deployed persistence.

The original task, **Finish Stellar provider setup and live acceptance** (`01a0ab5c-32a1-7cb2-8fc4-11ecc92c5f6c`), retains the unchanged [open prerequisite checklist](e01-platform-foundation.md): Stellar-owned WorkOS/Convex setup, separately authorized provisioning/codegen/deployment, real identity/persistence/revocation acceptance, scoped runner connection and separately approved agent/media budgets. The [Letta gates](../prds/e01-letta-command-proof.md) remain in force. Integrating applicable Stacki correctness fixes is a separate prerequisite before later source writes; this slice does not touch editor/preview or watcher scope.

Scott's review remains required before any further integration or live work. Local implementation commits are authorized for this task only.
