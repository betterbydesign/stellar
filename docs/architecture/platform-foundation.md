# Platform identity and project state

The [E01 PRD](../prds/e01-platform-foundation.md) and [authorization decision](../decisions/006-independent-platform-authorization.md) define the boundary. Implementation lives in `apps/web/lib/platform`, `apps/web/app/platform`, `apps/web/app/auth`, `apps/web/proxy.ts` and `apps/web/convex`. This source slice has no remote runner transport and is not acceptance of E01's full authenticated-preview milestone.

## Data ownership

| Table | Purpose | Principal indexes |
| --- | --- | --- |
| tenants | Personal or organization workspace, WorkOS application namespace | namespace + personal subject; namespace + WorkOS organization |
| tenantMemberships | Current active/revoked tenant role | tenant + namespace + subject; tenant + role + state |
| projects | Named project metadata; unlinked source state | tenant |
| projectMemberships | Active/revoked project reader/editor grant | project + namespace + subject; tenant + namespace + subject + state |
| projectCreateRequests | Original create request payload and committed result | tenant + namespace + actor + request ID |
| auditEvents | Append-only application events for successful changes | tenant; project |

All are defined in `apps/web/convex/schema.ts`. Audit is append-only through the application surface, not a compliance-grade tamper-proof log against deployment administrators. Failed auth calls do not persist audit rows; the current audit records successful workspace, project and membership mutations atomically. No source, journal, provider token or arbitrary local path is stored.

## Request path

AuthKit validates/refreshed cookie sessions at the proxy and supplies `withAuth` server session data. Next forwards only the access token server-to-server using Convex SDK calls. Convex JWT configuration accepts the documented global WorkOS issuer with client audience and the legacy client-specific issuer. Convex functions additionally reject unexpected issuers and select a namespace tied to the configured client ID. Empty backend provider configuration authorizes no identities.

Every query/mutation computes scope from the verified identity and reads current grants. Owner reads are tenant-indexed. Non-owner listing is grant-indexed, and project reads also check the project's tenant. Personal setup never restores revoked access. Organization creation is internal-only; granting a tenant role does not alter WorkOS membership. Public list pagination is bounded independently of the web adapter.

Web POST requests require the exact configured Origin and reject client-selected identity/tenant fields. There is no membership-management browser UI in this slice; public Convex membership mutations are owner-authorized and available for subsequent UI integration. Initial organization provisioning requires an authorized internal administrative call after live setup.

## Modes and source connectivity

One configuration parser selects platform disabled, unconfigured, invalid or ready. Entry pages evaluate this at request time. Platform or invalid platform mode disables the local broker/session configuration, even with launcher variables present. WorkOS routes stay unavailable until configuration is valid. Provider setup screens never fabricate a signed-in user or persisted project.

Platform project creation creates metadata, initial grant, receipt and audit in one transaction. It never creates a local source checkout. Reopen reads the same Convex project ID and displays a disconnected source state. A reserved registry reference cannot be assigned by any public function; it is not projected to browsers and cannot enable Studio. The runner-command endpoint first checks project visibility, then always returns `RUNNER_DISCONNECTED`; this is a refusal path, not a source-command authorization capability.

Local project creation and Studio continue through their existing signed operator/CSRF/loopback broker path. Future remote pairing must add authenticated installation identity, exact registry binding, command-level editor authorization, liveness and request reconciliation before any source writes. It cannot treat a stored ID or localhost URL as connectivity.

## Recovery and configuration

Creation request IDs are retained in browser session storage under actor/tenant scope and reused with the original name after ambiguous failures. Convex checks current grants before returning an existing receipt. Unknown provider errors are reduced to service-unavailable responses, with no raw provider detail. Session storage preserves requests across reload in the same tab; it is not cross-device recovery. Project records and receipts remain in Convex.

See the [platform setup guide](../user-guide/platform-projects.md) and [evidence](../evidence/e01-platform/verification.md) for actual offline verification and remaining live checks. WorkOS organization removal is not yet synchronized through webhooks: revoke the corresponding Stellar grant as well, and verify provider expiry/session behavior in the live acceptance pass.

## First-use prerequisite gate

The dashboard now bootstraps a missing personal account through the existing origin-protected mutation, then rereads the authorized viewer. It only attempts this for `WORKSPACE_NOT_PROVISIONED` without an organization; revoked, unauthenticated and unavailable responses never trigger grants. Existing backend idempotency and revocation checks remain authoritative.

The normal account UI no longer offers metadata creation as a usable website. It presents `/platform/setup` first; old pending creation receipts remain recoverable, and existing records remain readable. Empty proposal sections are hidden after an authorized empty result, while errors and existing decisions remain accessible. Local website creation continues independently with a locked pending intent and existing registry receipts. This does not implement account pairing; its required ownership and recovery protocol is in the [first-use PRD](../prds/first-use-website.md).
