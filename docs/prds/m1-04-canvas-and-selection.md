# M1-04 — Project shell, responsive canvas and source-linked selection

Status: implemented and reviewed locally; integrated browser acceptance passed on 2026-09-14. Local identifier M1-04. See the [integration review](../handoffs/m1-editor-review.md) for evidence and limits. User visual review remains open.

## Overview

Replace the starter page with the first useful studio workflow: choose a registered project, open a page, view its real Astro output at responsive widths and click an element to inspect its source identity. The milestone uses one active editable frame. A free-positioned multi-page canvas, structural dragging and simultaneous multi-frame editing remain later work.

The shell should feel focused: project/page navigation, a large preview area, a compact viewport/mode toolbar and a contextual inspector region. Use the existing app's semantic tokens and the supplied design mockups as inspiration, not as an instruction to import every navigation item or Agent Hub screen.

## Prerequisites

- M1-01 shared contracts and fixture are frozen; M1-02 opens real sessions; M1-03 supplies revision-scoped source models and target capabilities.
- Review [design-mode mockup](../apex-studio-design-mode.html), [CMS mockup](../apex-web-cms.html), the [Stacki screenshot](../Stacki%20screenshot.png) and [source research](../research/stacki-lumos-portability.md). They are design references; PRD scope and current user instructions govern behavior.
- Read current Astro integration documentation before implementing development instrumentation. No hosted account or Figma file is required for M1; if a Figma reference is later supplied, record the exact frame used for review.

## User Stories

- As an editor, I want to open my project and switch pages without seeing CMS or deployment settings I do not need yet.
- As a designer, I want exact viewport widths and element selection so I can inspect responsive behavior using the rendered page.
- As a developer, I want selection to distinguish an editable source target from generated or ambiguous markup.

## Technical Requirements

### Endpoints and routes

Own `/projects` and `/projects/{projectId}/studio`; the root entry leads into the project list. Preserve the selected page, viewport and inspect/interact mode in navigation state without leaking session capabilities into shareable URLs. Deep links resolve the project on the server and recover a new session if necessary.

Consume M1-02 endpoints; do not create parallel source or session APIs. Use a frontend session client under `apps/web/features/studio` with one state owner for project, session, page, revision, preview generation and selection. Late responses from a previous project/page/generation must be discarded.

### Interface

Show available registered projects, opening progress, no-project state, unavailable runner, compilation failure and retry. A selected project opens a page list, canvas and inspector placeholder. Use real data and hide unimplemented IA/content/deployment tools rather than presenting controls that cannot work. Retain source on session failure.

The toolbar supports 390, 768 and 1440 CSS-pixel presets, an integer custom width from 320 to 1920, fit-to-area scaling and 100% view. Preview width refers to the iframe's layout viewport before zoom scaling. Switching width must change media-query behavior, not only shrink a screenshot. The studio itself adapts to narrow browser windows; panels may collapse while the chosen website viewport remains explicit. Site responsive behavior and studio-responsive layout are distinct checks.

Inspect mode intercepts clicks for selection and suppresses site navigation/form actions; interact mode lets the website behave normally and hides selection interception. The active mode is visible and keyboard accessible. Returning to inspect mode restores a valid selection or explains its loss. Do not intercept shortcuts while the user types in a control.

Highlight hovered/selected elements with outlines that do not affect document layout. Geometry must remain aligned after scrolling, resizing, zooming and preview updates. Nested targets offer a parent/breadcrumb path and a keyboard-accessible target list or equivalent selection action. Escape clears selection. Unsupported elements show their reason; selecting one never falls back to an unrelated editable ancestor silently.

The inspector shell displays the element/component label, page, source file, current revision and editable/read-only status. M1-05 owns actual style controls. Selecting another project/page or a new preview generation invalidates stale inspector state immediately.

### Data model

Keep durable page/element anchors separate from rendered occurrence and parser-local IDs. The bridge supplies the observed DOM occurrence; it is joined with M1-03's source model and component boundary before a target can be editable. The pure parser does not derive runtime occurrence counts. Repeated component internals may share a definition but still represent different DOM occurrences; ambiguous source-write scope remains read-only in M1.

