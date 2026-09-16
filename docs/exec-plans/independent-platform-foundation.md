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
- 2026-09-16: Plan created; independent kickoff requested. WorkOS/Convex runtime implementation has not started.

## Surprises & Discoveries
The current roadmap identifies E01 but M2 explicitly excludes hosted accounts/runtime. A separate platform task avoids silently expanding the company integration milestone. The existing authenticated loopback runner does not by itself solve hosted workspace access.

## Decision Log
- 2026-09-16: Start WorkOS/Convex now alongside company M2 and upstream review, using named projects as the first vertical slice.
- Letta follows a proven authorization/project boundary; OpenRouter follows the first controlled agent/media job. Full Agent Hub handoff stays separate.
- Shared modules do not imply shared tenant records, raw transcripts, vendor credentials or operational dependency.

## Validation
Run docs/harness checks for plans, then the appropriate root verify/build and real-browser checks for implementation. Use temporary data and isolated ports. Tests must exercise unauthorized access and partial failures. Record live provider evidence separately from offline contract tests and fixtures.

## Outcomes & Retrospective
Pending execution. Deliver a reviewed WorkOS/Convex foundation or a concrete implementation plus precisely identified live prerequisites, followed by Letta/OpenRouter PRDs. Make local commits for completed verified slices. Do not push, merge shared branches, sync another task's checkout, deploy, or create paid resources without scoped authorization.
