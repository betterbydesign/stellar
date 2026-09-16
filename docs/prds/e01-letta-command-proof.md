# Letta proposal and reviewed command proof

Status: bounded draft prepared for review. Execution is gated on E01 live provider acceptance and separately authorized runner connectivity. No Letta runtime, provider call or paid job is implemented by the platform foundation.

## Objective
One authenticated editor asks for one supported token/style change on one source-linked element. A replaceable Letta adapter returns a typed proposal. Stellar presents the same prepared diff as the GUI, and only the user's review can invoke the same guarded apply command and history receipt. Letta cannot call a separate privileged file writer.

## Entry gates
- Complete the [foundation live acceptance](../evidence/e01-platform/verification.md): real identity, persistent project, revocation, tenant/project isolation and recovery.
- Define and prove a scoped runner transport. The current platform project is unlinked and `requestRunnerCommand` always refuses; it is not this transport.
- Integrate applicable completed Stacki correctness fixes through a separately coordinated branch integration. The upstream task reports BOM byte-coordinate and case-insensitive standard CSS ownership fixes; queued watcher refresh backlog is a separate runner follow-up. Verify exact accepted commits and repeat affected editor tests before source writes.
- Authorize one development runtime/account and an explicit budget. No Agent Hub runtime, credentials, schema or transcripts are required.

## Product and command contract
The initiating session selects tenant/project, source revision, page/element and a permitted command schema. These values are sealed into a Stellar job record; model arguments cannot expand them. The initial allowlist is one existing supported token/style prepare command. No arbitrary paths, shell commands, direct networking, credential reads or tenant selection tools exist.

Stellar owns job state: `queued → running → proposed → approved → applying → succeeded`, with `rejected`, `cancel_requested`, `cancelled`, `failed` and `outcome_unknown` branches. Approval binds proposal digest, exact command payload, actor, tenant/project, source revision and expiry. Revalidate membership, editor grant, current revision and command support at prepare and again at apply. Any changed proposal/revision or revoked permission invalidates approval.

The agent tool returns a proposal ID and small review context. It cannot apply. The human approves through Stellar; the broker invokes the existing GUI apply boundary with a durable request ID. Recovery reads the command receipt/history before any retry. Undo remains the existing history command; record the agent job provenance alongside the application outcome without duplicating or rewriting runner history.

## Adapter and budget controls
Use a dedicated provider conversation for the job/project and map provider IDs to authorized Stellar records. Provider tags are diagnostic metadata, never tenancy enforcement. Credentials remain server-side. Use the current [Letta Node SDK reference](https://github.com/letta-ai/letta-node/blob/main/api.md) and verify exact installed operations when implementing. Current docs describe asynchronous conversation messages, run messages/usage lookup and cancellation; cancellation support depends on provider deployment capabilities, including Redis for conversation cancellation. A cancellation request is not proof that execution or billing stopped.

Start disabled with a zero budget. A separately approved pilot sets model allowlist, one concurrent job per project, one logical generation attempt, maximum wall time, maximum input/output tokens, maximum tool calls and an explicit currency reservation. Fail closed when no conservative upper bound is available. Record estimated/reserved/actual usage separately; do not imply a token limit is a currency cap. Disable SDK automatic retries for job submission (`maxRetries: 0`) so ambiguous submissions enter `outcome_unknown`.

Persist provider account/environment reference, adapter/version, model, prompt/template version, scoped input hashes, proposal digest, provider conversation/run/request IDs, usage, cost status, approval/rejection actor/time and source command receipt. Keep secrets and raw unrelated tenant context out of logs and exports. On network failure, recover the existing run by its durable ID; if no run ID was received and creation cannot be reconciled, require explicit resolution before spending again. Cancellation blocks future tool/apply transitions immediately even if the vendor run is still winding down.

## Acceptance
1. The GUI and proposed job produce the same prepared command/diff for one fixture edit; applying uses the same receipt/history path.
2. Cross-tenant, same-tenant wrong-project, revoked, viewer, stale-revision, altered-payload, unapproved and expired approvals all fail before source writes.
3. Rejecting/cancelling leaves source unchanged. Crashes before/after apply recover one result with no duplicate history entry.
4. Budget exhaustion, provider timeout, ambiguous submit and lost streaming connection preserve the reservation and require reconciliation; no automatic paid replay.
5. One authorized live pilot records actual usage and a reviewed change plus undo/redo/build evidence. Offline adapter tests are labeled separately.

No broad agent orchestration, chat memory migration, CMS write, media job or deployment is part of this proof.
