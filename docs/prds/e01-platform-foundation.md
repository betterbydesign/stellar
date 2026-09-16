# E01 platform foundation: identity and named projects

Status: implementation in progress; provider and user acceptance pending. This is the first E01 slice, not completion of the broader authenticated-preview epic.

## Outcome
A person can sign into standalone Stellar using its own WorkOS application, initialize a personal workspace, create a named project, and reopen its persisted details. Convex owns authorization and metadata. The existing local launcher still opens runner-owned source and history. Neither path depends on Agent Hub or company M2.

## Authorization and scope
- The configured WorkOS client ID plus a verified subject identify an actor. Convex verifies JWT issuer/signature; every function independently requires identity and live Stellar membership. Client-supplied user/tenant IDs never select the acting principal.
- Personal tenants are keyed by configured client ID and verified subject. Creating one's personal tenant is idempotent and grants only that subject ownership. Organization tenants are selected only by a verified `org_id` claim; initial organization/owner provisioning is an internal administrative operation, never first-login promotion.
- Active tenant membership is required for all tenant operations. Creating a project requires tenant owner/editor. Reading a project additionally requires its own active project grant, or tenant owner. Project edits require owner/editor. Revocation is checked on every call, including idempotent retries.
- Organization memberships are Stellar grants; WorkOS organization claims alone cannot grant one. E01 has no automatic WorkOS event synchronization. Removing a WorkOS user/session requires token expiry/revocation plus removal of the Stellar grant; the operational limitation is explicit.
- Project names are bounded display strings. Creation uses a stable request ID scoped by tenant and actor; identical retries return the same project, changed payloads conflict. Project and initial membership/audit writes commit atomically.

## Runner and registry behavior
Platform project identity is separate from a local registry project ID. New platform projects have no source allocation or runner connection. The schema reserves an optional immutable registry reference `(runner installation ID, registry project ID)` for a future authenticated pairing flow; no browser or public function can assert a verified link. No local path, source file, history journal, runner token or preview URL belongs in Convex.

The platform details page states that the workspace is disconnected and offers no active Studio controls. All platform runner-command requests check membership and then fail with a typed disconnected result. Local operator credentials cannot grant platform access. Platform mode cannot activate the local broker even if launcher variables are also present. Hosted code never tries to reach a user's loopback address.

## Modes and recovery
`STELLAR_PLATFORM_MODE=1` explicitly enables WorkOS/Convex entry at `/platform`; `/` and `/projects` route there in that mode. Otherwise existing local behavior remains. Mixed platform and local mode is a configuration error and disables privileged paths. Missing provider setup renders a truthful setup screen and returns service-unavailable from platform APIs. No fake user or in-memory database substitutes for configured providers.

A successful platform create means only metadata was persisted. A browser request ID is retained across ambiguous failures and reloads until success or explicit resolution; the same ID must not silently acquire a new payload. Provider outages show retryable unavailability without claiming a successful source operation. Details/list reloads recover from server restarts through Convex.

## Acceptance evidence
Offline: anonymous access, missing/wrong organization, cross-tenant/project IDs, revoked membership, read-only role, idempotency conflict/retry and audit atomicity; web origin checks, missing setup, expired-session handling, outage and disconnected commands; existing runner tests and isolated local acceptance. Browser evidence covers truthful setup/disconnected UI as configuration allows.

Live, separately required: Stellar-owned development WorkOS application and Convex deployment, configured callback/logout origins and issuer/client ID, two test identities/tenants; real login/logout/session expiry and persistent create/reopen, revocation and outage/reconnect. No provisioning or deployment is authorized in this task.

## Exclusions and next gates
Remote pairing/preview, source migration, account invitations UI, SSO event sync, billing, agents, CMS and media generation are follow-on slices. After foundation acceptance, review bounded Letta command/proposal proof and OpenRouter draft PRDs. No paid calls now.
