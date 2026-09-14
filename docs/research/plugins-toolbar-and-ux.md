# Plugins, toolbar, SEO, and UX research

Research date: 2026-09-13. This report distinguishes documented capabilities from proposed Stellar behavior. Sources were inspected through Context7 and primary documentation; this is not a production security or package compatibility audit.

## Recommendation

Build a small Stellar extension contract and an authenticated site toolbar. Reuse selected packages behind those contracts after testing them. Do not equate development annotations, an agent's trusted extensions, and isolated third-party plugins: they have different execution and authorization requirements.

## Package decisions

| Candidate | Verified scope | Proposed use and gap |
| --- | --- | --- |
| [astro-annotate](https://github.com/jan-nikolov/astro-annotate) | README describes a local development MVP with element annotations and structured JSON. Deployed mode is listed on its roadmap. | Useful reference for portable annotation records and pins. Not a ready-made hosted client feedback service. |
| [astro-agent-annotate](https://github.com/robertvanhoesel/astro-agent-annotate) | Development-only toolbar; source locations, notes across routes, local storage, Markdown export. | Useful developer source-location adapter. Needs shared storage, durable IDs, permissions, and revision-aware reanchoring for Stellar. |
| [astro-click-to-ai](https://github.com/angelsen/astro-click-to-ai) | Development toolbar with file captures and a bundled stdio MCP server; resource consumption and channel delivery. | Prototype capture-to-agent transport. Its local file lifecycle and destructive queue reads do not meet durable collaborative feedback requirements. |
| [seo-graph](https://github.com/jdevalk/seo-graph) | Separate runtime-neutral `@jdevalk/seo-graph-core` and Astro integration `@jdevalk/astro-seo-graph`. Core builds structured entity graphs. | Strong candidate for CMS-neutral SEO generation. Map Stellar's approved content and entity identities into it; keep an adapter so package APIs can change. |
| [Joost's explanation](https://joost.blog/seo-graph/) | Describes linking structured entities across several consumers using a shared graph engine. | Supports the proposed separation between a source-neutral SEO model and framework rendering. Validate output against actual site facts; generated markup is not evidence that claims are true. |
| [astro-meta-tags](https://github.com/patrick91/astro-meta-tags) | An Astro Dev Toolbar app for inspecting social metadata. | Optional internal developer convenience. Stellar's deployed audit should inspect the actual released HTML and store its findings. |
| [Astro-Shield](https://github.com/kindspells/astro-shield) and [docs](https://astro-shield.kindspells.dev/) | Astro integration focused on SRI and CSP. | Evaluate alongside Astro's current native capabilities and host header configuration. It is not tenant authorization, plugin isolation, or a complete security system. Test with islands, analytics, forms, preview frames, and the Stellar toolbar before adoption. |

Context7 resolved EmDash and Astro successfully. A `seo-graph` resolution returned unrelated SEO libraries; those were not substituted for the requested package. Its own repository and author's article were used instead. Small toolbar packages were evaluated from their primary READMEs; their compatibility and maintenance remain spike questions, not implementation commitments.

## EmDash lessons and limits

Current [EmDash plugin format documentation](https://docs.emdashcms.com/plugins/creating-plugins/choosing-a-format/) distinguishes sandboxed bundles from trusted native packages. Sandboxed admin UI is described declaratively; native packages can provide richer React and site rendering integrations. This is a useful model for Stellar's extension surface.

The [sandbox deployment documentation](https://docs.emdashcms.com/deployment/plugin-sandbox/) now describes both Cloudflare Dynamic Workers and a Node `workerd` runner. Consequently, “EmDash isolation only works on Cloudflare” is outdated. Runtime requirements and enforcement differ: a Node child process is not automatically suitable for Vercel functions or every managed Node host. A missing runner skips sandboxed plugins; moving them into the native list removes isolation.

The [capability documentation](https://docs.emdashcms.com/plugins/creating-plugins/capabilities/) also describes limitations. Broad content grants are not per-record authorization, and Node enforcement does not have the same CPU and memory controls as Cloudflare. Stellar needs its own tenant, project, collection, action, and user checks behind every brokered operation.

Proposed Stellar rules:

1. **Declarative extensions:** schemas, field controls, report panels, workflow definitions, block configuration, and validated SEO contributions. Render these through Stellar-owned components.
2. **Isolated actions:** third-party code runs in a dedicated extension service with a tested sandbox. A broker mediates content access, network destinations, storage, and credential use. Authorize the intersection of installer grant, actor role, workflow grant, and target scope.
3. **Trusted project code:** Astro components, build integrations, visitor scripts, and native modules enter through reviewed repository changes. Build sandboxing does not make generated visitor JavaScript harmless.
4. Pin manifest and bundle versions; record hashes, compatibility, publisher, granted scopes, settings schema, resource budgets, and migration behavior. Provide disable/revoke and audit history.
5. Reject execution if isolation is unavailable. Do not silently switch to in-process execution. Start with agency-maintained extensions and test the boundary before accepting arbitrary third-party bundles.

This is an architecture proposal inspired by EmDash, not a claim of binary compatibility with its plugin ecosystem. Hosting the extension service separately keeps generated sites portable across required hosts.

## Deployed toolbar contract

[Astro's official documentation](https://docs.astro.build/en/guides/dev-toolbar/) explicitly limits its Dev Toolbar to development. Stellar therefore needs a separate optional browser client for staging and production, plus a shared backend.

The toolbar should support feedback, authorized content edits, page/release identity, last audit results, metadata/schema inspection, and a request for an agent change. Source-code modification launches a workspace change; content modification targets the configured CMS draft endpoint. Neither should mutate the public DOM and pretend the source is saved.

An annotation stores project, environment, deployment, route, viewport, locale, stable block/field identity where available, fallback selector, screenshot or region, author, status, and the originating content/code revision. If the target changes, mark it stale or ask for reanchoring rather than guessing.

Use a short-lived, site-scoped session established from Stellar sign-in, exact allowed origins, and server-side authorization for every read/write. No WP application passwords, database URLs, repository credentials, or source maps are sent to public visitors. Static page source may contain opaque edit bindings; detailed source paths and drafts are resolved only after authorization. Do not rely on third-party cookies across client domains.

The public site must load and remain functional if Stellar is unavailable. Keep privileged toolbar assets and connections outside the anonymous critical path. Report audits with their timestamp and release; Lighthouse lab output is distinct from field performance data and may be unavailable for a new site.

## UX interpretation of supplied mockups

Reviewed both HTML sources and browser screenshots at 1600 × 1000:

- [Design mode source](../apex-studio-design-mode.html): agency workspace rail, conversational task, artifact workspace, Preview/Source/Versions, provenance, responsive preview controls. Useful direction for Agent Hub's context-to-artifact handoff.
- [CMS source](../apex-web-cms.html): site-centric navigation, component palette, rendered canvas, selected-block actions, agent panel, deployment status. Useful direction for Stellar's primary authoring experience.

These are inspiration, not accepted specifications or proof of implemented functionality. Both use fixed panel widths. In the CMS mockup, the second viewport and some controls extend beyond the visible canvas; the persistent agent, connection, and plugin cards compete with editing space. The design mockup allocates most width to chat; that suits ideation but should not be the default for detailed screen construction.

Recommended changes for the PRD:

- Agency workspace: one main project navigation, a canvas/list/diagram workspace, and one contextual inspector with an agent toggle. Allow resizing and hiding panels, a large single-viewport edit mode, and overview mode for comparing screens.
- Show project and preview/live state persistently. Keep framework, backend, credentials, plugins, and hosting in project setup or relevant settings.
- Clients enter a role-specific portal: Pages, Content, Media, Requests, Reports. Show approved sections, field controls, and layout variants; make developer token editing a separate permission.
- Replace the mockup's casual “Switch to Postgres” action with a migration workflow. Replace its Astro/HTML switch with a creation-time target and an explicit conversion/export action with a compatibility report.
- Avoid implying Agent Hub is required through a permanent “Synced” badge. Show handoff provenance only when a project was imported or linked.
- Treat desktop authoring and mobile client review as separate responsive requirements. Do not squeeze the entire design studio onto a phone.

Browser reference captures are stored under `output/playwright/`. No mockup source was changed.

## Validation before choosing dependencies

Create one responsive Astro page and one actual HTML project. Capture a comment on a repeated product card, revise the layout, resolve its identity, authorize a field edit, publish, and confirm that the released page and audit correspond to the same revision. Test unauthorized access, changed roles, copied preview URLs, concurrent comments, stale targets, CSP, and an unavailable Stellar backend.

For plugins, execute harmless fixtures that attempt an ungranted content read, another tenant's record, direct network access, secret access, and an over-budget run. Every attempt must be denied, terminated, or isolated as specified, with useful audit evidence. This is a required implementation validation plan, not testing performed by this research task.
