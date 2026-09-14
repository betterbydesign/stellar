# M1-01 — Editor contracts and reproducible project fixture

Status: ready for implementation planning. Local identifier M1-01; no external tracker task. Parent: [M1 index](README.md), bootstrap slices 2–3, partial foundations for product R01/R04/R06/R07/R08.

## Overview

Define the smallest shared contract that lets independent agents build a real source-backed editor, and provide the Astro project against which every milestone claim can be checked. This is a planning PRD; none of the packages or fixture below exists yet. The first shipped slice is a validated fixture manifest plus importable TypeScript contracts with runtime validation.

M1 does not need the complete future `.stellar` handoff schema, a database, OAuth or a universal design-system builder. Version these editor contracts so later renderers and hosted scope can be added without treating Astro output as HTML authoring support.

## Prerequisites

- Completed Stellar bootstrap and root npm checks.
- Read the [source-portability research](../research/stacki-lumos-portability.md) and [application foundation](../architecture/application-foundation.md).
- No external accounts. Resolve current Astro integration documentation and select a tested exact fixture toolchain during implementation; record versions and provenance rather than using a floating scaffold command.

## User Stories

- As an implementer, I want one validated project/edit contract so the runner, engine and UI agree on what an edit means.
- As a developer trying Stellar, I want a small project with known editable targets so I can distinguish an editor defect from an unsupported import.

## Technical Requirements

### Endpoints and routes

This PRD defines the protocol and transport contract; it does not implement routes. M1-02 owns server routes under `/api/projects` and a project/session prefix `/api/projects/{projectId}/sessions/{sessionId}`. Braces here denote parameters, not literal framework directory names.

| Operation | Contract |
| --- | --- |
| List/get registered projects | `GET /api/projects`, `GET /api/projects/{projectId}`; returns safe metadata and capabilities, never arbitrary host paths |
| Open a session | `POST /api/projects/{projectId}/sessions`; idempotent `requestId`, returns session descriptor and lifecycle state |
| Read/close session | `GET` / `DELETE` session prefix; close stops the preview, not deletion of working source |
| List pages | `GET` session prefix + `/pages`; known page IDs/routes only |
| Read source model | `GET` session prefix + `/source-model?pageId=...`; revision, targets, capabilities and safe source context |
| Prepare/apply | `POST` session prefix + `/changes/prepare` and `/changes/apply`; see shapes below |
| Reconcile a request | `GET` session prefix + `/changes/requests/{requestId}`; authorized project-scoped lookup of pending/applied/unchanged/conflicted outcome after a lost response or reconnect |
| Read history | `GET` session prefix + `/history`; M1-02 receipts first, M1-06 undo/redo availability later |
| Undo/redo | `POST` session prefix + `/history/undo` or `/history/redo`; implemented in M1-06 using the same revision and write gates |

Every response identifies protocol version, project/session scope where applicable, and a request ID. Inputs are validated on the server even when the client uses generated types. Failure envelopes carry a stable code, recoverability and a safe user-facing message. Define at least invalid request (400), unauthorized (401/403), unknown project/target (404), stale revision or history conflict (409), unsupported target/value (422), and runner unavailable/not ready (503). Do not leak absolute paths, environment contents or credentials in errors.

`PrepareChange` includes `protocolVersion`, `projectId`, `sessionId`, `requestId`, `expectedRevision`, `targetId` and `command`. Commands are `style.set`, `style.reset` and `token.set`; their values are discriminated and validated. An opaque server-resolved `targetId` selects the declaration owner, rather than a browser-supplied arbitrary file or text range. Element targets expose permitted property/scope controls and linked token-definition targets. `token.set` uses a distinct token-definition target for one approved concrete declaration; it never reuses an element target or chooses a definition from computed style.

The preparation response contains `proposalId`, `baseRevision`, target/scope, a bounded impact description and an exact source patch preview. Preparing never writes source. An unchanged value returns an explicit unchanged result with no new patch/history entry. Apply includes the proposal ID, expected revision and request ID; it returns a receipt ID, old/new revisions and changed file. The runner rejects changed/stale proposals.

Use a different request ID for each logical prepare, apply, undo or redo operation; retain that ID only while retrying the same operation and intent. Idempotency is scoped to the authorized operator, project and operation. Changed reuse is a conflict. After session replacement, request reconciliation can read an existing project-authorized outcome without reusing an old session's write capability. An unresolved operation must be reconciled before issuing a new apply; session retry/reconnect must not create duplicate source changes or copies.

### Interface

No final studio UI belongs to this PRD. Provide typed examples for project cards, lifecycle states, page choices, selected targets, supported controls, draft/proposal/applied states and read-only explanations so UI work can proceed without guessing.

The browser bridge uses a distinct envelope: `protocolVersion`, `projectId`, `sessionId`, `previewGeneration`, `frameId`, `pageId`, `sourceRevision`, message type and payload. M1-04 adds ready, selection, geometry, clear and diagnostics messages. A frame message can report a selection; it cannot authorize a source write.

### Data model

Create `packages/contracts` with runtime validators, TypeScript types, examples and tests. Update root workspace wiring once here; other PRDs add only their owned packages with coordinator-managed lockfile changes.

