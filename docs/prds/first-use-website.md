# First-use website building

Status: connected-computer implementation and offline integrated browser proof are complete; live provider acceptance is pending.

## Problem and outcome

A person signed in, named a project Test, and found a disabled Studio button and an empty proposals area. The account currently stores metadata while the local editor independently owns real Astro files. A record is not a usable website. Success is sign in → name website → choose reviewed template → prepare files and preview → Studio → acknowledged save → close → reopen with the same changes.

## Execution environment decision

Support a connected computer first. The reviewed Astro registry, guarded source commands, history and preview already work locally. Managed hosting would add sandboxing, dependency execution, storage and deployment infrastructure before fixing this journey. Defer it. Run the account-enabled web server on the same computer as the loopback runner. Show the connection prerequisite before creation. Require explicit pairing and exact source binding before Test can open in Studio. The separate local editor remains available without account linking.

## Milestones

1. Automatically initialize personal accounts using the existing authenticated, idempotent bootstrap. Never provision organization access or restore revoked membership. Prevent new metadata-only creation in the normal UI; preserve legacy receipt recovery and all existing records. Explain the computer prerequisite before collecting a website name.
2. Harden the real local create-to-edit journey: reviewed template, durable pending creation, locked intent after ambiguous responses, explicit preparation and preview states, latency measurements, persisted source and restart proof.
3. Implemented and reviewed an authenticated computer connection, exact account-to-registry binding, signed provisioning acknowledgement and account Studio. Real browser proof covers source, guarded save, reopen/restart and metadata recovery with synthetic identity. Live acceptance requires securely supplied Stellar-only provider configuration, updated backend deployment and user sign-in.
4. Validate the complete signed-in journey and revocation on live independent providers before claiming product completion.

## Screens and states

- Account loading: “Preparing your account…”; failures expose retry. Organization access remains administrator-managed.
- Dashboard: “Your websites”; existing metadata records say “Setup incomplete”. A “Set up website editing” link opens explicit pairing before collecting another website name; connected accounts can prepare a reviewed template.
- Existing Test: explain that the name is retained but website files do not yet exist. “View setup steps” is usable when disconnected; “Finish website setup” prepares source on the existing record after connection. Never delete it, attach by name, or open an unrelated local source. Keep existing proposal history accessible only when relevant; hide an empty review section.
- Setup: show account and computer, confirm local control using the launcher link, then explicitly confirm a short-lived offer. Show actionable expiry/retry/disconnect states.
- Connected local creation: name and reviewed template; “Preparing website…” while registry creation is pending. Studio shows real preview startup/retry separately from source readiness.
- Save: only a guarded command receipt proves the source was saved. “Preview current” requires the bridge to report the saved revision. Failed refresh does not undo a successful save.
- Reopen: same registry identity and history. Account reopen resolves only its exact authenticated installation binding.

## Architecture, ownership and recovery

Convex owns account identity, tenant and project grants, project metadata and request receipts. The computer registry owns source directories, preview processes, revisions and history. WorkOS verifies the identity namespace; caller-supplied account/project identifiers never authorize access. A single account project ID will own one immutable installation/registry binding; names are labels, not matching keys.

The implemented pairing handshake starts with an explicit user action, display the installation and account being connected, use a short-lived single-use challenge, and requires confirmation at both authenticated account and local operator boundaries. Keep the runner capability only in local server processes, with exact binding and revocation. A separate web/Convex secret signs pairing and provisioning attestations. Do not send provider access tokens to previews or source code. Recheck current tenant and project edit grants before every command. Bind command authorization to installation, project, registry entry, session, revision, expiry and request. Reject unknown, swapped, stale, disconnected and revoked bindings. Reconnection must revalidate grants; no cached offline account authority.

Provisioning is a reconciled operation: persist account intent and pinned blueprint, allocate source using its stable operation ID, acknowledge the exact registry binding, then mark ready only after reconciliation. Crashes between phases resume the same operation. A second payload with the same key conflicts. Retry never allocates another directory. A failed allocation remains recoverable and owned, never silently deleted. Preview readiness is separate. Existing metadata-only records get an explicit “Finish setup” transaction on their existing ID; attaching an existing local website requires a separately reviewed ownership confirmation, never name matching. Preserve legacy local sources and history unchanged.

## Acceptance and performance

- No ordinary personal-account setup button; bootstrap retries cannot duplicate tenants or restore revoked access.
- No account UI can promise creation while no source provisioner is available. Existing receipts remain recoverable without new requests.
- Local creation reaches the real Studio with the selected name/template; duplicate clicks and reload after a lost response produce exactly one source directory and registry receipt.
- Real browser edit changes source via guarded commands, survives browser reload and runner restart, and builds independently. Legacy source fingerprints stay unchanged.
- Negative tests cover wrong project/session binding, revoked grants, idempotency conflict, lost responses and unavailable connections. Pairing-specific live negatives remain a release gate.
- Targets, not guarantees: warm account view <1 s, source allocation <2 s, warm create-to-edit <5 s, cold create-to-edit <15 s, acknowledged save <500 ms and save-to-current-preview <2 s at p95 on a documented reference computer. Record actual samples and environment; no p95 claim from a single run.
- Instrument local browser creation start, registry acknowledgement, editable preview and acknowledged-save-to-preview. Keep timings local and free of source contents, account names and credentials. Recovery samples must be labeled, not mixed with fresh creation.

## Dependencies and non-goals

Dependencies: installed pinned repository/fixture dependencies; running local services; Chromium for acceptance; securely configured independent Stellar WorkOS/Convex services for live identity tests; the same-computer pairing transport for the joined journey. See the [architecture](../architecture/connected-computer.md) and [setup guide](../user-guide/platform-projects.md). No Agent Hub data, credentials or code. No model calls in deterministic controls, AI execution, paid generation, provider selection, production hosting, deployment or alternate source writer.
