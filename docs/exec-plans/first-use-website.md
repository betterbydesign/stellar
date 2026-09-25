# First-use website experience

## Context

User requested a PRD, implementation and verified handoff for the broken account-to-Studio journey. Worktree `933d`, branch `codex/first-use-website`, fast-forwarded from old main to verified integrated baseline `c93c803`. See [PRD](../prds/first-use-website.md).

## Goals

Make prerequisites honest before creation; remove unnecessary personal setup; harden and measure the real local create/edit/reopen slice; preserve existing account and local data. Implement the complete joined journey on the same computer, prove it with real source, and retain live-provider acceptance as an explicit gate.

## Non-Goals

Managed hosting, AI/provider execution, deployment, automatic credential copying, merging main or modifying the saved checkout.

## Scope

Account dashboard/project onboarding, runner connection and binding, Convex pairing/provisioning, authenticated connected web adapter, Studio integration, recovery/performance instrumentation, browser acceptance, user guide and evidence. Existing guarded source writer and authorization fences remain authoritative.

## Plan

1. Audit account creation, grants and local registry/Studio recovery.
2. Record product and pairing decisions before implementation.
3. Implement automatic personal setup, prerequisite-first account UI and existing-record recovery.
4. Harden local pending intent and record creation/save preview timings.
5. Run root verification/build and real local/editor/projects acceptance using disposable directories and ports.
6. Commit verified scope, push task branch if available, hand off exact limitations and next work.

## Progress

- 2026-09-24: Read complete harness intake, verified clean detached old-main checkout and ancestry, created branch and fast-forwarded to c93c803. No saved-checkout files or credentials copied.
- Audited account creation: atomic metadata/grant/receipt, source always unlinked, runner always refuses after access check. Personal bootstrap already refuses revoked grants. Local registry has staged durable allocation and replay; browser pending form can accidentally discard an unresolved request by editing its name. Existing browser acceptance already covers lost response and restart.
- PRD written before implementation; pinned root and fixture dependencies installed.
- First slice implemented: automatic personal bootstrap; prerequisite-first account dashboard; retained metadata and recovery receipts; hidden empty proposals; durable locked local creation and latency measures.
- 207-test aggregate verification and production build passed. Real local/editor/projects browser suites and synthetic proposal regression passed. Final storage-retry refinement passed fresh build/lint/types and affected browser acceptance.
- Implementation committed as `fa132dc`. Push rejected by automatic approval review because the configured GitHub destination was not verified as trusted for repository egress; no remote update occurred.
- Evidence and handoff recorded. Full pairing milestone remains explicitly open; no main/saved-checkout synchronization or deployment.

## Surprises & Discoveries

The missing account connection is an absent authenticated transport, not a disabled feature flag. Enabling the local broker in platform mode would bypass security. Existing local browser flow is already end-to-end for source; account linkage needs its own reviewed protocol and live acceptance.

## Decision Log

- 2026-09-24: Keep platform-mode local broker fence closed. First slice makes the prerequisite explicit and improves the real local workflow. Do not pretend pairing is supplied by copy changes.
- Choose local computer execution first; defer managed hosting. Preserve Test and legacy receipts; no name-based attachment.

## Validation

See [verification record](../evidence/first-use-website/verification.md) for exact passing commands, test counts, screenshots and sample timings. Initial sandbox port failures and browser lint issues were resolved. Fresh final project browser proof includes blocked storage during an already-sent request; no duplicate source, seed changes or browser errors. Account tests are offline.

## Outcomes & Retrospective

The initial prerequisite slice was followed by the requested connected-computer implementation. Account pairing and reconciled creation/editing/reopen are implemented and covered by real-source offline acceptance. Live WorkOS/Convex sign-in and persistent-provider acceptance remain separate. Existing Test can be finished on its original ID after configuring the connected development environment. See [handoff](../handoffs/first-use-website.md).

## Connected-computer implementation continuation

User explicitly requested implementation with agents. The first slice was subsequently pushed after destination approval. Continue on the same isolated branch with SOL/high agents in disjoint paths: runner installation/binding and launcher; Convex account/provisioning proofs; connection/website UI following an initial security review. Root owns authenticated web adapter, Studio integration, docs and integrated verification.

First supported environment is an account-enabled server running on the user's computer, with an independently configured loopback runner. `/api/projects` retains the original local-only fence. A separate `/api/connected` path requires verified account identity/current grants, local operator possession and account-scoped CSRF; its project-only dispatch uses an exact immutable backend and runner binding. Public source IDs are not authorization. Account project IDs remain URLs; guarded editor protocol retains its original registry IDs and digest semantics. A dedicated server/Convex attestation secret verifies runner allocation results; no provider token reaches the runner or preview. No remote relay or production hosting is introduced.

Handshake, exact binding, signed provisioning, setup/create/finish/reopen UI, current-grant enforcement and real-source browser proof are implemented. Review identified and fixed connection rotation across actors, cached account CSRF, first-use bootstrap ordering, expired offers, reconnect state, account Studio return links and ambiguous runner persistence. Full verification passed 227 tests; production build and real local/editor/projects acceptance plus synthetic proposal regression passed. Final connected browser proof also passes with accurate global stylesheet handling, and independent review found no remaining release-blocking defect. Live identity acceptance still needs securely configured Stellar services and user sign-in; test identities remain labeled offline evidence.


## Connected continuation delivery status

Implementation and verification are complete in local commit `3601a78`. Publishing to the previously approved `betterbydesign/stellar` task branch was rejected by automatic approval review. A bounded authorization check retrieved the earlier explicit branch-push question and user's approval from this task, but the reviewer still rejected the new payload and required fresh destination-specific authorization. No workaround was attempted and no remote update occurred. Local worktree/handoff are preserved; only publication is blocked.
