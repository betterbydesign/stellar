# Stacki and Lumos: portability research for Stellar

Research date: 2026-09-13. Inspected checkout: `stellar`, commit `800fa5270523e7df3afbcaeee8bdbb3a6fe07b49`, package version `0.1.25`. The local origin is `https://github.com/betterbydesign/stellar.git`; this report evaluates the cloned code at that revision, not an assertion that it matches upstream HEAD.

Bootstrap update, 2026-09-14: this source is now preserved in the adjacent `stacki-reference` checkout at the same commit. Stellar's current application is a new web foundation. The implementation observations below describe the preserved Stacki revision; source links point to that revision upstream.

## Recommendation

Build Stellar as a **web application with isolated remote project workspaces**. Reuse and extract Stacki's editing engine, canvas interactions, style controls, and useful content primitives. Treat its Electron main process as a map of services to replace, not as a backend ready to expose over HTTP. Use Lumos for Astro as the first supported design-system package, pinned to a reviewed commit. Keep the package contract open to custom systems and true HTML projects.

This fits the requested client portal, shared reviews, notifications, unattended agents, and deployments better than requiring every client to install Node, Git, a desktop builder, and local credentials. An optional desktop/local-workspace companion can later reuse the same service contracts for offline work or agency developers. That is a product/architecture recommendation, not a completed portability proof.

Stacki already provides substantial useful code, but it does **not** provide Stellar's multi-tenant SaaS, database CMS, workflow engine, safe plugin runtime, or deploy orchestration. Its official description confirms that it opens local Astro projects and intentionally has no cloud account or proprietary project format. [Stacki introduction](https://stacki.build/docs/introduction/)

## What the checkout actually contains

