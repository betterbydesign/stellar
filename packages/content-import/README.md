# @stellar/content-import

`@stellar/content-import` defines the portable `stellar.content-import.v1` offline planning contract. It validates normalized mapping, source-snapshot, target-inventory and plan JSON with strict Zod 4 schemas, then produces a deterministic dry-run. The package has no network, credential, filesystem, WordPress or Airtable client and never executes a write.

```ts
import {
  InvalidInputError,
  compileDryRun,
} from "@stellar/content-import";

try {
  const plan = compileDryRun({ mapping, source, target });
  // plan.readiness is "ready" or "blocked".
  // plan.writesAttempted is always 0.
} catch (error) {
  if (error instanceof InvalidInputError) {
    // error.issues contains only input name, masked JSON path and issue code.
  }
}
```

The package exports `CONTENT_IMPORT_CONTRACT_VERSION`, `MappingSchema`, `SourceSnapshotSchema`, `TargetInventorySchema`, `DryRunPlanSchema`, `compileDryRun`, `InvalidInputError`, `canonicalize`, `canonicalDigest`, and `computeTargetSchemaDigest`, plus their inferred TypeScript types. Schema-invalid input throws `InvalidInputError`; valid but incomplete, unapproved, mismatched or unsafe input returns a blocked plan. Approval records bind the canonical mapping digest, declared-schema digest, exact target site identity and environment. They are review evidence only. A future executor must authenticate, recheck target freshness and require separate write authority.

The mapping format supports a deliberately small normalized model: post types, core fields, ACF group/field declarations, allowlisted scalar transforms, explicit forward relationships, attachments, taxonomy definitions, term hierarchy and assignments. Binding ownership is `managed` or `wordpress`. WordPress-owned bindings never broaden the source closure or create desired values. Target values observed as WordPress-owned cannot silently satisfy or be overwritten by a managed binding.

Root membership names one complete source view. The planner starts only with those record IDs and follows managed forward relationship bindings; it never follows undeclared inverse fields or imports another root-table record outside the view. Source identity is `system + baseId + tableId + recordId`; media adds `fieldId + attachmentId`. Slugs and temporary URLs never establish media or record identity, and attachment snapshots cannot contain download URLs.

New posts have only the `draft` status. Existing draft posts may produce revision-guarded updates. Existing non-draft posts block changed content. The operation vocabulary has no publish, delete, unpublish, schema-deploy or option operation. Term, media and taxonomy changes are blocked in production and require an explicit disposable/staging policy elsewhere. Matching managed state is a no-op, including matching non-draftable state.

Each operation has a target-scoped stable `operationId`, an `intentDigest`, ordered dependencies and any observed target revision. V1 canonical JSON sorts object keys using locale-independent UTF-16 lexical order, preserves meaningful array order, serializes finite numbers with JavaScript's `JSON.stringify`, and hashes UTF-8 bytes with SHA-256. Object/declaration order and unordered relationship/media/taxonomy membership do not alter the plan; bindings marked `ordered: true` retain source order.

The synthetic fixtures are [`fixtures/mapping.json`](fixtures/mapping.json), [`fixtures/source.json`](fixtures/source.json), and [`fixtures/target.json`](fixtures/target.json). They cover one selected page, one shared post, a parent/child taxonomy and assignment, one durable attachment and explicit excluded records. The company Airtable/ACF research draft remains `draft_not_executable` evidence outside this package. This package does not turn its proposed logical paths into ACF keys or claim a general flexible-content compiler.

Run package checks from the repository root:

```sh
npm run lint --workspace=@stellar/content-import
npm run typecheck --workspace=@stellar/content-import
npm run test --workspace=@stellar/content-import
npm run build --workspace=@stellar/content-import
```
