# First-use website building

Status: first implementation slice; account-to-computer pairing is not shipped.

## Problem and outcome

A person signed in, named a project Test, and found a disabled Studio button and an empty proposals area. The account currently stores metadata while the local editor independently owns real Astro files. A record is not a usable website. Success is sign in → name website → choose reviewed template → prepare files and preview → Studio → acknowledged save → close → reopen with the same changes.

## Execution environment decision

Support a connected computer first. The reviewed Astro registry, guarded source commands, history and preview already work locally. Managed hosting would add sandboxing, dependency execution, storage and deployment infrastructure before fixing this journey. Defer it. Until authenticated account pairing exists, show the computer prerequisite before account creation and clearly identify the separate local editor preview. Do not imply that a local website is linked to Test.

## First slice and milestones

1. Automatically initialize personal accounts using the existing authenticated, idempotent bootstrap. Never provision organization access or restore revoked membership. Prevent new metadata-only creation in the normal UI; preserve legacy receipt recovery and all existing records. Explain the available local path and the missing account connection.
2. Harden the real local create-to-edit journey: reviewed template, durable pending creation, locked intent after ambiguous responses, explicit preparation and preview states, latency measurements, persisted source and restart proof.
3. Implement and review an authenticated computer connection, then use it to join account identity and local registry through recoverable provisioning. This is unfinished engineering, not a setting the user can enable. Live acceptance also requires securely supplied Stellar-only provider configuration and user sign-in.
4. Validate the complete signed-in journey and revocation on live independent providers before claiming product completion.

## Screens and states

- Account loading: “Preparing your account…”; failures expose retry. Organization access remains administrator-managed.
- Dashboard: “Your websites”; existing metadata records say “Setup incomplete”. A “Set up website editing” link opens the prerequisite guide, before collecting another website name.
- Existing Test: explain that the name is retained but website files do not yet exist. “View setup steps” is usable. Never delete it, attach by name, or open an unrelated local source. Keep existing proposal history accessible only when relevant; hide an empty review section.
- Setup: explain connected computer support, existing local-launcher route, and account linking availability honestly. No fake download, connection-success state or unimplemented pairing button.
- Connected local creation: name and reviewed template; “Preparing website…” while registry creation is pending. Studio shows real preview startup/retry separately from source readiness.
- Save: only a guarded command receipt proves the source was saved. “Preview current” requires the bridge to report the saved revision. Failed refresh does not undo a successful save.
- Reopen: same registry identity and history. Account reopen eventually resolves only its exact authenticated installation binding.

## Architecture, ownership and recovery

Convex owns account identity, tenant and project grants, project metadata and request receipts. The computer registry owns source directories, preview processes, revisions and history. WorkOS verifies the identity namespace; caller-supplied account/project identifiers never authorize access. A single account project ID will own one immutable installation/registry binding; names are labels, not matching keys.

The future pairing handshake must start with an explicit user action, display the installation and account being connected, use a short-lived single-use challenge, and require confirmation at both authenticated account and local operator boundaries. Store an installation credential only on that computer, with least privilege and revocation. Do not send provider access tokens to previews or source code. Recheck current tenant and project edit grants before every command. Bind command authorization to installation, project, registry entry, session, revision, expiry and request. Reject unknown, swapped, stale, disconnected and revoked bindings. Reconnection must revalidate grants; no cached offline account authority.

Provisioning is a reconciled operation: persist account intent and pinned blueprint, allocate source using its stable operation ID, acknowledge the exact registry binding, then mark ready only after reconciliation. Crashes between phases resume the same operation. A second payload with the same key conflicts. Retry never allocates another directory. A failed allocation remains recoverable and owned, never silently deleted. Preview readiness is separate. Existing metadata-only records get an explicit “Finish setup” transaction on their existing ID after pairing ships; attaching an existing local website requires a separately reviewed ownership confirmation, never name matching. Preserve legacy local sources and history unchanged.

## Acceptance and performance

- No ordinary personal-account setup button; bootstrap retries cannot duplicate tenants or restore revoked access.
- No account UI can promise creation while no source provisioner is available. Existing receipts remain recoverable without new requests.
- Local creation reaches the real Studio with the selected name/template; duplicate clicks and reload after a lost response produce exactly one source directory and registry receipt.
- Real browser edit changes source via guarded commands, survives browser reload and runner restart, and builds independently. Legacy source fingerprints stay unchanged.
- Negative tests cover wrong project/session binding, revoked grants, idempotency conflict, lost responses and unavailable connections. Pairing-specific live negatives remain a release gate.
- Targets, not guarantees: warm account view <1 s, source allocation <2 s, warm create-to-edit <5 s, cold create-to-edit <15 s, acknowledged save <500 ms and save-to-current-preview <2 s at p95 on a documented reference computer. Record actual samples and environment; no p95 claim from a single run.
- Instrument local browser creation start, registry acknowledgement, editable preview and acknowledged-save-to-preview. Keep timings local and free of source contents, account names and credentials. Recovery samples must be labeled, not mixed with fresh creation.

## Dependencies and non-goals

Dependencies: installed pinned repository/fixture dependencies; running local services; Chromium for acceptance; securely configured independent Stellar WorkOS/Convex services for live identity tests; completed reviewed pairing transport for the joined journey. No Agent Hub data, credentials or code. No model calls in deterministic controls, AI execution, paid generation, provider selection, production hosting, deployment or alternate source writer.
