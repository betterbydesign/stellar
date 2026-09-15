# Decision 005 — Offline content plans and the company POC boundary

Date: 2026-09-14. Status: accepted for the M2-01 local implementation; company schema choices remain proposed.

## Decision

Begin M2 with portable strict JSON contracts and a pure offline planner in `packages/content-import`. Keep this subsystem separate from editor source/session contracts. A standalone CLI can validate local inputs and report intended changes without starting Stellar. It does not perform imports or grant write authority. The later canonical company executor and portable skill belong with `altitude-headless-theme`; WPGraphQL consumers belong with `altitude-astro`. Settle explicit format/package distribution at integration rather than make the company pipeline depend on the Stellar web application or account.

Preserve the current company research draft. Audit its source field references, explicit view scope and composition against the committed schema snapshot, then report absent evidence as blockers. Use clearly synthetic data to prove executable-format planning. Do not invent company record values, deployed ACF keys, taxonomy definitions or schema approval to make a sample pass.

## Evidence and rationale

Two SOL high agents independently reviewed source contracts and UX/dependencies. A read-only local inspection found the existing company repositories in the adjacent `altitude` checkout directory: Astro on clean main at `0a956281` and WordPress on clean develop at `80cf5252`. Their tracked implementation remains consistent with the [readiness audit](../research/company-site-readiness.md): WP content-plugin/schema/ACF directories are placeholders; the lockfile has WPGraphQL, Smart Cache and HWP Previews but no licensed ACF Pro or WPGraphQL-for-ACF. Astro still has a placeholder prerendered page, without a content query or generated schema types. No remote fetch, plugin activation or staging runtime check was performed.

The company draft's 71 source bindings refer to observed fields, but it explicitly says `draft_not_executable` and `targetSchemaVerified: false`. It has logical target paths, no record-value snapshot or target inventory, unresolved taxonomy, and media transform labels without actual attachment identities/checksums. Its globals proposal targets ACF options, which have no post-like draft status. These are reasons to build useful validation now and defer writes until their requirements are concrete.

## Boundaries

- Stable base/table/record/attachment identities establish provenance; title, slug and temporary download URL do not.
- Explicit view roots plus declared forward dependencies bound scope. Reverse links, prose and source labels do not authorize extra roots, taxonomies or code execution.
- Schema definitions, record values and publication have separate review/verification states. A plan records observed preconditions, not an authorization capability.
- Managed fields, relationships and taxonomy assignments remain Airtable-owned. Other WP content stays editable through the future shared ownership service. No-op plans do not imply that a future executor may touch timestamps or attachments.
- New post intent is draft-only; publication, deletion and unpublishing are absent. Non-draftable terms/media require a visible environment policy. Global option writes are deferred.
- The first normalized schema contract need not compile arbitrary ACF flexible content. The real company composition and key mapping remain M2-02/03 acceptance.
- No new UI is needed to prove this slice. Later screens expose separate connection capabilities, schema state, record-level plan review, ownership and recoverable conflicts rather than a single generic connected/success badge.

## Consequences and follow-up

M2 is six PRDs with explicit dependencies in [the dispatch index](../prds/m2.md). Independent importer logic and offline Astro components can proceed after contract freeze, while real acceptance waits for the WP model/service and seeded data. Before M2-02 acceptance, prepare concrete schema definitions and obtain the remaining taxonomy/model decisions; synthetic taxonomy does not settle the company taxonomy. Before live actions, review current capabilities and obtain authorization for the concrete result as required by the task.

This does not decide ownership or licensing through repository placement, copy company/Agent Hub implementation, or add Directus, an Airtable-to-Astro loader, Convex relay, DAM provider or new deployment infrastructure.
