# First-use website experience

## Context

User requested a PRD, implementation and verified handoff for the broken account-to-Studio journey. Worktree `933d`, branch `codex/first-use-website`, fast-forwarded from old main to verified integrated baseline `c93c803`. See [PRD](../prds/first-use-website.md).

## Goals

Make prerequisites honest before creation; remove unnecessary personal setup; harden and measure the real local create/edit/reopen slice; preserve existing account and local data. Document and retain the complete joined journey as an open acceptance gate.

## Non-Goals

Managed hosting, AI/provider execution, deployment, automatic credential copying, merging main or modifying the saved checkout.

## Scope

Account dashboard/project onboarding, local creation recovery and performance instrumentation, browser acceptance, user guide and evidence. Existing guarded source writer and authorization fences remain authoritative.

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

First slice is ready for integration review. Full signed-in creation/editing remains gated on implementation and validation of authenticated installation pairing; configuration alone cannot complete that feature. No false completion or source-link claim is made. Continue with PRD milestone 3, then live acceptance; retain Test unchanged until an authorized reconciled setup operation can bind it. See [handoff](../handoffs/first-use-website.md).
