# Independent platform foundation: WorkOS and Convex

## Context
The user requested kickoff of the stack integration recommendation alongside upstream review. E01 in the product roadmap owns reusable authentication, project state, authorization, audit and scoped runner access. Existing M1/M1-07 proves trusted-local editing and named projects; its launcher credential is not hosted identity. M2 remains a separate company WordPress proof. This plan creates an explicit platform workstream; it does not relabel M2 or claim an existing M3 implementation.

## Goals
- Introduce Stellar-owned WorkOS identity integration and Convex project/membership state through a thin, testable vertical slice.
- Prove tenant/project authorization for listing, creation and runner commands, including negative cross-tenant tests.
- Preserve local named projects and their source/history without a destructive migration.
- Define a clean, gated path to Letta and OpenRouter after the platform slice is proven.

## Non-Goals
Copying Agent Hub's application or whole database schema, shared raw tenant data or credentials, requiring Agent Hub to run Stellar, changing the company Airtable-to-WP import, general content CMS, billing, live paid model calls, broad agent orchestration, or production deployment.

## Scope
Own platform/auth/project membership contracts, WorkOS integration, Convex application schema/functions, relevant broker/UI wiring, and platform evidence. The upstream task owns narrowly selected editor-core/preview fixes. Agree file ownership before either edits shared contracts, package manifests, runner dispatch or Studio API files. The saved checkout contains separate uncommitted lifecycle fixes; do not copy its entire working tree or edit its data.

## Plan
1. Read intake, this plan, the E01/E02/E05/E06/E12/E13 roadmap and shared-foundation decisions. Establish an isolated work branch from the committed kickoff baseline; default main is stale. Inventory configured integrations without printing secrets. Fetch current official implementation documentation via Context7 and applicable WorkOS/Convex skills.
2. Use bounded SOL high agents for identity/authorization design and implementation, Convex project state, and independent review. Root owns cross-boundary wiring and migration. Review Agent Hub integration patterns read-only where available; identify reusable contracts and provenance. Do not copy proprietary implementation unless reuse authorization for those specific modules is established; implement independently where possible.
3. Write a thin PRD and architecture decision before coding provider wiring: identity mapping, organization/project membership, role checks, source registry linkage, audit records, local-versus-hosted mode, and account/environment separation. Define one authoritative access policy and how it is checked at both the web boundary and Convex functions.
4. Implement login/session handling plus a signed-in project list backed by Convex. Add create/reopen semantics with explicit stable linkage to runner-owned source/history. Record failures and retry identities rather than claiming success when only one side persisted. Do not copy source files into Convex merely to mirror the local registry.
5. Design the runner connection honestly. Hosted requests cannot assume access to another machine's loopback runner. Preserve the current trusted-local mode and prove a scoped, authenticated connection in the actual supported environment. Remote runner hosting/pairing requires a separate bounded decision if the chosen slice needs it. Never expose the runner secret to the browser or reuse its local operator bypass for hosted requests.
6. Add authorization and recovery evidence: unsigned/expired sessions, wrong organization, wrong project, revoked membership, duplicate creation, backend outage and reconnect. Show existing local project source/history unchanged and independent Astro builds still working.
7. Use configured development accounts only within established authorization. Missing WorkOS/Convex setup should not stop contract, UI, adapter or negative-test work. Record exactly what is runnable offline and what requires a live configuration. Do not present mocks as a working provider integration. Ask only for concrete missing setup after preparing the reviewable implementation; never request secrets in chat.
8. After platform acceptance, specify the next bounded Letta proof: one authenticated job calls the same GUI command boundary, proposes a diff, requires review, persists its outcome, supports cancellation/retry and cannot expand its project scope. Stellar owns workflow/approval state; Letta is a replaceable runtime adapter. The upstream audit's applicable correctness fixes should be incorporated before enabling agent source writes.
9. Sequence OpenRouter after that proof: one server-side draft-generation job with model allowlist, budget/usage/provenance, ambiguous-request reconciliation and an asset reference. Keep reasoning-model selection separate from image-generation tooling. Do not execute paid jobs or provision services as part of this initial platform task.
10. Validate and independently review the implemented platform slice, record remaining live prerequisites and produce a local integration handoff. Broader .stellar Agent Hub interoperability remains E12, not a prerequisite for standalone login/project management.

