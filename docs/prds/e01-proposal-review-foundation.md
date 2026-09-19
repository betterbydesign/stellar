# Provider-independent proposal review

Status: authorized offline preparatory implementation. The live [Letta gates](e01-letta-command-proof.md) and [platform prerequisites](../handoffs/e01-platform-foundation.md) remain open.

## Outcome
Provide a project-scoped, durable proposal review record and usable review screen. A recorded approval is intent only, never permission to apply. Provider execution, source application and spending remain disabled with zero budget.

## Contract
Reuse the existing narrow PrepareChange command payload. Seal command, digest, source revision, expiry, verified initiating actor, tenant/project and bounded adapter provenance. Current membership and project grants govern every operation; viewers can read but cannot submit or decide. Review decisions bind the immutable proposal and reviewer. Reject and cancel never touch source. Application always refuses until a separately authenticated runner can revalidate current source, grants and exact command.

Production creation must fail closed without trusted runner preparation. No fixtures are inserted into real projects. An isolated development harness can exercise synthetic proposals and clearly labels all evidence. Backend functions and persistence semantics are verified offline, not represented as deployed Convex acceptance.

## Acceptance
Test cross-tenant and same-tenant wrong-project refusal, viewer and revoked access, altered payload/digest, stale revision, expiry, duplicate submission and decisions, conflicting retries, cancellation and reload recovery. Bound payloads, listing and idempotency. Show exact command and source context, decision state and disconnected application state. Preserve existing local source/history behavior.

## Exclusions
No provider calls, paid operations, remote transport, privileged file writer, general agent platform, billing engine, editor/preview changes or watcher work. Runtime provider provenance is a future adapter seam only.
