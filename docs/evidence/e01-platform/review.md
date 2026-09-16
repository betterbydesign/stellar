# E01 independent review record

Date: 2026-09-16. Reviewer: bounded SOL high agent, separate from implementation agents. Root integrated and verified fixes. Agent review does not substitute for the user's live/product review.

## Confirmed findings and disposition

| Finding | Fix and evidence |
| --- | --- |
| Personal/organization identity needed a provider application namespace | Added WorkOS client ID namespace to tenant/grant/request lookup and exact allowed issuer checks. Convex auth config verifies documented issuer/audience forms. Offline identity tests pass; real JWT proof remains pending. |
| Retried create returned a project after its grant was revoked | Existing receipt branch now checks current project access before returning. Direct function test revokes the editor's project grant and retries the original request. |
| Direct Convex callers could choose an unbounded page size | Public function now validates integer page size 1–50 and rejects caller read-budget overrides. Direct negative pagination tests pass. |
| Entry pages duplicated mode parsing and disagreed on whitespace | Entry pages and local broker configuration use one exact-value parser; invalid/unknown/mixed values fail closed. Runtime mode pages are dynamic. |
| Unresolved creation had no explicit resolution | Original request remains retained; explicit discard clears only actor/tenant intent after a reconciliation warning. Scoped clear helper test passes. |
| Same-tenant wrong-project test was missing | Root added a viewer granted project A who cannot read/command/promote access to B. Listing exposes only A. |
| Unconfigured AuthKit provider could issue focus/session checks | Identity agent inspected installed SDK and disables expiry listeners when unavailable; verified auth data never sends accessToken into client props. |
| Unexpected auth failure was reported as ordinary logout | Web API now uses generic 503 for thrown auth-service failures, retaining 401 for a normal absent session. Client shows safe retry messaging. |

## Scope and limits

Independent reviewers examined authorization, project enumeration, revocation/idempotency, mode isolation, SDK session/proxy behavior, browser Origin checks and recovery. They ran focused checks during implementation. Final follow-up SOL turns hit the account usage limit; root finished the last targeted test, reviewed the resulting changes and ran the full verification/build/local acceptance. This is not a claim of a fresh final independent approval.

The real-provider pass remains required: WorkOS JWT validity/expiry/refresh, Convex deploy/codegen/persistence, two real tenants and revocation/outage recovery. The reserved registry reference has no public setter and is not a runner connection. No remote source write path exists in this slice.
