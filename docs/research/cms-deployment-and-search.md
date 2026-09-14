# Stellar research: CMS, publishing, deployment, and product search

Research date: 2026-09-13. This is a planning recommendation, not an implemented or benchmarked integration. Library research began with Context7 resolution and documentation queries for Astro, WP Engine, Neon, WPGraphQL, Directus, Vercel, PostgreSQL, Pagefind, and Airtable. Official documentation and source repositories supplied the evidence below. Repository `main` documentation can lead released packages; the implementation spike must pin and test compatible releases.

Updated after product clarification: Directus is only a GUI analogy; the preferred first proof is the existing company Astro + WP/ACF site. Convex may own working content/model proposals before explicit promotion to the selected site CMS. See the [content workspace refinement](../decisions/001-content-workspace-and-wp-poc.md).

## Recommended direction

Make Stellar the workspace and publishing coordinator, with separate adapters for **content**, **frontend deployment**, **media**, and **search**. The site repository remains independently buildable. WordPress and Neon are different content backends with different capabilities; Vercel and WP Engine Headless Platform are different frontend runtimes. These choices should be independently represented even when onboarding offers curated combinations.

Recommended first complete reference stacks:

1. Astro + WordPress on WP Engine + WPGraphQL/ACF + a WP Engine Headless frontend.
2. Astro + a Stellar CMS service over Neon Postgres + Vercel frontend.

Both remain required product outcomes. Given the user's existing Astro/WP scaffolds and GitHub-to-WP Engine pipelines, use the company WordPress site for the first proof. Airtable remains a useful content/model source to import; it is not a required intermediate runtime. Repository inspection must establish what the existing pipeline already covers.

Keep published marketing pages static by default. Add small interactive islands for filters, forms, search, and future commerce. Protected draft previews and mutable content APIs are separate from anonymous static delivery. Do not make every visitor depend on the Stellar portal, agent runtime, or client-memory services being online.

## Verified deployment support and boundaries

| Target | Verified capability | Required Stellar behavior / limitation |
| --- | --- | --- |
| Vercel, static Astro | Static Astro deployment is supported; Git integration supplies deployment previews. | Produce a versioned build and publish approved routes. Static delivery needs no runtime database access. |
| Vercel, Astro runtime | The Astro Vercel adapter supports on-demand rendering and ISR. | Generate a Vercel-specific configuration. Explicitly separate private preview routes and query-dependent APIs from cached public pages. |
| Vercel, plain HTML | Vercel documents directly serving HTML/CSS/JS projects without a build step. | Treat generated HTML/CSS/assets as the artifact; dynamic CMS operations remain behind services. Validate redirects, 404s, clean URLs, headers, and form endpoints in the adapter spike. |
| WP Engine Headless, Astro runtime | WP Engine has an official Astro guide using the Node adapter in standalone mode. | Generate the Node target, including the platform's required bind address. Vercel build output is not the WP Engine runtime artifact. |
| WP Engine Headless, static Astro / HTML | The platform documents static projects, including Astro static mode. Its Node containers do not automatically serve static output. | Package an HTTP server with the static artifact and correct routing/404 behavior. Do not copy the guide's SPA catch-all for a multipage marketing site. |
| Conventional WP Engine WordPress hosting | WordPress hosting is the CMS tier, distinct from the Node frontend tier. | A WordPress account alone must not be presented as confirmation that a headless frontend can be provisioned under its current contract. |

