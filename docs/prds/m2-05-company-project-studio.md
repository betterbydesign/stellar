# M2-05 — Company project connection and thin Studio editing

Status: proposed local PRD. Local identifier M2-05. Parent: [M2 index](m2.md). Implementation belongs in Stellar and uses the existing company repositories through explicit adapters; it does not make Stellar part of the import or public runtime.

## Overview

Connect the real company Astro preview and scoped WordPress draft service to the completed local Studio. Prove three bounded edits: one new supported block move or approved variant, one supported shared token edit through the designated site token source/override, and one WP-owned draft field proposal/apply/readback. Show source ownership, revisions and connection capabilities. M1 did not implement structural edits; this PRD must add and constrain that command explicitly.

## Prerequisites

- M1 runner, source engine, exact-origin bridge, inspector and journal remain the only Astro source-write path.
- M2-02 provides the scoped WP editorial service and ownership denials; M2-03 supplies a seeded managed draft; M2-04 supplies stable rendered block/content identities and authorized preview.
- Identify a separate WP-owned draft and allowed field set. Define the one supported move or variant against a concrete hand-authored Astro structure that can be preserved safely.
- Register reviewed local working copies only. General repository import, hosted identity and untrusted-code isolation remain out of scope.

## User Stories

- As an editor, I want to know which source, environment and owner controls the selected value before proposing a change.
- As a designer, I want one safe structural or variant adjustment and one shared-token change to persist in ordinary Astro source.
- As a content editor, I want a reviewable WP-owned draft edit while Airtable-owned content stays locked.

## Technical Requirements

### Endpoints and routes

Extend the existing `/projects/{projectId}/studio` and authenticated project broker; do not create a second Studio or browser-to-WP route. Add server-only WordPress capability/read/propose/apply/readback operations carrying project, environment, actor, stable WP record/field identity, base revision and request ID. Add one typed source command for the exact supported block move or variant; it uses prepare/review/apply and the runner journal like M1 commands. The iframe supplies observations only.

### Interface

Add a compact connection checklist for repository/preview, WordPress schema/write, WPGraphQL preview and environment, with `unknown`, `checking`, `needs_access`, `ready`, `degraded`, `failed` and `stale` states plus last-observed time. Do not add inactive CMS, IA, media, plugin or deployment navigation.

The inspector shows value origin, owner (`airtable-managed`, `wp-owned`, `source`, `global/shared`), revision, editable scope and denial reason. Every operation has a human-readable diff and separate `drafted`, `reviewed`, `applying`, `applied`, `readback_confirmed`, `preview_pending`, `conflicted`, `result_uncertain` and `failed` state. Source save, CMS apply, preview freshness and release remain distinct.

The block control supports exactly the approved move boundary or variant; unsupported sibling/parent/component structures are read-only. Token impact shows affected routes/components and writes only the designated source/export-safe override. Never hand-edit the company site's generated `globals.css`.

### Data model

The coordinator owns any shared `packages/contracts` extension. This PRD owns company adapter and UI state under `apps/web/features/studio/**`, `apps/web/features/inspector/**` and `apps/web/lib/server/**`; it owns the bounded transform under `packages/editor-core/**` and its guarded runner/journal integration under `apps/runner/**`. Stable content IDs, source targets, frames, sessions and revisions remain separate.

Persist/reconcile request outcomes without storing WP credentials in browser state or project handoff. A WordPress proposal records the target base revision and readback result. A source operation cannot be combined atomically with an external WP write; show them as separate changes and receipts.

### Integrations

The app broker calls the scoped M2-02 service and M2-04 preview using server-held connections. Use exact environment and origin checks. Stellar never calls Airtable for this workflow. Agent and manual actions use the same typed commands and authorization; no Letta runtime is required. The edited Astro site must still build and serve with Stellar unavailable.

## Acceptance Criteria

- [ ] M2-05-A: The company project opens with truthful per-capability/environment status and cannot display `ready` from a stale or partial connection check.
- [ ] M2-05-B: A selected field/block shows stable identity, origin, owner, revision and allowed scope; Airtable-managed content has a server-backed refusal, not merely a disabled control.
- [ ] M2-05-C: One explicitly supported block move or variant prepares a reviewable minimal source diff, persists through reload/reparse/reopen and remains in the independent Astro build; unsupported structures are unchanged.
- [ ] M2-05-D: One supported shared-token edit uses the designated source/override, shows impact and survives the next supported token-source verification without editing generated `globals.css`.
- [ ] M2-05-E: One WP-owned draft field proposal applies with expected revision, reads back, refreshes preview and records separate apply/freshness status; managed, stale and wrong-environment writes fail unchanged.
- [ ] M2-05-F: Lost/malformed responses reconcile under the original request ID; ambiguous outcomes block new writes, and source/WP conflicts never force overwrite.
- [ ] M2-05-G: The frame, browser and agent cannot supply filesystem paths, WP credentials, ownership bypass or arbitrary operations; ordinary site output contains no editor capabilities.

## Testing Plan

Unit-test capability/status transitions, ownership presentation, command validation and stale/lost-response reconciliation. Add source-preservation corpus cases for the exact move/variant and refusal cases. Browser-test real company working copies, responsive selection, token impact, WP draft round-trip, managed denial, conflict, reload/reopen and independent Astro build. Capture screenshots/video/source and WP readback receipts tied to revisions. Run Stellar verification/build plus affected company-repo checks.

## Rollback Plan

Disable the company adapter and new command UI while retaining M1 projects and journals. Revert a source edit only through guarded history. Disable WP editorial capability before repairing an authorization defect; retain proposals/outcomes and reconcile uncertain writes before retry. No deployment rollback applies here.

## Timeline

1. Capability-aware project connection and ownership/read-only inspector.
2. Implement and prove the single bounded block move/variant and designated token edit.
3. Add WP-owned draft proposal/apply/readback, conflict recovery and complete browser evidence.

## Dependencies On Other Work

M2-02 through M2-04 are required for full acceptance. UI shells may use frozen fixtures earlier, but mocks do not close criteria. M2-05 supplies the reviewed editor state and revisions consumed by M2-06; release controls remain absent until then.

## Agent handoff

- **Owned:** the bounded `packages/editor-core/**` command, `apps/runner/**` application path, company `apps/web` broker/Studio/inspector changes, focused tests and evidence. Shared contract and root wiring changes go through the coordinator.
- **Excluded:** company schema/importer/Astro page ownership, arbitrary structural editing, generated token stylesheet edits, general repo import, hosted auth/Convex/Letta, publication, deployment and production.
- **Review gates:** source-preservation review for the new command; authorization/ownership review for WP; real browser and user visual review before M2-06.
