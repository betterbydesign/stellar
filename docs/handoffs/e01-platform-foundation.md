# E01 platform source-slice handoff

Branch: `codex/independent-platform-foundation`. Baseline: kickoff commit eac9459, fast-forwarded in the isolated task worktree from stale main. No main/saved-checkout sync, push, shared merge, provider deployment or paid operation was performed.

Implementation commit: `a1006f9`. The worktree was clean after that source/evidence commit; the subsequent documentation closeout adds this checkpoint only. Temporary browser and preview servers were stopped.

## Delivered

- Standalone WorkOS AuthKit sign-in/callback/session/sign-out wiring and fail-closed mode/configuration.
- Convex tenant/project membership, bounded project listing, idempotent named metadata creation/reopen, append-only application audit, internal organization provisioning and current-grant authorization.
- Thin account project UI with persisted request recovery, explicit unresolved-request discard and honest disconnected Studio state.
- Existing local operator/source/history behavior preserved and verified with temporary copies.
- [Architecture](../architecture/platform-foundation.md), [PRD](../prds/e01-platform-foundation.md), [setup guide](../user-guide/platform-projects.md), [verification](../evidence/e01-platform/verification.md) and [review record](../evidence/e01-platform/review.md).
- Gated drafts for [Letta same-command proposal/review](../prds/e01-letta-command-proof.md) and [OpenRouter draft assets](../prds/e13-openrouter-draft-generation.md).

## Validation

`npm run verify` passed 143 tests plus lint/typechecks/docs/harness/fixture checks. `npm run build` passed packages, Next and independent Astro. `npm run verify:local` passed two-source-copy isolation, real source edit and durable recovery with unchanged seed. Browser setup-screen evidence is at `output/playwright/e01-platform`; provider behavior was not fabricated. SOL high implementation and independent review were used; final follow-up hit account limits and root completed targeted fixes/checks.

## Remaining prerequisites

1. Configure a Stellar-owned WorkOS development application and Convex deployment using secure local/provider configuration, not chat. See exact environment names and URLs in the setup guide. Current branch has no configured account. Do not import another product's credentials or raw tenant records.
2. Obtain authorization for development Convex deployment/provisioning. Set its matching WorkOS client ID, regenerate offline-compatible `_generated` helpers with Convex codegen and deploy/test the schema/functions. Current tests use convex-test, not a live database.
3. Run real sign-in/logout/expiry, durable create/reopen, two-tenant and same-tenant project isolation, organization setup/grants, revocation and provider outage/reconnect. Record browser UI acceptance with real accounts. WorkOS organization changes are not yet synchronized; revoke Stellar grants explicitly.
4. Review and implement a separate scoped runner connection before hosted preview or editing. The current refusal endpoint checks visibility then returns disconnected; it cannot authorize or send source commands. Registry linkage needs installation identity, exact project mapping, edit-level grants and durable allocation/reconciliation proof.
5. After foundation acceptance, review the gated agent/media PRDs and budgets. Integrate accepted editor correctness fixes through coordinated integration before any Letta source writes. No spending is enabled by this handoff.

## Parallel ownership

Platform touched provider dependencies/lock, new auth/Convex/platform files, entry routing and a local-config mode fence. No shared editor contracts, project manifest, runner dispatch, preview integration, editor-core or launcher lifecycle files changed. Stacki owns its BOM/CSS fixes and separate watcher-backlog follow-up. Company M2 remains independent. No Agent Hub proprietary implementation was copied; existing documented patterns were behavioral reference only.
