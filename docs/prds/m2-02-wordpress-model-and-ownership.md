# M2-02 — WordPress model and managed-field ownership

Status: proposed local PRD. Local identifier M2-02. Parent: [M2 index](m2.md). Company implementation belongs in `altitudemarketing/altitude-headless-theme`; no live environment change is authorized by this document.

## Overview

Implement the smallest WordPress/ACF model needed for the Lead Generation / Services — Large proof and one separate WP-owned draft. A custom content plugin owns post types, taxonomies, ACF integration and one permission-checked write service used by both the later importer and editorial clients. Commit the resulting WPGraphQL SDL. This PRD does not seed company records, render Astro, add a Stellar CMS, or activate/deploy code on WP Engine.

## Prerequisites

- [M2-01](m2-01-content-mapping-and-dry-run.md) supplies the versioned mapping/planner format, synthetic fixtures and a concrete company draft audit.
- Before company schema integration, present concrete proposed CPT, taxonomy, ACF group/field keys, relationships and Local JSON placement for user review. Unresolved company taxonomy remains explicit; a synthetic taxonomy proves mechanics only.
- Read the WordPress repository intake and reconcile its clean `develop` baseline before implementation. Licensed ACF Pro and a compatible WPGraphQL-for-ACF artifact are required for fixture and staging acceptance, but not for preparing the proposal/plugin skeleton.

## User Stories

- As a schema developer, I want a reviewable model diff so schema application never follows an Airtable column change silently.
- As an importer, I want one narrow content service that can write managed fields under an authorized service identity.
- As an editor, I want WP-owned fields editable while Airtable-owned fields, relationships and taxonomy assignments refuse unauthorized changes.

## Technical Requirements

### Endpoints and routes

Expose narrowly scoped PHP service methods and, only after checking the installed WordPress capabilities, equivalent discoverable abilities for schema read, draft record read, guarded field update and import apply. Requests identify actor/capability, environment, operation ID, mapping/schema version, record identity, mapped fields and expected target revision. A caller-supplied `import` flag never grants a bypass. Do not expose database writes, arbitrary post meta, plugin activation or schema mutation to browser or agent callers.

### Interface

The primary review surface may be a generated Markdown/JSON report and WP-CLI output. It must show `proposed`, `source-validated`, `target-validated`, `approved`, `applied` and `drifted` separately, with the exact schema/mapping hashes and unresolved dependencies. Schema approval precedes apply. WordPress admin shows a clear managed notice and field-level disabled/rejection feedback where practical, but server enforcement is the acceptance boundary.

### Data model

Own `plugins/altitude-content/**`, `themes/altitude/acf-json/**`, `schema/wpgraphql.graphql` and focused plugin tests/docs in `altitude-headless-theme`; the exact plugin slug is confirmed against the repo before its first commit. Define only the root page, required flexible-content layouts, required shared entities and the approved taxonomy. Store a per-post managed flag, explicit managed field/relationship/taxonomy set, stable external identity reference and target revision. Never register the same type or field group in both PHP and competing ACF JSON copies.

Schema state records `observedAt`/`validatedAt`/`approvedAt`/`appliedAt` independently. Approval binds an actor and the concrete definition hash; later drift invalidates target validation without erasing the prior decision.

### Integrations

Use supported WordPress and ACF APIs, never direct SQL. Regenerate and diff `schema/wpgraphql.graphql` with the repository command whenever the schema changes. Keep plugin activation and environment configuration as explicit operator steps. Playground or a disposable WP fixture can accelerate local work; WP Engine staging remains a separate parity check. The content service contract may consume M2-01's versioned format through an explicit distribution boundary without importing Stellar runtime code or company/Agent Hub implementation.

## Acceptance Criteria

- [ ] M2-02-A: A concrete proposed schema lists stable CPT/taxonomy/field-group/field keys, locations, types, defaults, validation, relationships, GraphQL names and Local JSON ownership; unresolved company taxonomy prevents company apply.
- [ ] M2-02-B: A clean fixture registers each approved definition exactly once and exports committed SDL matching the runtime schema; an incompatible or duplicate definition fails visibly.
- [ ] M2-02-C: The plugin stores stable source identity, managed status, mapped ownership and target revision without using slug/title as the upsert key.
- [ ] M2-02-D: Authorized import operations can change only the mapped managed set. Ordinary admin, editorial API and exposed ability paths reject managed field, relationship and taxonomy writes on the server without partial mutation.
- [ ] M2-02-E: A scoped editorial identity can update an allowlisted field on the separate WP-owned draft with an expected revision; stale revision, wrong project/environment and unsupported fields fail unchanged.
- [ ] M2-02-F: Status output distinguishes proposal, approval, schema apply and drift; no fixture result claims staging activation or live schema parity.

## Testing Plan

Add focused PHP tests or a deterministic WP fixture before claiming ownership enforcement. Cover duplicate registration, bad field keys/types, missing dependencies, managed writes through every supported entry path, mixed allowed/denied batches, stale revision, wrong identity and interrupted apply. Regenerate/diff SDL, run the WordPress repo's PHP syntax, PHPCS, Composer audit and schema checks, and record only observed results. A separate security review traces every writer to the shared service.

## Rollback Plan

Before live use, rollback is a code revert plus fixture recreation. After staging integration, disable exposed write abilities first, retain identity/ownership metadata and content, and apply a reviewed additive schema repair; do not delete fields/posts or reverse data automatically. The repository's additive `rsync --inplace` deploy is not atomic, so staging recovery must be documented before M2-06.

## Timeline

1. Prepare the concrete schema/ownership proposal and fixture harness.
2. Obtain approval of the company definitions and resolve taxonomy before company integration.
3. Implement registration, content service, enforcement and SDL export; run fixture and security review.

## Dependencies On Other Work

M2-02 consumes M2-01. The service contract unblocks [M2-03](m2-03-independent-seed-executor.md); SDL and draft-read behavior unblock live acceptance in [M2-04](m2-04-typed-astro-page.md). [M2-05](m2-05-company-project-studio.md) uses the editorial service but does not broaden it.

## Agent handoff

- **Owned:** `plugins/altitude-content/**`, approved `themes/altitude/acf-json/**`, `schema/wpgraphql.graphql`, focused fixture/tests and schema/ownership documentation in `altitude-headless-theme`.
- **Excluded:** Airtable fetching/executor skill, Astro code, Stellar UI/runner, plugin activation, staging writes, deployment and production data.
- **Review gates:** concrete schema user review before company apply; independent schema and authorization reviews before M2-03 integration; live staging changes wait for the later concrete authorized action.