| Area | Observed implementation | Reuse assessment |
| --- | --- | --- |
| Browser-renderable application | React 18, Vite 6, CodeMirror, xterm, extensive JSX/TSX panels; Electron is the application entry point. [Package](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/package.json#L1) | Reuse UI selectively. A Vite build produces renderer assets, not a functioning hosted editor. |
| Source editing model | Custom Astro parser/serializer handles elements, components, nested children, text, raw scripts/styles, expressions, loops, conditions, props, and slots. Unrepresentable markup falls back to code. [Parser](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/astroParser.js#L1) | Valuable core, but not an official compiler AST or a universal lossless parser. Separate filesystem-dependent helpers from parsing and mutation operations. |
| Canvas | Real rendered pages in iframes; zoom/pan and side-by-side desktop/tablet/phone frames. [CanvasView](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/src/panels/CanvasView.jsx#L4) | Reuse layout and interaction primitives. **The multi-frame canvas is view-only**; editing currently happens in single-device mode. Multi-screen interactive canvas remains work. |
| Selected-element bridge | Electron preload in child frames reports geometry, selection, keyboard state, computed styles, and page height; parent receives messages. [Preload](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/preload.js#L3) | Move browser-safe instrumentation into a preview-only script. Do not carry the privileged Electron preload into SaaS. |
| Preview source mapping | Generated Astro/Vite config inserts markers in development and patches rendered pages to preserve interaction state. [Generated integration](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/main.js#L3380) | Extract into a versioned Astro integration; test on each supported Astro version. Preserve clean production output. |
| CSS variables | PostCSS reads variables, selectors, themes, comments, and source positions from stylesheets; GUI and IPC support add, rename, move, and edit. [Reader](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/cssVars.js#L5), [operations](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/preload.js#L1852) | Strong foundation for manual tweaks and token editing. Needs semantic token types, permissions, dependency/alias graph, validation, and reviewed migrations for Stellar. |
| Components and props | Component discovery and schema extraction feed visual fields; selected properties and structural edits write source. [Scanner](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/main.js#L1468), [page read/write](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/main.js#L2664) | Reuse for developer mode. Curate a stricter block manifest for client mode rather than expose every inferred prop and arbitrary CSS field. |
| Local CMS | Local JSON/source data and Astro collections have GUI operations; content introspection bundles and executes project configuration. [CMS bridge](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/preload.js#L1841), [introspection](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/contentConfig.js#L6) | Useful schema/forms and file adapters; not a WordPress or SQL admin backend. Introspection belongs inside the project sandbox. |
| Starter creation | A starter registry currently contains Lumos and runs its scaffolder with `lumos@latest`; native shell handles install and Git. [Starter](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/starter.js#L19) | Replace floating versions with reviewed blueprint manifests, commit hashes, compatibility metadata, and reproducible dependency locks. |
| File persistence | UI saves are serialized per page/file, with debounce and error handling. [Persistence](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/src/pagePersistence.js#L1) | Reuse mechanics, but add optimistic concurrency/revision checks. Single-process ordering does not resolve simultaneous user/agent edits. |

The README's final description of a flat list of self-closing components is stale relative to both the code and the current website's tree model. Use the inspected parser and tests for scope decisions. The official editing document describes source-preserving saves and development-only markers, but its published corpus statistic is not the local checkout's result. [Stacki editing model](https://stacki.build/docs/how-editing-works/)

## Local validation and limits

Executed the existing `scripts/roundtrip-report.js` and `test/roundtrip.test.js` without installing dependencies or changing product code:

- **33 corpus files; 28 byte-identical round trips (85%); five formatting rewrites (15%); zero crashes; zero code-only fixtures.**
- Test runner: **165 passed, zero failed, one skipped**. The skipped check requires an external project corpus.
- Passing tests explicitly accommodate known formatting defects. They do not prove fully lossless editing or arbitrary-project compatibility. [Known expectations](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/test/expectations.json#L1), [test contract](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/test/README.md#L25)

The report labels the five defects as formatting, not semantic corruption. That classification comes from the fixtures and expectations, not a fresh browser equivalence check. No full application build, Electron/browser interaction test, real Lumos project import, cloud sandbox integration, or deployment was performed in this research subtask. `node_modules` was absent.

## Astro versus HTML is a real product distinction

The project scanner accepts `.astro` and page Markdown/MDX; it does not treat a plain HTML repository as a first-class project. [File discovery](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/main.js#L936) The parser can edit external HTML fragments when an Astro file imports `.html?raw` and inserts them with `set:html`. That proves useful fragment support, **not a standalone HTML builder**. [HTML chunks](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/astroParser.js#L2914)

Specify two explicit project adapters:

1. **Astro adapter:** Astro source, component props/slots, collections, injected development source mapping, Astro build.
2. **HTML adapter:** actual `.html`/CSS/JS source, document/fragment parser, block-instance metadata, preview server and static output pipeline with no requirement to convert the project to Astro.

They should share selection, responsive frames, design-system metadata, block insertion, commands, history, and review UI. An Astro site producing static HTML at build time does not by itself fulfill the user's request to design/build HTML projects. Arbitrary imported code may fall back to code view; supported Stellar blueprints must remain visually editable.

Also distinguish a free canvas of independent page/screen artifacts from the existing canvas's multiple responsive views of **one page**. The former requires persistent screen positions, route linkage, screen-to-page promotion, and explicit wireframe/high-fidelity/prototype states.

## Lumos fit and constraints

Context7 resolution found `/lumosframework/lumos-for-astro` and queried its current docs. Stacki resolution returned unrelated STACKIT cloud products, so Stacki research used the checked-out source and official website instead. The Lumos website could not be opened by the web tool; its official GitHub sources were accessible.

Lumos for Astro uses plain CSS/custom properties and composable Astro components. Its base stylesheet provides fluid typography and spacing, color/theme aliases, and common layout values. These map well to token editing and constrained block composition. [Lumos base stylesheet](https://raw.githubusercontent.com/lumosframework/lumos-for-astro/main/src/styles/base.css)

Its documented conventions prefer component variants and shared defaults, keeping custom styling with components and coordinating breakpoints. Stellar should capture those rules in a design-system package manifest that both agents and GUI edits follow. Do not conflate Lumos for Astro with the separate Webflow product. [Lumos conventions](https://raw.githubusercontent.com/lumosframework/lumos-for-astro/main/LUMOS.md), [official agent guidance](https://github.com/lumosframework/lumos-for-astro/blob/main/CLAUDE.md)

The official README explicitly calls the framework beta, with component prop APIs still changing, and describes commit provenance and reviewed three-way upgrades. The package observed during research declares `0.0.3`, Astro `^7.2.9`, and Node `>=22.12.0`; do not assume Stacki's old Node 18 README minimum is sufficient for a new Lumos project. Pin a compatible toolchain and blueprint commit; validate upgrades on representative sites before promotion. [Lumos README](https://github.com/lumosframework/lumos-for-astro), [package metadata](https://raw.githubusercontent.com/lumosframework/lumos-for-astro/main/package.json)

Lumos CSS tokens can conceptually style HTML, but its Astro components are not direct browser-executable HTML components. A Lumos-backed HTML blueprint needs explicit emitted HTML/block implementations and parity tests; that implementation has not been verified.

Recommended design-system contract: stable package ID/version, token definitions and aliases, CSS mapping, themes/modes, responsive rules, components/slots/variants, content constraints, role-specific editable controls, agent guidance, accessibility checks, migrations, and source/license provenance. Store project customizations as owned source plus explicit package provenance. Do not use an opaque proprietary canvas document as the only copy of a deployable site.

## Web extraction and trust boundaries

Electron exposes `window.avb` methods for native dialogs, filesystem reads/writes, dependency installation, assets, content, Git, terminals, and preview operations. [Bridge](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/preload.js#L1789) Main-process handlers often accept absolute file paths and operate directly on disk. [Write handler](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/main.js#L2709) The desktop UI is not evidence of tenant authorization or safe remote execution.

Recommended decomposition:

- **Stellar control plane:** identities, organizations, project access, CMS models, workflows, comments, audit/release state; may share Agent Hub's architectural conventions without requiring Agent Hub availability.
- **Editor engine:** source model, typed edit commands, token/component contracts, revision-aware mutations. Agents and GUI call the same command/validation layer.
- **Project workspace:** isolated checkout and dependency environment, scoped filesystem and Git services, Astro/HTML preview, compilation, tests and agent tools. Execute project configuration here; a child process alone is not a security sandbox. The current introspection worker inherits process environment. [Worker launch](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/contentConfig.js#L213)
- **Preview origin:** separate origin per workspace/session; browser-safe instrumentation; validated message origins/sources and session capabilities. Preview code must not receive the app's auth cookies, database credentials, privileged filesystem API, or deployment secrets.
- **Release service:** immutable source revision + content snapshot/version + approved environment; build, validate, deploy and record provenance independently from the editor's autosave state.

Do not put long-lived dev servers, package install processes, or terminals in ordinary request handlers. Provision a workspace runner and proxy its preview/events to the web application. Provider selection remains a separate architecture decision.

Keep editor node identity distinct from parser-local IDs: the parser currently generates incrementing `n...` IDs. [Node IDs](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/astroParser.js#L27) Feedback and Stellar handoffs need durable artifact IDs plus source revision, file, component/block identity, and fallback locator information so comments survive refactoring.

## Templates, licensing, and external data

Stacki's local LICENSE is MIT and permits modification/distribution subject to preserving its notice. Lumos's official license is also MIT. Preserve source notices and package attribution; a fork that ships a desktop wrapper must change the application's identity and update feed as directed in Stacki's README. This is a source-license observation, not an audit of every transitive dependency, font, photo, paid template, or trademark. [Stacki license](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/LICENSE#L1), [fork release instructions](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/README.md#L75), [Lumos license](https://raw.githubusercontent.com/lumosframework/lumos-for-astro/main/LICENSE)

A Stellar blueprint must separately declare rights/provenance for its template source and assets, supported renderer/design-system versions, CMS schema/mapping, content seed/import policy, required plugins, and deployment compatibility. A source repo's MIT license does not establish the rights for an unrelated client template or asset.

**Clarified 2026-09-14:** Stacki currently gives CMS file editing only to Astro's built-in `glob()` and `file()` collections. Other loaders are classified as custom; the CMS adapter returns no entries and provides no source-write path for them. This is a replaceable Stacki adapter limitation, not an Astro restriction. [Classification](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/content/introspect.mjs#L35), [entry behavior](https://github.com/flowtricks/stacki/blob/800fa5270523e7df3afbcaeee8bdbb3a6fe07b49/electron/contentEntries.js#L109)

Stellar can supply its own read loader and an authenticated source-write adapter. Astro's content store is a read/build cache; changing it alone does not update the upstream CMS, and a later refresh may replace cache changes. Loaders may update incrementally or clear/reload; clearing on every sync is not required. Source writes need stable IDs, schema mapping, per-field capabilities/ownership, guarded revision checks and readback followed by a preview refresh or rebuild. [Astro loader API](https://docs.astro.build/en/reference/content-loader-reference/)

For the confirmed company POC, Airtable seeds WP/ACF outside Stellar and Astro reads WPGraphQL. No Airtable-to-Astro loader is required. Preserve Airtable authority over mapped fields while enabling authorized edits to WP-owned fields through a scoped WP adapter. A future explicit ownership handover is separate from implementing an editable collection UI. [Refined architecture](../decisions/002-shared-foundation-media-and-integrations.md)

## Required proof spikes before implementation estimates

| Spike | Concrete acceptance |
| --- | --- |
| Remote browser editor | Open a pinned Lumos repo in browser against an isolated remote runner; select element, change prop/token, save, see HMR/patch update, reload, and reproduce identical Git state. No native Electron API available. |
| Source preservation | Run checked-in corpus plus representative agency/Lumos pages; identify unsupported shapes before edits; no silent semantic changes; fix or explicitly gate all no-op rewrites. Cover frontmatter, aliases, fragments, nested slots, loops, scripts/styles, Markdown/MDX and client islands. |
| Plain HTML | Create/import a genuine HTML/CSS/JS site, insert/reorder an approved block, edit text/tokens at three widths, build/serve output without adding Astro. |
| Canvas scope | Multiple independent pages appear as persistent screen artifacts; each has responsive previews; selection/edit behavior is consistent across frames; publish one page while another stays draft. |
| Token enforcement | Change an alias/primitive and a component variant, display impact across pages, preserve project overrides, and reject forbidden client edits using the same server-side rules for agents and GUI. |
| Concurrency | Agent and human edit the same file/token; stale writes fail with a reviewable conflict or merge; reconnect/undo never silently overwrites committed changes. |
| Preview isolation | A deliberately hostile project script cannot access portal session data, another project, workspace host files, or privileged messages. Block path traversal, forged frame messages and cross-tenant event access. |
| Reproducible blueprints | Two workspaces with the same blueprint/content revision produce equivalent output; scaffolders and dependencies cannot float unexpectedly. Upgrade a customized Lumos site using reviewable diffs and screenshot comparison. |
| CMS provenance | Show a read-only Airtable/Sheets-backed collection accurately, then demonstrate either a scoped writeback or an explicit import-to-owned-content flow. Test deleted records and ID mapping. |
| Real performance | Measure browser input-to-preview latency and memory with representative agency pages, nested components and several responsive frames; establish product SLOs from the result instead of assuming desktop latency holds over the network. |

Unresolved product decisions to bring into the PRD: whether clients may edit layouts beyond approved blocks; how global-token edits are reviewed; whether design-mode screens can diverge from executable pages; what constitutes an approved partial release; and whether offline/local-only work is a launch requirement. None requires choosing desktop as the default today.
