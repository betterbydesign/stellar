# M2-01 — Content mapping and deterministic dry-run planning

## Overview

Status: **implemented and reviewed locally, 2026-09-14**. Give a developer or agent a reproducible way to validate a proposed content mapping and inspect intended changes before building the WordPress executor. This is the first unblocked slice of [M2](m2.md), supporting the schema/import portion of [POC-01](../POC-01-company-site.md). Local identifier only; no external task is registered. See [review and evidence](../handoffs/m2-01-review.md).

The implementation has two explicitly different inputs: a synthetic executable-format fixture proving the planner, and the existing company research draft whose source references can be audited but whose record values and approved target schema are unavailable. A blocked company report is accurate evidence, not an imported page. The package runs without Stellar's web app, Convex, Airtable or WordPress.

## Prerequisites

- M1 baseline and harness intake; root dependencies installed.
- Read the company mapping, source schema snapshot and source ownership decisions.
- No live credentials, ACF license, deployed schema or publication approval is needed for this offline slice.

## User Stories

- As a developer, I can validate a mapping and see ordered intended operations so I can review the import before implementing writes.
- As an operator, I can distinguish invalid inputs, blocked plans and ready offline plans, including why the company draft is not executable.
- As an integration author, I can consume stable JSON contracts without depending on the Stellar application.

## Technical Requirements

### Endpoints and routes

No HTTP routes. A standalone root CLI reads explicit local JSON mapping, source-snapshot and target-inventory inputs and prints a machine-readable report. A separate company audit command reads the committed research artifacts. Exit codes distinguish success, invalid input/usage and valid-but-blocked plans. Neither command performs network calls or target/source writes. Shell redirection is the operator's choice when saving a report.

### Interface

The first review surface is JSON plus documented root commands. Reports contain contract version, provenance/input digests, readiness, ordered diagnostics and operations with create/update/no-op/blocked counts. Never label a proposed operation as executed. Errors avoid echoing content values or credentials. CLI parse failures must remain machine-readable.

### Data model

`packages/content-import` owns strict, versioned mapping, source snapshot, target inventory and plan contracts, independent of the editor protocol. Declare normalized post types, ACF groups/fields, per-binding ownership, taxonomy/term hierarchy/assignments, bounded forward relationships and media identities. This is a minimum normalized schema model, not a compiler for every ACF layout or the full company seven-section composition.

Identity uses source system/base/table/record, with attachment identity where needed; names, slugs and mutable URLs never establish identity. Root view membership must be explicit and complete. Follow only declared forward relations; do not infer taxonomy from prose or traverse inverse links. Field transforms are typed and allowlisted. Preserve declared relationship order and check cardinality, missing targets and hierarchy cycles.

Plans are pure and deterministic, with canonical input/intent digests, stable operation IDs, dependencies and observed target preconditions. Compare only declared managed values; preserve WP-owned values. Matching state is a no-op; changed state has a guarded update intent; duplicate identity is blocked. New posts are draft-only. Publication/deletion/unpublishing, option writes and source-absence cleanup are excluded. Non-draftable term/media work requires an explicit safe environment policy; production side effects cannot be hidden inside a draft seed.

Schema readiness and environment evidence must be visible. Any approval record is review evidence, not an authentication token. The later executor must independently validate permissions, freshness and the exact reviewed intent. A plan must never become implicit authorization merely because its inputs are well formed.

### Integrations

Use the repository's pinned TypeScript/Zod toolchain. No provider SDKs or database services. The company audit validates all 71 proposed source bindings against the committed 16-table/176-field schema snapshot and reports the absent target/record/taxonomy/media evidence. It preserves the original `draft_not_executable` artifact.

Ownership: package implementation agent owns `packages/content-import/**`; audit agent owns `scripts/audit-company-content-map.mjs` and `test/company-content-map.test.mjs`; coordinator owns root scripts/lockfile, generic CLI, documentation and integration tests. Do not edit company repositories or M1 editor files.

## Acceptance Criteria

- [x] M2-01-A01: Strict versioned input validation rejects unsupported versions/keys/transforms, duplicate identities and unknown schema targets without evaluating source text.
- [x] M2-01-A02: Equivalent input ordering produces identical canonical plans/digests; inputs remain unchanged and `writesAttempted` is zero.
- [x] M2-01-A03: Only selected-view roots and declared forward dependencies appear; excluded roots and inverse links cannot broaden scope.
- [x] M2-01-A04: Synthetic post, shared-record, ACF field, taxonomy hierarchy/assignment and media cases produce ordered intent with cardinality, missing-link and cycle diagnostics.
- [x] M2-01-A05: Forced draft, managed-field ownership, no-op comparison, observed revisions, collision rejection and non-draftable side-effect policy are demonstrated. No publish/delete/unpublish operation exists.
- [x] M2-01-A06: Missing/unapproved/mismatched schema and incomplete snapshots block readiness. Blocked dependencies do not become ready child operations.
- [x] M2-01-A07: Company evidence audit validates the committed source references and reports remaining blockers without creating fake content values, ACF keys, approvals or import success.
- [x] M2-01-A08: Root commands, CLI error/blocked/success exits, package checks and local documentation pass; architecture and next-PRD handoff distinguish shipped planner from deferred executor.

## Testing Plan

Use meaningful node tests for determinism, scope exclusion, forward dependency ordering, transform/type validation, duplicate identity, ownership, noop/update, target preconditions, hierarchy cycles, media identity and blocked propagation. Invoke the CLI as a process against valid synthetic, blocked and malformed inputs. Audit the actual committed research artifacts plus deliberately corrupted copies. Run root docs/harness, lint, typecheck, tests and production build. No new application UI is delivered; no browser proof is claimed for the CLI.

## Rollback Plan

Revert this additive package, root wiring and CLI together. No live database or persisted M1 project migration exists. Existing saved research artifacts remain unchanged. Reports are versioned disposable review outputs; they cannot be applied by this implementation.

## Timeline

1. Freeze the contract and bounded first slice after independent source/UX review.
2. Implement package and company audit in disjoint files; coordinator integrates commands and docs.
3. Review adversarial cases, run verification and commit locally. This is the first shippable M2 slice.

## Dependencies On Other Work

- Enables [M2-02](m2-02-wordpress-model-and-ownership.md) schema/service work and [M2-03](m2-03-independent-seed-executor.md) adapter design.
- Company schema approval, licensed runtime and record snapshots are later integration inputs; synthetic fixtures do not settle them.
- Actual independent executor belongs with the company project. Decide explicit contract/package distribution before integrating; a Stellar app or account must never become a runtime prerequisite.