Preview metadata is transport data, not the authoritative source model. A frame cannot supply its own write permission, filesystem root or trusted declaration range. The shell reconciles its selection message against the server's source model for that revision.

Only preferences such as viewport/panel state may use browser storage. Saved website styles, project source and edit receipts are server/runner state. Never treat a browser-cached source model as fresh after reopening.

### Integrations

Own `packages/astro-editor-integration` and the browser bridge. Inject source markers and instrumentation only in an explicitly enabled editor **development** session. Current Astro's `astro:config:setup` exposes the command and allows Vite extension/injected scripts; `astro:server:setup` is development-only. Guard all injection/transforms by command and editor-session configuration. Using an injection API alone does not make its output development-only. [Astro integration reference](https://docs.astro.build/en/reference/integrations-reference/)

Use M1-03's source model to map instrumented output. Do not permanently rewrite authored page markup or the ordinary project config to add source markers. Build output and an ordinary non-editor dev session must not contain the bridge, session capabilities, debug endpoints or editor source paths.

Bind each bridge connection to the exact expected origin, iframe window, project, session, preview generation and frame ID. Validate payload shape/version, source revision and permitted message types; use exact message target origins rather than wildcard destinations. A ready message from an old frame cannot mark a new preview ready. Frame-originated messages report selection/geometry and never invoke apply, filesystem or terminal operations.

Coordinate the integration launch option and separate preview hostname with M1-02. Module imports must resolve from committed Stellar packages, never the adjacent Stacki reference. Copy browser-safe Stacki primitives selectively with notices/provenance; the Electron preload/`window.avb` bridge is not a browser backend.

## Acceptance Criteria

- [x] M1-04-A: Open both registered projects, select Home/Contact, retry a failed preview and reopen a stopped session using actual runner responses.
- [x] M1-04-B: The page renders at 390/768/1440 and an intermediate width with correct media behavior. Fit zoom and 100% maintain matching selection geometry.
- [x] M1-04-C: Clicking unique/nested elements resolves the correct page, source target and occurrence; unsupported/shared ambiguous cases remain read-only.
- [x] M1-04-D: Inspect/interact switching, page links, scroll, resize, keyboard selection and Escape behave consistently without changing site layout.
- [x] M1-04-E: Stale frame messages, wrong origins/windows, malformed payloads and mismatched projects/revisions cannot select an editable target or trigger a write.
- [x] M1-04-F: Reload/restart and rapid project/page switching cannot display stale editable state from a previous session.
- [x] M1-04-G: A clean fixture build and ordinary non-editor preview contain no editor markers, capabilities or injected bridge. Screenshot evidence identifies the source revision and widths.

## Testing Plan

Unit-test the bridge validator and shell state transitions; integration-test real development marker mapping. Browser-test the actual app/runner at all three website widths and a narrow studio window. Include a repeated component, nested element, scrolling, scaled canvas, failed compilation and rapid navigation. Inspect production assets for editor identifiers. Mocks may exercise failures but do not replace the real selection demonstration.

## Rollback Plan

Disable the editor integration and revert the studio/instrumentation changes together, leaving registered project source untouched. Stop the affected session rather than altering ordinary site config. Return users to the project list on unsupported bridge protocol versions. No deployment rollback is configured.

## Timeline

1. Project list, studio shell and one real page: first visible slice.
2. Exact responsive frames and explicit inspect/interact modes.
3. Source-mapped selection with message validation, keyboard access and stale-state recovery; hand off the stable selection API to M1-05.

## Dependencies On Other Work

M1-01 through M1-03 are required for completion. M1-05 owns controls; M1-06 owns history UI and full workflow evidence. Do not prebuild the broader product's canvas/IA/CMS navigation.

## Agent handoff

Own studio/project-list routes, `apps/web/features/studio/**`, `packages/astro-editor-integration/**`, bridge tests and the implemented studio guide. Coordinate edits to the root entry and app CSS using existing tokens. Do not modify runner source-write logic, engine parsing, shared contracts, fixture semantics or inspector internals. Deliver the selection/session state API, browser screenshots, exact supported mapping cases and evidence that clean output remains independent. Use SOL high; agree shared shell extension points before M1-05 starts.