Sources: [Vercel's Astro guide](https://vercel.com/docs/frameworks/frontend/astro), [Vercel static-file deployment](https://vercel.com/docs/builds/configure-a-build#skip-build-step), [Astro's Vercel adapter documentation](https://docs.astro.build/en/guides/integrations-guide/vercel/), [WP Engine Headless overview](https://developers.wpengine.com/docs/headless-platform), [WP Engine Astro guide](https://developers.wpengine.com/docs/headless-platform/framework-guides/astro), and [WP Engine static-project guide](https://developers.wpengine.com/docs/headless-platform/framework-guides/spa).

WP Engine exposes application, environment, build, domain, cache-purge, and direct-upload APIs, making a deployment adapter plausible. It also documents automatic PR previews and redeployment of previous versions. Its current rollback guide describes a 90-day platform retention window. These are frontend capabilities; they do not prove automatic WordPress install creation, plugin licensing, domain acquisition, billing transfer, or transactional frontend-and-CMS rollback. [API inventory](https://developers.wpengine.com/docs/headless-platform), [PR previews](https://developers.wpengine.com/docs/headless-platform/platform-guides/preview-environments), [rollback](https://developers.wpengine.com/docs/headless-platform/platform-guides/redeploy-previous-version).

Model allowed deployment combinations explicitly. WordPress on WP Engine with a Vercel frontend is a natural cross-provider combination. Neon is external Postgres rather than a Vercel-only database; a WP Engine Node frontend could connect to it in principle, but account entitlement, network access, region/latency, pooling, and supported operations must be validated before that combination receives a supported badge. An Astro static frontend can consume either content source during a build without requiring database connectivity for visitors.

## CMS architecture: a shared authoring model, capability-aware adapters

Stellar should own a portable description of collections, fields, relations, page composition, navigation, validation, editor controls, and permissions intent. The schema must retain stable IDs and a backend mapping. It is a design and deployment contract, not a promise that every WordPress feature maps losslessly to SQL.

| Concern | WordPress adapter | Neon adapter |
| --- | --- | --- |
| Content schema | CPTs, taxonomies, ACF groups/fields, WordPress capabilities and plugin-owned definitions | Tables, columns, foreign keys, indexes, constraints, and CMS metadata |
| Schema changes | Generate reviewed PHP / ACF JSON and an authenticated installation or update operation | Generate migration plan and SQL; validate on isolated preview data before applying |
| Content reads | WPGraphQL for supported public fields; authenticated read path for drafts | Server-side CMS API with enforced collection, row, and field permissions |
| Content writes | Capability-checked WP bridge using supported WordPress/ACF APIs and validated custom mutations or REST routes | CMS service mutations with validation, authorization, revision records, and transactions |
| Drafts / history | Map supported WP post states, autosaves/revisions, and plugin-specific fields; test ACF revision fidelity | Explicit content revisions and draft/published pointers designed by Stellar |
| Media | WP media library IDs and metadata, or a supported external media adapter | Asset metadata in Postgres; durable bytes in a selected object/media store |
| Existing external schema | Introspect and adopt supported fields while marking unmanaged or unsupported plugin types | Read-only inspection first; explicitly adopt managed tables/columns and detect drift |
| Relations / ERD | Show logical relationships and real backend mappings; not all relations are foreign keys | Show actual constraints plus logical editor relationships |

WPGraphQL exposes opted-in custom post types and fields. ACF definitions can be authored through its GUI, PHP, or JSON and exposed through WPGraphQL for ACF. Exposure is not a complete remote schema-management and write interface. Custom field mutation support requires additional registration and write callbacks. The current ACF FAQ also states that filtering and sorting by ACF values are not provided out of the box. Consequently a product finder must not assume GraphQL introspection creates a fast faceted search API. [WPGraphQL custom post types](https://github.com/wp-graphql/wp-graphql/blob/main/plugins/wp-graphql/docs/custom-post-types.md), [ACF schema registration](https://www.wpgraphql.com/docs/acf/adding-acf-fields-to-the-wpgraphql-schema), [custom mutation support](https://github.com/wp-graphql/wp-graphql/wiki/Extending-and-Customizing), [ACF capabilities and filtering FAQ](https://acf.wpgraphql.com/).

The first WordPress bridge should support a published, narrow set of field types and compositions: text, rich text, numeric, boolean, dates, images/files, enumerations, taxonomy references, content references, and approved repeatable blocks. More complex ACF flexible content, clones, option pages, translation plugins, and third-party field types need explicit capability tests. Unsupported configurations should remain visible and explain what can be edited, rather than silently flattening them.

For each field/model, record `owner`, `sourceId`, `mappingVersion`, `schemaVersion`, and supported operations. Detect out-of-band ACF or SQL changes and present a reconciliation diff. Never resolve competing schema writers by overwriting production. Ordinary clients can edit allowed content and assemble approved blocks; model or migration privileges belong to separately authorized roles.

Convex can own collaboration, project models and working content proposals. The chosen site CMS owns applied content; proposal records preserve target IDs and base revisions, and promotion detects conflicts and reconciles failures. This permits content design before CMS provisioning without uncontrolled two-way writes. The `.stellar` handoff should identify schema/content revisions, backend mappings, and media references without credentials or an Agent Hub dependency.

### Neon isolation and schema operations

Recommend a separate Neon project for each independently owned client site or clear operational boundary, with a protected production branch and disposable preview branches. This is an operational recommendation, not a Neon requirement. Site data should not share Stellar's own control-plane database merely for convenience.

Neon documents isolated copy-on-write branches, schema-only branching, and migration workflows that test a change on a preview branch then run migrations against production. Treat branches as environments, not as an automatic bidirectional content merge system. A schema-only branch plus synthetic seed data is suitable when a developer or agent must not receive production records. Use limited runtime credentials and a separate migration credential held by the deployment coordinator. [Branching introduction](https://neon.com/docs/get-started-with-neon/workflow-primer), [schema-only branches](https://neon.com/docs/guides/branching-schema-only), [Neon migration workflow source](https://github.com/neondatabase/website/blob/main/content/guides/neon-github-actions-authomated-branching.md).

The ERD GUI should propose operations as a reviewable migration, show affected records and destructive changes, test indexes and constraints, and preserve a schema changelog. Begin with adding collections/fields/relations and safe constraints; advanced SQL and arbitrary database administration are a separate expert mode. A connected database is not itself a CMS: permissions, validation, media, editorial states, revisions, scheduling, events, and audit trails still need a service.

## Publishing pages iteratively

Separate three concepts in the interface:

- **Readiness:** whether a page has sufficient approved content/design and satisfied required dependencies.
- **Publication:** which page/content revision is publicly available.
- **Deployment:** which immutable build and configuration is serving traffic.

A project can contain 50 planned pages and publish three approved pages. Generate public routes, sitemap entries, and navigation from a release manifest that includes only published revisions. Unfinished pages stay available in authenticated preview. Publishing a new page must validate its referenced images, components, data schema, links, and menu changes, without requiring unrelated pages to finish.

For the initial portable implementation, a page-level Publish action queues a site release containing the existing published pages plus the selected change. This may rebuild the site. Astro's build-time content collection output does not update on a deployed static host merely because the CMS changed; loader refresh hooks documented for the development server are not a production publication mechanism. Current Astro source documentation also describes **experimental** incremental static builds that reuse unchanged page outputs. Evaluate that later as an optimization after the baseline release is correct; do not make the user workflow depend on experimental build behavior. [Content collections](https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/content-collections.mdx), [development content refresh](https://github.com/withastro/docs/blob/main/src/content/docs/en/reference/integrations-reference.mdx), [experimental incremental builds](https://github.com/withastro/docs/blob/main/src/content/docs/en/reference/experimental-flags/incremental-build.mdx).

Vercel ISR can refresh eligible runtime-rendered pages without rebuilding, but this is an adapter capability rather than the cross-host baseline. The Astro adapter documentation describes route exclusion, cache bypass/draft mode, and on-demand invalidation; it also notes query-parameter and middleware/cache caveats. A query-driven product finder API should not accidentally enter a cache mode that ignores its query. Exclude private previews and authorization endpoints. Cache bypass alone is not permission to view drafts. [Astro Vercel ISR behavior](https://docs.astro.build/en/guides/integrations-guide/vercel/#isr).

Each release needs a manifest containing repository commit, design-system version, schema version, included content revisions, media versions, search-index version, environment configuration references, and provider deployment ID. Queue jobs by project/environment, debounce source events, reject stale event ordering, deduplicate retries, and retain the last healthy public release on failure. Show “saved,” “approved,” “publishing,” “live,” and “failed” accurately. The published marker should follow deployment and health verification, not the first webhook.

Frontend rollback restores the serving artifact; it does not automatically reverse a database migration or restore later content. Use backward-compatible migrations, separate content version restore, and a documented recovery procedure for destructive schema changes. Search and media must remain compatible with the selected release. Set recovery targets and retention policies with the product owner instead of implying that a provider's rollback button covers all state.

## Draft previews, client editing, and media

Use authenticated preview sessions scoped to project, environment, content revision, role, and expiry. Map portal identity to permitted CMS actions; a WorkOS login does not automatically confer a WordPress capability. Keep provider and CMS service credentials server-side. Client reviewers should not need Vercel/WP Engine accounts to perform their normal portal workflow.

WordPress preview URL rewriting and permissioned content retrieval are separate tasks. WP Engine's HWP Previews plugin helps configure frontend preview URLs, while its documentation explicitly leaves framework-specific authentication and rendering to the application. Implement the Astro preview reader and authorization path deliberately. [WP Engine preview guidance](https://developers.wpengine.com/docs/headless-platform/platform-guides/post-previews).

Use host protection as an additional environment boundary when available, and ensure the QA runner has narrowly scoped access to protected previews. Vercel provides share links and an automation bypass mechanism; a bypass secret should remain in the trusted runner and never enter an agent transcript or client bundle. [Vercel preview access methods](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection).

Production click-to-edit should select a stable content/block reference and open the authorized editor. It should save a draft or a proposed change before publication, according to the user's role and project policy. A toolbar being hidden is not an authorization check. Avoid embedding private fields or drafts in public HTML, script payloads, search files, or source maps. Specify how iframe canvas selection communicates across origins, how roles are checked, and which editor controls are available to the selected block.

Media requires a first-class asset record: stable ID, source, durable rendition URLs, MIME type, dimensions/duration, alt text, caption, credits/license, focal point, locale, status, and usage references. Prevent deleting an asset still used by a published release, or require a replacement. Store private originals separately from public renditions. WP mode can retain WordPress as media owner; Neon mode needs a selected durable asset store and delivery provider. Do not assume the database stores or optimizes media automatically.

## Airtable and Sheets as optional sources

The existing Airtable content base is a good bootstrap path because it tests real reusable content. The community `@ascorbic/airtable-loader` reads an Airtable base into Astro content collections; Astro's own community-loader article lists it. Its documentation describes record/schema read scopes and generated data types. Validate the chosen package against the selected Astro release; some examples still use older content configuration paths. [Loader repository](https://github.com/ascorbic/astro-loaders/tree/main/packages/airtable), [Astro community loaders](https://astro.build/blog/community-loaders/).

Define an adapter that maps base/table/field IDs to Stellar collection/field IDs, validates records, normalizes URLs and rich text, resolves relationships, records source revisions, and supports retries and deletes. Fetch all pages of records. Select published rows explicitly. Save a release snapshot so a build is not an undocumented mixture of mutable upstream content.

Airtable attachment URLs returned by the API expire after two hours, so ingest approved assets into durable media storage during synchronization instead of embedding the returned URLs permanently. Airtable API pagination and rate-limit handling also belong in this adapter. [Airtable field model](https://airtable.com/developers/web/api/field-model), [record pagination](https://airtable.com/developers/web/api/list-records), [API errors](https://airtable.com/developers/web/api/errors).

Astro's integration directory lists `astro-sheet-loader` for publicly viewable Google Sheets. This is a reasonable public-content sample, not an authorization strategy for private client data. Private Sheets require a server-side authenticated import path. Neither a content loader nor a spreadsheet establishes CMS write-back, revisions, or page publishing automatically. Use a one-way import for the first POC and defer bidirectional conflict handling. The Google Sheets package's compatibility and implementation were not independently tested in this research. [Astro loader directory](https://astro.build/integrations/?search=loader).

## Product finder: start from query needs and bytes, not row count

Several hundred to several thousand public products do not by themselves justify Elasticsearch. Static product detail pages plus a compact public catalog projection keep the site independent of expensive WordPress filtering. Extract only published fields required for display/search and use immutable, versioned indexes.

| Strategy | Best fit | Tradeoffs and escalation trigger |
| --- | --- | --- |
| Compact JSON or chunked static index plus a browser island | Public catalogs, moderate facets, tolerable publication delay, low operational overhead | All indexed data is public. Measure payload, memory, startup, filter complexity, and mobile latency. Do not ship full rich-text bodies and every image per product. |
| Pagefind | Searching static detail pages, categorical filters, metadata, and sortable fields | Indexes generated output after the build; updates track index publication. Validate compound facets, range filtering, custom ranking, and required UI behavior before adopting as the complete product-finder engine. |
| Postgres read model / search API | Fresh data, complex relational or numeric facets, protected data, or a static payload that becomes too large | Maintain indexes and an authenticated/rate-limited API where appropriate; cache public responses and keep the marketing shell static. |
| Dedicated managed search | Measured need for sophisticated typo handling, merchandising, multilingual ranking, analytics, or larger query volume | Adds sync consistency, cost, credentials, monitoring, and vendor integration. Evaluate candidates against actual queries before selecting Elasticsearch or another service. |

Pagefind runs after a static generator and produces static search assets. Its API supports filters, sorting, and custom records, making it a strong website-search candidate and a possible foundation for simpler product finders. [Pagefind introduction](https://pagefind.app/docs/), [API](https://pagefind.app/docs/api/), [custom records](https://pagefind.app/docs/node-api/).

For a Neon-backed finder, Postgres supports indexed full-text search and trigram matching. Ordinary indexed columns and joins can represent category, range, and availability filters. For WordPress-backed catalogs needing a server API, use a derived read model/search projection instead of repeatedly joining arbitrary ACF postmeta fields on visitor requests. These are architecture recommendations, not an assertion of measured throughput. [Postgres full-text indexes](https://www.postgresql.org/docs/current/textsearch-indexes.html), [text-search tables](https://www.postgresql.org/docs/current/textsearch-tables.html), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html).

The finder spike should use representative 500-product and 5,000-product datasets, actual attribute/facet counts, image metadata, and long-tail queries. Compare first-load bytes, low-end-mobile interaction time, memory, query correctness, zero-result states, build duration, and update freshness. Keep filter state in shareable URLs, implement keyboard-accessible controls, and define canonical/noindex rules for filter combinations. Do not statically generate every facet permutation. Publish detail pages and selected useful category pages for SEO.

Define per-project freshness expectations: daily catalog updates can use scheduled releases; urgent availability changes may need a runtime read path. Bulk imports should produce one coherent index revision, and a failed index update must preserve the last healthy version with visible freshness status.

## Directus: GUI reference only

The user cites Directus as an example of approachable interfaces over content models, relationships and data. Preserve that UX lesson. Directus is not a proposed stack item, and its implementation/licensing is not a Stellar workstream. Build a focused model/table/form/relationship experience in Stellar and connect it to the chosen storage adapters.

## PhantomWP lessons

PhantomWP demonstrates the adjacency: a web IDE, visual editing, WordPress content, component library, live preview, Git workflow, and Astro deployment. Its docs describe Codespaces, Docker, and remote-container development. That supports the feasibility of browser-based authoring backed by isolated compute; it does not require Stellar to adopt its UI or implementation. [PhantomWP introduction](https://phantomwp.com/docs/getting-started/introduction).

Stellar should make the current task and next action primary: strategy/IA, page design, content, modeling, review, or operations. Show only the relevant tools, with a stable project/page context. Separate agency workspace privileges from client content editing. Make provenance and release state readable without exposing infrastructure details in every screen. A selected element should reveal its supported tokens, component controls, and content binding rather than an unrestricted wall of CSS controls.

Do not repeat the competitor's broad implication that a static frontend eliminates WordPress maintenance. It reduces visitor-facing runtime work, but the WordPress CMS, API, integrations, and credentials still need updates and operational ownership. This is an architectural observation, not an independent audit of PhantomWP's security or UX.

## Suggested milestone acceptance criteria

### POC: company Astro + WordPress/ACF site

- Reuse the inspected company repos and deployment foundations; use Lead Generation / Services — Large from the verified Airtable view. [Observed source and proposed ACF mapping](airtable-acf-mapping.md)
- Run Airtable → WP seeding through an independent portable skill/executor. Keep Convex outside this import path; use Stellar proposals for separately editable WP-owned content.
- Implement the currently absent ACF definitions and coordinate the scoped write service with the existing Abilities/MCP design task. Preserve shared source identity and enforce Airtable ownership whichever transport is chosen.
- Exercise the read/write/preview contract in Playground CLI and on WP Engine staging.
- Keep another page draft; verify responsive output, menus, sitemap, assets, conflict/retry behavior and a failed-release recovery.
- Retain genuine HTML, Vercel, Neon, generic schema generation and product-finder benchmarks as explicit remaining proofs rather than imply this small slice validates them.

### Required product milestone: both content backends and both hosts

- Create/connect and validate WordPress + WPGraphQL/ACF; import a supported existing schema; create/update a supported model and draft through Stellar; verify correct WP permissions.
- Create/connect Neon; model a collection/relation through the GUI; review a migration, test it in preview, and publish safely.
- Deploy the Astro and plain-HTML profiles to both Vercel and WP Engine Headless; exercise provider-specific preview protection, routing, logs, retries, health checks, and rollback.
- Confirm supported cross-provider combinations and show unavailable capabilities during setup before project creation.
- Demonstrate draft exclusion from public HTML, APIs, indexes, and media; verify stable IDs survive edits and releases.
- Show publish failures and source/schema drift without losing the live site or silently overwriting newer content.

### Operational expansion

- Media lifecycle, scheduling, localization, redirects, schema/SEO policies, search-index monitoring, and granular client permissions.
- Post-deployment QA jobs compare the exact deployment against the approved artifact revisions and create reviewable fixes.
- MCP/Pipes/PM synchronization uses stable external IDs, origin, revision, retry state, and loop prevention.
- Commerce is an optional adapter with authoritative price/inventory/cart/checkout services. Keep those operations dynamic and permissioned; do not treat a static content collection as transaction authority. WooCommerce or another provider should be evaluated when the first concrete commerce scope exists.

## Questions to resolve before implementation epics

1. Is the launch customer an internal agency team with client portals, or a self-service SaaS customer? This changes account provisioning, tenancy, billing, and ownership transfer.
2. Which existing WP Engine contracts include Headless capacity, and who owns/pays for WordPress installs, frontend apps, Vercel teams, Neon projects, media, and ACF Pro licenses?
3. Should clients author entirely in Stellar, or is editing through WordPress/Airtable also supported? If both, which system owns schema and how are simultaneous edits reconciled?
4. What is the acceptable time from Publish to live, and which content must update immediately? What are recovery/retention expectations?
5. Which exact ACF field types, product filters, locales, and template-content relationships exist in the first real project?
6. Are plain-HTML sites expected to receive all dynamic CMS/editor capabilities, or to be a lighter portable output using the same public content and block contract?
7. Do previews include confidential client work, and which guest reviewers need access without a full portal account?

These can be answered while the canvas/portability spike proceeds. No access to Agent Hub is required to validate the content/deployment architecture; later inspect its workflow artifact schema, tenant identity model, and handoff conventions before promising runtime parity.