Define Project, RegisteredWorkspace, Session, Page, SourceTarget, StyleControl, TokenDefinition, ChangeProposal, ChangeReceipt, request-outcome status and HistoryEntry. Separate durable project/page IDs from session IDs, preview generations and ephemeral parser node IDs. A relevant source/manifest byte change creates a new opaque project revision and invalidates old revision-scoped targets. A no-op read/reparse, ordinary preview restart or unchanged reopen preserves the source revision; preview generation still rotates on restart. Persist revision sequencing so undo to old bytes creates a new revision, avoiding accidental reuse of an earlier state identity.

The request's `expectedRevision`, proposal's `baseRevision`, frame's `sourceRevision` and source model's project revision refer to the same opaque version domain. A frame generation is a separate value. Stable authored anchors can recover a selection only after unique remapping. Record source file, structural locator and component definition/call-site context in the source model. Rendered occurrence comes from M1-04's preview and is joined to that model, not guessed by the pure parser from source bytes. CSS identity includes file, selector, at-rule/theme context, declaration name and expected source revision. A computed value is not a unique source location.

Build `fixtures/astro-style-lab` with pinned source and its own reproducible dependency lock. Its normal build must work independently from the Stellar app. Include:

- Home and Contact routes, ordinary authored CSS classes and a small shared component library.
- A unique hero/CTA target with deterministic local-style ownership; two repeated shared components whose internals exercise ambiguity/read-only behavior; nested elements and an unsupported dynamic case.
- A semantic color token, spacing token and alias; at least one token used on both routes. Use a project-local manifest for editable declarations, types, units, bounds, token references, themes and impact scope. Keep malformed/alias-cycle cases in test fixtures.
- An explicit alias policy: M1 `token.set` edits only approved concrete base color/length definitions. Semantic `var(...)` aliases are displayed and followed to those leaf targets for impact review; the alias declarations remain read-only and are never silently replaced with literals. Both routes must exercise usage through an alias. Unknown, cyclic or scope-ambiguous chains disable editing.
- Supported local properties: `color`, `background-color`, `padding-inline`, `padding-block`, `gap`, `border-radius`. Use explicit color/length types and manifest-approved units or token references; no arbitrary CSS expressions, URL values, `!important` injection or executable input.
- Base style scope and one named mobile media condition, pinned in the manifest at 767 CSS pixels maximum. Canvas widths of 390/768/1440 do not themselves define write scope. Base-only shared token edits; theme/state-specific edits are read-only for M1.
- Defaults and override ownership that make reset meaningful: keep the non-editable base/token fallback in a separate authored rule from the editable override. Include existing allowlisted base/mobile override rules, initially empty where appropriate, so insertion/reset never requires inventing a selector. `style.reset` removes only the override declaration, leaves its rule and fallback intact, and refuses attempts to delete a design-system default.

Create two independent runtime copies through M1-02; never mutate the seed fixture. Runtime state belongs in a documented gitignored local data directory, not under shared fixture source or browser storage. The fixture's static anchors and manifest must not require development-only marker attributes in published HTML.

### Integrations

No WorkOS, Convex, Agent Hub, CMS or agent runtime integration. `renderer` and capability fields reserve future HTML support but must reject unsupported project execution. Source package and asset notices accompany any copied code. Use a small original fixture system here; a full Lumos port and company design-system integration remain separate proofs.

## Acceptance Criteria

- [ ] M1-01-A: Every request/example validates; unknown protocol versions, mismatched scope, unsupported commands and invalid values fail with the agreed errors.
- [ ] M1-01-B: A clean checkout builds the fixture without sibling repos or Stellar services. Dependencies and assets have explicit provenance.
- [ ] M1-01-C: Two pages, unique/nested targets, repeated-component ambiguity, shared token/alias and base/mobile CSS scope cases exist and have expected outcomes.
- [ ] M1-01-D: Source identity, command idempotency, proposal/receipt and preview envelope fields are sufficient for M1-02/03/04 without duplicate contracts.
- [ ] M1-01-E: Fixture edit capabilities do not advertise general HTML, arbitrary Astro import, client authorization or full design-system coverage.
- [ ] M1-01-F: Root checks include contract/fixture validation and the clean fixture build; setup and supported cases are documented for the next agents.

## Testing Plan

Use schema tests for valid requests, hostile paths/extra payload fields, project mismatches, invalid units/token references and version mismatch. Build the fixture and verify both routes before editing work starts. Test editable metadata against actual declarations and expected CSS media conditions. Avoid snapshotting arbitrary generated markup as a substitute for these assertions.

## Rollback Plan

Revert this PRD's package/fixture and workspace-wiring changes together before dependent work lands. If consumers exist, coordinate the revert or use a compatible protocol version. Runtime projects must not be deleted by reverting a fixture. No deployment rollback applies.

## Timeline

1. Commit the supported-case matrix and protocol decision in the implementation ExecPlan.
2. Add contracts with passing validator tests: first usable handoff for parallel work.
3. Add and build the pinned fixture, then freeze the initial contract for M1-02 and M1-03. No calendar duration is promised before implementation evidence.

## Dependencies On Other Work

Requires the bootstrap only. Enables M1-02 and M1-03 in parallel and mock-based UI preparation. It does not authorize shipping mock-only completion for M1-04/05.

## Agent handoff

Own `packages/contracts/**`, `fixtures/astro-style-lab/**`, root workspace/fixture verification scripts and a new architecture document describing the implemented protocol. Coordinate root manifest/lock/CI changes here; do not change the runner, editor engine or studio UI. Supply validated examples, fixture build evidence, a source/target map and exact exported names. Use SOL high and the harness intake. Downstream agents must inspect the actual merged exports before coding.
