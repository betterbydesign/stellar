# M2-03 — Independent Airtable-to-WordPress seed executor

Status: proposed local PRD. Local identifier M2-03. Parent: [M2 index](m2.md). The executable and portable skill belong in `altitudemarketing/altitude-headless-theme`; Stellar and Convex are never runtime dependencies.

## Overview

Build a deterministic, independently runnable executor that consumes the versioned M2-01 plan, reads only the selected Airtable view and seeds approved WordPress/ACF content as drafts through M2-02's service. It preserves stable identities, ownership and durable media, supports reviewable dry runs and resumes partial work without duplication. Live staging execution is a later, separately authorized step.

## Prerequisites

- M2-01 format, validation rules, synthetic fixtures and company draft audit are versioned. Integration defines how the company repo receives that format and records its version/license/IP provenance without copying Stellar or Agent Hub code.
- M2-02's approved company schema, stable ACF keys, ownership service and schema version exist before real apply. Importer engine work may proceed earlier against a fake service adapter.
- Airtable read access is available through a configured secret store for real-source tests. No credential, source snapshot containing secrets or expiring attachment URL is committed.

## User Stories

- As an operator, I want to review the exact proposed creates, updates, no-ops and blockers before any WordPress write.
- As a data owner, I want retries and concurrent attempts to preserve one stable WP identity per source record.
- As an editor, I want seeded values to remain visibly Airtable-owned while unrelated WP-owned drafts stay editable.

## Technical Requirements

### Endpoints and routes

Provide a repository-local command and portable skill interface with explicit `plan`/`dry-run`, `apply`, `status`, `resume` and `reconcile` operations. Inputs include mapping/schema version, source base/table/view, target environment, operation ID and expected approved hashes. `apply` requires an approved target schema and authorized import identity. A retry retains the same operation ID and intent fingerprint; changed reuse is a conflict. The executor does not expose a public Stellar route or accept arbitrary mappings/transforms from chat.

### Interface

Dry-run output shows plan/source timestamps, environment, approval/hash match, counts and record/field/media detail with ownership and failure reasons. Run states are `planned`, `blocked`, `approved`, `running`, `partially_failed`, `result_uncertain`, `completed_noop`, `completed_changed`, `cancelled` and `superseded`. Each state includes observed/started/updated/completed times where applicable. Resume lists the next safe checkpoint; reconcile is required before retrying an uncertain side effect.

### Data model

Own `.agents/skills/airtable-acf-import/**`, `scripts/content-import/**` and `tests/content-import/**` in `altitude-headless-theme`; coordinate any shared plugin storage with the M2-02 owner and register a test command through that repo's coordinator. Persist run/record/media operation IDs, source identity `(baseId, tableId, recordId or attachmentId)`, mapping/schema versions, intent hash, target IDs/revisions, changed fields, attempts and safe errors. Do not log secrets or temporary download URLs.

Verify definitions applied through M2-02 before record import, then plan terms/posts/media and required relationships/assignments. Content apply must never silently deploy a schema. Read only the selected root view, follow allowlisted forward relations in bounded batches and never infer deletion/unpublish from a partial seed. First-run posts remain drafts. Terms, media and any future global settings require explicit environment/side-effect policy; they have no post draft boundary. A no-op performs no WordPress writes and does not alter timestamps or media identities.

### Integrations

Use Airtable's official read API and M2-02's content service through a replaceable adapter. Paginate, bound retries and honor rate limits. Download attachments transiently, validate allowed type/size, checksum content, import/reuse WP attachments, preserve alt/source identity and discard expiring URLs. Read back applied records through WPGraphQL or an equivalent approved service check; Astro is a consumer, never the importer.

## Acceptance Criteria

- [ ] M2-03-A: Offline synthetic plan/dry-run is deterministic, makes zero network/writes and rejects unapproved schema, unknown transform, missing required link and changed intent under one operation ID.
- [ ] M2-03-B: A source-backed dry run reads only the selected view plus declared relations and reports exclusions, missing content, taxonomy/schema readiness and every intended mutation before apply.
- [ ] M2-03-C: Fixture apply creates drafts with stable external mappings; replay is a true no-op with unchanged record timestamps and media IDs; changed titles/slugs do not duplicate records.
- [ ] M2-03-D: Required terms, relations and media resolve before a record can become eligible for publication; unresolved required dependencies remain visible and resumable.
- [ ] M2-03-E: Interruption before and after a WordPress side effect reconciles to applied, unapplied or conflicted without duplicate writes. Overlapping runs for one source identity cannot race.
- [ ] M2-03-F: Managed fields, relationships and taxonomy assignments reject non-import identities, and a failed mixed operation leaves no false completed state.
- [ ] M2-03-G: The command/skill runs from the WordPress repository without Stellar, Convex, Agent Hub or Astro; manifests/logs contain no secret or permanent Airtable download URL.

## Testing Plan

Use fake Airtable/WP adapters for deterministic pagination, throttling, transform, dependency and fault-injection tests; use a disposable WP fixture for real ACF/media/readback behavior. Cover missing pages, partial view, duplicate events, overlap lock, ambiguous timeout, checksum reuse, changed attachment, rejected MIME/size, unresolved relation and denied owner. Run the WordPress repository verification plus the executor's registered test command. The integration review inspects record timestamps/media IDs before and after replay.

## Rollback Plan

Dry runs need no rollback. For fixture/staging, stop new runs, reconcile in-flight operations and retain journals/mappings. Reverse only a reviewed run whose created draft IDs and preimages are known; never bulk-delete by view absence or overwrite newer editor changes. Disable the import identity before repairing an ownership defect.

## Timeline

1. Implement the portable command/skill and pure executor against M2-01 synthetic fixtures and a fake WP adapter.
2. Integrate M2-02 service, durable operation journal, media and disposable fixture readback.
3. Review the concrete staging dry run; execute live only under the later authorized action.

## Dependencies On Other Work

M2-01 is required for format/plan behavior. M2-02 is required for real application. A completed fixture/readback enables M2-04 live queries and M2-06 staging proof. Scheduled synchronization, detach mode and source-absence unpublish are later PRDs.

## Agent handoff

- **Owned:** `.agents/skills/airtable-acf-import/**`, `scripts/content-import/**`, `tests/content-import/**` and their operator guide in `altitude-headless-theme`; shared plugin persistence changes are coordinated with M2-02.
- **Excluded:** ACF definition ownership, public WP APIs, Stellar/Convex runtime, Airtable writes, scheduling, Astro rendering, publishing, deployment and DAM integration.
- **Review gates:** format/distribution/IP boundary review before integration; destructive/failure and ownership review before any real apply; operator reviews the exact live dry run immediately before a separately authorized staging seed.
