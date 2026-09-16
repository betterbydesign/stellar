# Independent platform authorization and runner connectivity

Date: 2026-09-16. Scope: [E01 first slice](../prds/e01-platform-foundation.md).

Stellar uses its own WorkOS application and Convex deployment. No Agent Hub code, schema, credentials or tenant records are imported. Existing shared-foundation research supplies behavioral context only; no specific proprietary module reuse has been authorized.

WorkOS owns authentication. Convex owns Stellar tenant membership, project grants and immutable audit events. The configured WorkOS client ID namespaces subjects and organization IDs. Verified subject and active organization claims determine tenant selection, while current Convex grants determine authorization. Personal bootstrap is allowed only for the caller's subject; organization ownership is provisioned internally. A revoked Stellar membership remains revoked across login/bootstrap. Organization claim presence never promotes an owner.

The Next server forwards the session access token to Convex and keeps it out of page data. Exact Origin checks from the configured callback origin protect browser mutations; absent/foreign origins and spoofed forwarded hosts do not gain access. AuthKit owns PKCE/state validation on callback, and sign-out uses a POST server action. Convex repeats authorization for direct calls, so a web check is not the policy authority. All queries use bounded/indexed access and return scoped projections. Audit records are transactionally written with mutations; no public update/delete API exists for them.

Mode selection is explicit and fails closed on mixed local/platform configuration. Existing trusted-local sessions still mean local operator authority, not a hosted user identity. Hosted requests have no runner transport in this slice. Source commands fail as disconnected after authorization. Local API access is disabled in platform mode, regardless of copied launcher variables.

A platform project is metadata until connected. Its ID never doubles as a filesystem path or registry ID. Future registry pairing must prove control of a runner installation and bind the exact local project ID, authorize every command, reconcile allocation using durable request identities, and preserve source/history in place. A stored reference alone cannot establish liveness or grant source access. E01 creates no references and performs no cross-system allocation, avoiding a fictitious success after partial provisioning.

The alternative of calling localhost from hosted Next was rejected because it reaches the server's own loopback, not the user's machine. Automatic cloud mirroring/migration of local projects was rejected because it changes ownership and cannot establish source authority. A separate hosted runner or outbound pairing transport needs its own reviewed slice.

Provider implementation references were fetched using Context7 and checked against the [AuthKit Next.js README](https://github.com/workos/authkit-nextjs/blob/main/README.md), [Convex WorkOS authentication](https://docs.convex.dev/auth/authkit) and [Convex server rendering](https://docs.convex.dev/client/nextjs/app-router/server-rendering). Provider configuration and successful live sign-in remain distinct from SDK compilation and mock-backed function tests.