## Progress
- 2026-09-19: User deferred remaining provider setup/live acceptance and requested useful independent work in a separate task with subagents. Keep this task and the handoff checklist open. Kick off a provider-independent proposal/review source slice with bounded SOL high subagents; preserve all live runner/runtime/spending gates.
- 2026-09-16: Isolated `codex/independent-platform-foundation` branch fast-forwarded to kickoff commit eac9459. Full intake read. Source task acknowledged disjoint ownership with Stacki: platform owns provider dependencies and auth/project files; no contracts, runner dispatch, editor-core or preview changes.
- 2026-09-16: Settled [first-slice PRD](../prds/e01-platform-foundation.md) and [authorization/connectivity decision](../decisions/006-independent-platform-authorization.md). No provider environment is configured in this worktree/process. SOL high agents own disjoint WorkOS identity and Convex backend implementation; root owns web/API integration and evidence. No proprietary Agent Hub implementation is imported.

- 2026-09-16: Implemented WorkOS AuthKit routes/proxy/session, Convex namespaced tenants/current grants/projects/create receipts/audit, scoped API and account project UI. Local operator routes fail closed in platform/mixed mode. Provider credentials/config remain absent.
- 2026-09-16: SOL high backend/identity agents completed bounded slices. Independent SOL review identified retry grant and pagination defects plus mode/recovery gaps; fixes landed. Follow-up SOL review/test turn hit account usage limit; root completed targeted same-tenant tests and verification without changing model policy or claiming final independent acceptance.
- 2026-09-16: Full verification passed 143 tests, root production packages/Next/Astro build passed, and real temporary local-runner acceptance passed. Built-app setup UI checked at desktop/mobile; offline component recovery proof is labeled separately.
- 2026-09-16: Prepared gated [Letta proof draft](../prds/e01-letta-command-proof.md) and [OpenRouter draft-generation PRD](../prds/e13-openrouter-draft-generation.md). Execution awaits foundation acceptance, scoped runner proof and explicit spending authorization.

- 2026-09-16: Committed the verified source/evidence slice locally as `a1006f9`; the worktree was clean at that checkpoint. All temporary browser/preview services were stopped.

## Surprises & Discoveries
No provider environment exists in this worktree/process. Convex codegen requires a configured deployment; offline-compatible typed wrappers permit local tests/builds but are not deployment evidence. The harness profile fixes the schema-doc slot to null, so the new schema is documented in architecture while deployment/schema verification remains unconfigured. Existing template hashes were intentionally refreshed for the user-guide index addition.

The current roadmap identifies E01 but M2 explicitly excludes hosted accounts/runtime. A separate platform task avoids silently expanding the company integration milestone. The existing authenticated loopback runner does not by itself solve hosted workspace access.

## Decision Log
- 2026-09-19: Deferred prerequisites remain owned by this task for a later user session. Offline proposal/review preparation may proceed in an isolated task without claiming foundation acceptance or enabling agent source writes.
- 2026-09-16: Start WorkOS/Convex now alongside company M2 and upstream review, using named projects as the first vertical slice.
- Letta follows a proven authorization/project boundary; OpenRouter follows the first controlled agent/media job. Full Agent Hub handoff stays separate.
- Shared modules do not imply shared tenant records, raw transcripts, vendor credentials or operational dependency.

## Validation
See [verification evidence](../evidence/e01-platform/verification.md) and [review record](../evidence/e01-platform/review.md). `npm run verify` passed 143 tests plus docs/harness/lint/typechecks/fixture validation. `npm run build` passed packages/Next and the independent Astro fixture. `npm run verify:local` passed real local source/recovery/isolation checks with temporary copies and random ports. Built-app browser setup and failure paths passed. WorkOS session/JWT and Convex persistence are not live-tested; tests distinguish SDK/config checks, mock-backed function execution, offline UI fixtures and real local-runner proof.

## Outcomes & Retrospective
The first source slice is implemented and locally verified, with independent review findings addressed. It provides concrete provider wiring and offline authorization proof, not accepted live hosted editing. Live WorkOS/Convex setup, end-to-end identity/persistence/revocation proof, user acceptance and a separately reviewed runner connection remain. Letta/OpenRouter PRDs are gated drafts; no job or paid request ran. See [integration handoff](../handoffs/e01-platform-foundation.md) for the next setup and ownership boundaries. Local commits are authorized; pushes, shared merges, checkout synchronization and deployment remain outside this task.
