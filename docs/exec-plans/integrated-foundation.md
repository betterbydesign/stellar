# Integrated local and platform foundation

## Context

On 2026-09-24 the user authorized integrating completed editor, identity/project and proposal-review branches, preserving and incorporating saved-checkout runner lifecycle work, verification, commit, local synchronization and push. Integration runs on `codex/integrated-foundation` in the b63d worktree. The saved checkout starts at `eac9459` with eight lifecycle files backed up separately before work.

## Goals

Combine `e5a4ba4` (source preservation), `545ef9e` (platform) and `7a231b3` (proposal review, which includes platform), plus the preserved lifecycle work. Verify the combined app and synchronize the saved checkout without losing changes.

## Non-Goals

Provider provisioning/deployment, live WorkOS/Convex acceptance, authenticated runner pairing, Letta execution, OpenRouter spending and company M2 implementation remain deferred. Main is not changed by this integration branch.

## Scope

Completed branch changes, runner lifecycle files, conflict resolution, integration evidence and current-work pointers. Fresh platform and lifecycle review; full root verification/build, local runner, editor, projects and synthetic proposal browser acceptance.

## Plan

1. Back up saved lifecycle files, integrate branches in the isolated worktree and resolve documentation conflicts.
2. Review final platform authorization and lifecycle behavior; fix confirmed defects.
3. Run combined checks and browser acceptance, recording actual results.
4. Commit the reviewed result; safely synchronize the saved checkout and push the integration branch.

## Progress

- 2026-09-24: Created integration branch, fast-forwarded proposal/platform ancestry and started upstream merge. Preserved all eight lifecycle files plus a binary patch in `/tmp/stellar-integration-lifecycle-backup` and `/tmp/stellar-integration-lifecycle.patch`. Applied them to the integration worktree; saved checkout remains untouched.

- 2026-09-24: Full verification passed 202 tests and production build; follow-up web verification after a review fix passed 80 tests (59 CJS + 21 Convex). Real editor, projects, source-preservation, local runner and synthetic proposal browser checks passed. Launcher graceful/forced termination and restart proof passed.

- 2026-09-24: Committed integration as `7dbc7d3`, synchronized the saved checkout through a scoped safety stash, verified all original lifecycle bytes and a clean checkout, and synchronized offline dependencies. Final documentation closeout is shared by both worktrees before the authorized branch push.

## Surprises & Discoveries

Proposal review already contains the platform branch, so no duplicate cherry-picks are necessary. Only the operations log conflicted; both historical entries were retained.

## Decision Log

- 2026-09-24: Preserve branch ancestry in this integration branch and retain main for a separately reviewed integration decision. Include the authorized lifecycle work only after combined verification.

## Validation

Combined verification/build and all browser/launcher acceptance checks passed. Fresh platform review found one pending-decision binding issue; fixed with negative regressions and independently re-reviewed. See [verification](../evidence/integrated-foundation/verification.md) and [review](../evidence/integrated-foundation/review.md).

## Outcomes & Retrospective

Implementation and validation complete. Integration commit `7dbc7d3` combines both branch histories; the saved checkout was safely fast-forwarded with all eight original lifecycle files verified byte-for-byte, and dependencies synchronized without lockfile changes. Delivery uses `codex/integrated-foundation`; main is unchanged. Live provider and hosted runner prerequisites remain open.
