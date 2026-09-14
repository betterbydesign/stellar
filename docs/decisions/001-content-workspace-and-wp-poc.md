# Content preparation in Convex and a WordPress-first proof

2026-09-13 · Architecture refinement, updated for the observed POC source in PRD v0.4.

## Recommendation

Build the table, relationship, form and page-binding experience inside Stellar, backed by Convex. Use it to prepare logical content models and draft content before or alongside CMS implementation. The user has selected the existing company Astro + WordPress/ACF repositories for the first proof and **Airtable → WP seeding outside Stellar**, with Astro reading WPGraphQL. Convex content preparation is independent of that import path. Use Playground for disposable fixtures and WP Engine staging for deployment validation. [Confirmed POC plan](../POC-01-company-site.md)

Directus is a **GUI reference only**. No Directus integration or licensing decision is needed. The earlier research treated that analogy as a possible dependency unnecessarily; PRD v0.2 removes that workstream.

## What Convex would store

The proposed content workspace includes collection definitions, fields and validation, relationships, draft records, revisions, page-section bindings, source provenance, review state, CMS mappings and promotion jobs. A model can exist before either WordPress or Neon has been provisioned.

Illustrative example, not an observation of the agency's Airtable: a `Testimonials` collection has quote, person, company and photo fields; a homepage section selects three testimonial records. Stellar can render that content during design. Later, the same logical fields map to a WP custom post type/ACF group or a Neon model. The binding references a stable logical field ID, not a vendor column label.

Three different concepts need distinct names in implementation: a Stellar logical collection, a physical Convex table, and an Astro content collection used during site building. They need mappings; they need not have one-to-one identities.

Use a small set of developer-owned Convex tables with typed envelopes, such as model definitions, records, relationships, revisions and target mappings. Validate each record against the project's versioned logical model at runtime. User-created collections are data within this model; users should not need a Convex code deployment for every field they add. Convex supports document storage, references, explicit schema validation and record validators; this metadata-driven CMS is a proposed application architecture, not a built-in Convex admin product. [Convex schemas](https://docs.convex.dev/database/schemas)

