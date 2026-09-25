# Connected-computer website editing

Reviewed 2026-09-24. This implementation joins account records to the existing guarded local Astro editor. [Acceptance evidence](../evidence/first-use-website/connected-verification.md) uses synthetic identity with real backend functions and source files; live provider acceptance remains open.

## Supported environment and ownership

The account-enabled Next server runs on the user's computer beside the loopback runner. `npm run dev:connected` starts both and supplies a one-use setup link. The web server has its own WorkOS/Convex configuration. This is not a remote relay: a hosted server cannot reach a user's loopback runner. Ordinary local editing remains available through `dev:local`.

WorkOS verifies identity. Convex owns current memberships/project grants, account metadata, connection records and provisioning receipts. The runner owns a stable installation ID, exact account-to-registry bindings, source directories, revision/history journals and preview processes. One account project has one immutable installation/registry binding. Names never select source. Existing local sources are not imported automatically.

## Authorization path

[Connected configuration](../../apps/web/lib/connected/config.ts) requires explicit connected mode, ready platform configuration, local mode off, an exact `http://127.0.0.1` application origin matching the auth callback, a separate loopback runner address and a dedicated connection secret. `/api/projects` retains its original local-only gate. [The new adapter](../../apps/web/lib/connected/http.ts) uses `/api/connected` and requires exact Host/Origin, verified account identity, current backend access and a signed local-operator cookie. Mutations require CSRF derived from the operator session plus identity namespace, tenant and actor. Connected Studio refreshes it before each mutation so account changes cannot reuse cached authorization.

Pairing is explicit: redeem the launcher nonce, request a five-minute installation challenge, show the account/computer, then confirm. The runner consumes the challenge and returns a stable connection ID. The web server signs a canonical attestation, which [Convex proof actions](../../apps/web/convex/connectionProof.ts) verify before an internal mutation rechecks identity, current membership, challenge digest/expiry and single use. A dedicated `STELLAR_CONNECTION_SECRET` exists only on the web server and Stellar Convex deployment. Provider tokens and this secret never reach the runner, preview or source.

Every new confirmed challenge rotates the active connection for that tenant/installation, including when another organization member connects. An exact confirmation retry returns the same result, but cannot restore a revoked connection. Backend connection records are scoped to the confirming actor. This version supports one active connection per tenant on a given computer; another confirmation replaces it. Disconnect first revokes backend authority, then attempts runner revocation. If the second step fails, backend checks still reject later commands; a new connection rotates the old local capability. Disconnection does not delete source or stop an already displayed preview.

Each Studio call checks current tenant/project edit access, exact account project/installation/registry mapping and active connection, then dispatches through the runner's independently persisted binding. Registry IDs are public routing data, not authority. The original protocol still checks request, session, proposal, revision, digest and allowed source commands. No alternate source writer is introduced. Viewer grants cannot open this editing route. Requests already authorized and in progress may finish; revocation prevents later authorization and is not a distributed cancellation transaction.

## Provisioning and recovery

1. Persist the account project's original creation request (or use an existing metadata project's ID).
2. Persist its provisioning operation, installation and pinned blueprint before allocating source.
3. Allocate through the runner using a deterministic namespace/tenant/account-project identity. Persist a pending binding before allocation, then the exact registry result.
4. Open the guarded session and acknowledge the exact binding and initial source revision with a signed receipt. Mark account source ready only after backend reconciliation.
5. Open `/platform/projects/{accountProjectId}/studio`. Preview startup/readiness remains separate from source readiness.

Retries reuse the same operation/template and source directory, including after reconnect. An acknowledged ready operation resolves its existing binding without re-acknowledging an old revision after later edits. Ambiguous failures remain preparing and recoverable; the broker does not falsely mark them permanently failed or delete files. Backend `failProvisioning` is available for explicitly classified failures but is not used for ambiguous transport errors. Browser session storage preserves pending intent and locks its name/template; write failures prevent new sends. Existing metadata records receive source on their original ID through **Finish website setup**.

The [runner connection store](../../apps/runner/src/account-connection.ts) atomically persists installation, challenges, connections and bindings. Any ambiguous persistence error disables its in-memory authority until restart reloads validated disk state. This includes a rename that succeeded before directory synchronization failed. Existing runner lease and guarded source journal behavior remain unchanged.

## Limits and next validation

No hosted transport, arbitrary repository execution, automatic local-source import, account transfer, managed hosting, AI execution or publishing is added. WorkOS organization revocation and Stellar membership are separate until event synchronization exists. Current JWT/session verification and current Stellar grants are required on each request; this does not promise instant WorkOS revocation beyond provider session behavior.

The opt-in `npm run verify:connected` mounts actual client components and HTTP handlers with test-only dependency injection, real Convex functions in `convex-test`, a disposable runner and real Chromium/Astro. It does not exercise AuthKit middleware, live JWT lifecycle, cloud deployment or real Convex network durability. Live sign-in, persistence, membership revocation, session expiry and reconnect on the user's independent configured providers remain required before live acceptance.
