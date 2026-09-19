# Proposal review foundation

This preparatory slice sits alongside [platform identity and project state](platform-foundation.md). It preserves the [Letta runtime gates](../prds/e01-letta-command-proof.md). No provider runs, source application or paid operations are enabled.

## Review boundary

The existing `PrepareChange` and `ChangeProposal` describe the supported GUI token/style command and prepared source patch. A proposal review record binds these exact values to the initiating identity namespace/subject, platform tenant/project, base revision, expiry and bounded provenance. The digest covers the immutable review content. A platform project ID does not itself prove a runner mapping.

Authenticated project queries and review mutations re-read current Stellar grants using the E01 authorization helpers. Read access does not imply review access. Review decisions are application metadata, never a runner receipt or a capability to write source. A future application path must authenticate the runner, establish exact project mapping, prepare/revalidate source and current grants, then use existing guarded command/history reconciliation. A browser-supplied expected revision only identifies what was reviewed; it cannot attest current source state.

## Disabled ingestion and execution

Public submission checks editor access and refuses with `RUNNER_DISCONNECTED`. No public or internal synthetic seeding mutation is deployed. Offline tests construct records in convex-test. The opt-in development browser harness uses isolated synthetic browser storage and labels the proposal, patch and persistence as synthetic. It is unavailable in production. Production projects are never silently populated with examples.

## Evidence boundaries

Offline Convex tests exercise application functions, authorization and record recovery. They do not establish deployed persistence, production concurrency guarantees, real WorkOS revocation or runner connectivity. Browser harness screenshots demonstrate the review interface with synthetic data. Existing `verify:local` separately verifies real local source/history behavior using temporary fixture copies; it is not hosted proposal application acceptance.

## Durable records and bounded recovery

| Record | Purpose |
| --- | --- |
| `proposalJobs` | Initiating actor and namespace, project/tenant, request ID, command digest, base revision, expiry, adapter provenance and review state |
| `proposals` | Immutable canonical prepare payload and source proposal, sealed digest and job association |
| `proposalDecisions` | Append-only reviewer, request ID, action, exact digest/revision and decision time |
| `auditEvents` | Successful approval/rejection/cancellation events in the same mutation |

At most two decisions belong to one proposal: an initial approval followed by cancellation, or a single rejection/cancellation. An exact replay returns current state and bounded decision history without adding another decision or audit event. Conflicting reuse of a request ID is refused. A new approval attempt against an already approved record is a conflict. Current access, payload integrity and reviewed bindings are checked before replay recovery. Expiry prevents a new approval; it does not erase an earlier recorded decision.

Listings use project indexes and pages of at most 20. The source command JSON is bounded to 4,096 characters, the prepared proposal to 32,768, and the lifetime to 24 hours. These limits constrain this review slice rather than promising unlimited retained jobs. There is no automatic provider retry or source replay.

Browser session storage retains only the pending review intent under tenant/actor/project scope. Reload reads authorized records and matches action, request ID, reviewer, digest and revision against decision history before clearing the pending request. A lost approval response followed by cancellation is recovered as an earlier approval with current cancelled state. Explicitly discarding unresolved browser intent does not delete application records.