Index project/collection/state and the known hot query paths. Arbitrary user-defined facets need deliberate index/projection design, not whole-table scans. Paginate content views; store each record/revision separately and media bytes in appropriate file storage. The current document limit is 1 MiB, so a whole website or product catalog should not be embedded into one document. [Convex limits](https://docs.convex.dev/production/state/limits)

The table UI, relation editor, permissions, revision history, rich-text controls, media tools and publishing policy remain Stellar features to build. The existing Convex dashboard is a developer tool, not the proposed client-facing CMS.

## Can Convex be the entire collection backend?

Yes, technically. An Astro build can consume published data through a server-side adapter and turn it into static pages; a specific prebuilt Airtable loader is not a prerequisite. Astro's loader interface supports custom sources, and Convex exposes JavaScript clients for data access. [Astro loader API](https://docs.astro.build/en/reference/content-loader-reference/), [Convex JavaScript client](https://docs.convex.dev/client/javascript/overview)

That would make Convex an additional supported website-content backend, including publication snapshots, access controls, export/offboarding, media and operational commitments. It is unnecessary for this WP-first proof. Keep the content model capable of such an adapter without adding it to the required launch matrix yet. The agency's stated WP and Postgres deployment choices still make sense as durable site ownership/export boundaries.

## Working proposals versus applied content

The earlier “Convex stores only coordination and references” boundary was too narrow. Storing drafts is useful and does not require two uncontrolled editable masters.

| State | Owner and behavior |
| --- | --- |
| Content modeled before a CMS exists | Convex owns the working model/records; approved versions can be exported as fixtures or a `.stellar` handoff. |
| Existing WordPress content opened in Stellar | WP remains the applied-content owner. A Stellar proposal records the WP identity and base version/hash. |
| Airtable-managed template fields | Airtable remains the upstream authority under the existing company decision. WP stores applied values; Stellar indicates ownership and refuses editorial writes until an explicit ownership handover. |
| Agent/manual draft editing | Convex stores a separate revision and reviewable diff; public WP content is unchanged. |
| Apply to target | A controlled job validates the mapping and permissions, checks that the target has not changed, writes through supported WP APIs and reads the result back. |
| Target changed outside Stellar | Mark a conflict or refresh/rebase; never overwrite it silently. |
| Release | Build from a coherent approved CMS/content snapshot and source revision; record the serving release independently from draft save or target application. |

For new content, promotion creates WP records and saves logical-to-WP IDs. Existing records use stable mappings rather than recreating posts on every run. Store operation IDs, target environment, model version, source/target revisions, status and attempts. Reconcile an ambiguous result before retrying. A plain read-then-write check alone is not atomic if WP editors can write concurrently; use a guarded endpoint or an enforced single-writer policy for the relevant operations until a stronger compare-and-update mechanism exists.

Convex can commit a draft and schedule subsequent work atomically, but the WordPress HTTP write is a separate external side effect. Scheduled actions are not automatically retried like transactional mutations. Persist the operation result and implement bounded retries/reconciliation; pass actor scope explicitly and recheck authorization. [Convex scheduling guarantees](https://docs.convex.dev/scheduling/scheduled-functions), [actions](https://docs.convex.dev/functions/actions)

Write through WordPress/ACF APIs rather than database tables directly. For the company project, coordinate the existing Abilities/MCP design task with the import skill and expose a shared permission-checked content service. ACF's REST support remains a possible underlying transport, not a reason to give agents broad unguarded writes. Keep WPGraphQL as the Astro read path. Record/field ownership, idempotency and guarded updates require application logic whichever transport is chosen. Field-definition deployment and multi-record atomicity are separate concerns from updating field values. [ACF REST integration](https://www.advancedcustomfields.com/resources/wp-rest-api-integration/), [ACF field API](https://www.advancedcustomfields.com/resources/update_field/), [existing authoring task](https://app.clickup.com/t/86ak3a2n1)

Do not equate an edit to a published WP post's ACF values with an isolated unpublished revision. For the first fixture, update an explicitly draft page; for existing live content, preserve the proposed values in Stellar until a verified revision/preview or release mechanism can apply them safely. Test ACF revision behavior for the actual fields in use.

## Why WordPress is now the better first proof

The supplied ClickUp project and local repositories confirm separate WordPress code and Headless Astro deployment foundations. WordPress therefore tests the intended company-site path directly. The repository audit also found that content models, ACF dependencies, imports, queries, preview and publish rebuilds remain unfinished; completed scaffolding is not a working CMS pipeline. [Readiness audit](../research/company-site-readiness.md)

Keep the first proof narrow:

1. Select one actual Airtable template/record set and define the minimal company content model and frontend blocks where currently absent.
2. Implement the independently runnable repo skill and deterministic importer. Seed WP/ACF with stable identities, imported media, dry-run/retry behavior and enforced Airtable field ownership.
3. Prove WPGraphQL reads and Astro rendering/preview against a repeatable fixture and WP Engine staging. Trial Playground CLI beside Astro without making it a blocker.
4. Connect the thin Stellar canvas/inspector and an agent/manual content proposal path for a separate WP-owned draft. Convex does not relay the Airtable import.
5. Validate the responsive page and existing staging deployment path, including one prerendered page rebuilt after publication and another page remaining draft.
6. Prove unauthorized and source-owned field writes fail, conflicting revisions cannot overwrite, retries do not duplicate posts, and a failed Astro build/Headless promotion preserves the prior frontend artifact. The live WordPress rsync is not atomic; record its staging recovery procedure separately rather than extend the frontend guarantee to WP code.

Do not require a general schema designer, automatic WP account provisioning, a complete site rebuild, or a third CMS backend to pass this first slice. Add generic model-to-ACF generation after the concrete field path works. Preserve the company CSS-variable/Astro component contract; current values are placeholders, so real representative tokens/blocks still need creating. Validate Lumos through a separate compatibility fixture.

Playground must remain an accelerator. Give its initial CLI/plugin boot test a bounded feasibility check; if a required plugin or sandbox network path does not work, continue the core proof against WP Engine staging and retain the reproducible fixture work for later. [Playground evaluation](../research/wordpress-playground-poc.md)

## Evidence and inputs still needed

Authenticated Airtable reads now establish the source schema and records: the base has 16 tables/176 fields and the supplied view contains only Lead Generation (`SERV-LG`), using Services — Large (`serv-lg`). A draft mapping preserves shared content identities and records publication gaps. No explicit taxonomy source was observed. [Mapping research](../research/airtable-acf-mapping.md). Existing company repositories and pipeline definitions were inspected, along with ClickUp tasks and owner comments. Live staging behavior has not been reverified.

Remaining inputs are target-schema and taxonomy decisions, missing source values/destinations/global content, ACF artifact availability and current staging runtime/plugin checks. Existing owner comments resolve one-way Airtable authority for mapped template fields, WP-admin coexistence and a portable repo skill as the import interface. An optional later detach/import-once mode is a separate ownership decision; the POC does not silently change that policy.
