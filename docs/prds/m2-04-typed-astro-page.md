# M2-04 — Typed Astro page and draft preview

Status: proposed local PRD. Local identifier M2-04. Parent: [M2 index](m2.md). Implementation belongs in `altitudemarketing/altitude-astro`; offline work may run in parallel, while live acceptance waits for M2-03.

## Overview

Replace the placeholder with one representative, responsive Services — Large page backed by typed WPGraphQL data and a deterministic offline fixture. Provide public published reads and an authenticated, non-public draft preview keyed by WordPress identity. This PRD does not seed WordPress, define ACF, publish content, complete global navigation/footer, or claim final Figma parity.

## Prerequisites

- M2-01 provides the versioned logical plan, synthetic import fixture and source provenance. M2-04 owns a separate proposed GraphQL response/view-model fixture; the offline component/query slice can start once that shape is agreed with the M2-02 schema owner. An import fixture is not a WPGraphQL response.
- M2-02 owns the committed WordPress SDL. Generated Astro types and live schema acceptance must use its approved version; stale local types are insufficient.
- M2-03 fixture import/readback is required before live query/render acceptance. A narrowly scoped draft-read identity is configured outside source control.
- Read the Astro repository intake and reconcile its clean baseline. Preserve the existing standalone Node start contract; never add a committed `PORT` value or recreate the Headless application.

## User Stories

- As a visitor, I want a responsive published company page that never exposes drafts.
- As a reviewer, I want an authenticated preview of a selected draft without making it publicly cacheable.
- As a developer, I want builds and tests to use committed schema/fixtures so ordinary CI does not depend on live introspection.

## Technical Requirements

### Endpoints and routes

Add one canonical public route for the representative page and one authenticated preview route keyed by stable WP ID, with an explicit preview session/token contract. Public requests query published state only. Preview verifies authorization server-side, fetches the requested draft and sends `Cache-Control: private, no-store`; unauthenticated or wrong-environment access does not reveal whether another draft exists. Declare whether the first public route is SSR or prerendered. If prerendered, content freshness is not claimed until M2-06 wires and verifies rebuild.

### Interface

Render the seven declared body sections that have validated data contracts, with clear fallback/error treatment for deliberately missing optional content. Preserve semantic CSS variables and responsive behavior at 390, 768 and 1440 CSS pixels. Show preview-only identity, draft/content revision and observed timestamp outside the public page chrome. Do not fabricate taxonomy, links, global navigation/footer, final copy, final tokens or unimplemented blocks to make the page appear release-ready.

### Data model

Own `src/lib/wordpress/**`, `src/components/sections/**`, the representative `src/pages/services/[slug].astro`, `src/pages/preview/[id].astro` and focused fixtures/tests in `altitude-astro`; generated-file paths follow that repo's codegen configuration. Pin generated output to the committed SDL hash and record content/schema versions in the view model. Preserve stable IDs, section order, media attachment identities, alt text and source ownership metadata needed later by Stellar selection.

Page state distinguishes `fixture`, `draft-preview`, `published`, `stale-schema`, `unavailable` and `invalid-content`, each with observed time and source/schema revision. A missing draft caused by bad preview credentials must not be reported as “no content” without an explicit authenticated-access check.

### Integrations

Consume WPGraphQL only; do not add an Airtable loader or require Stellar/Convex. Generate types from committed SDL without ordinary live introspection. Keep preview credentials server-only and out of `PUBLIC_*` variables/browser bundles. Use the repository's generated `src/styles/globals.css` as the site token contract; do not hand-edit it. A small test fixture must allow offline build and deterministic visual tests.

## Acceptance Criteria

- [ ] M2-04-A: Committed GraphQL documents and generated types match M2-02 SDL; schema hash mismatch or missing required fields fails before deployment.
- [ ] M2-04-B: Offline fixture build renders the representative sections in declared order with stable IDs, text/media/alt data and responsive layouts at 390/768/1440.
- [ ] M2-04-C: Public reads exclude drafts. Authorized preview by WP ID renders the chosen draft with private/no-store caching; unauthorized, expired and wrong-environment sessions reveal no protected content.
- [ ] M2-04-D: Network, GraphQL error, null draft caused by revoked credentials, invalid required media and schema drift have distinct safe states with observed timestamps and retry guidance.
- [ ] M2-04-E: Live acceptance reads the M2-03 fixture from WordPress, matches the readback manifest and renders without Airtable, Stellar or Convex running.
- [ ] M2-04-F: An ordinary build contains no preview credentials, editor instrumentation or temporary Airtable URLs; release readiness remains blocked by recorded content/navigation/taxonomy gaps.

## Testing Plan

Unit-test query normalization, section ordering, validation, cache policy and safe error mapping. Build offline against the committed fixture. Browser-test public and authorized preview at required widths, keyboard flow and missing media. After M2-03, test published exclusion, explicit authenticated draft access and readback identity against the disposable WP fixture, then staging only when authorized. Run all Astro repository lint, both typechecks, tests, build and audit commands.

## Rollback Plan

Revert the route/query/components together and restore the prior placeholder while retaining the SDL and fixtures for diagnosis. Disable the preview route or credential before investigating an authorization/cache defect. A content rollback belongs to WordPress; this PRD never mutates it.

## Timeline

1. Build typed normalized view and components against the offline fixture: first parallel slice.
2. Add public/preview routes, cache/auth tests and responsive browser evidence.
3. Replace fixture transport with live M2-03 readback for integration acceptance; keep fixture CI.

## Dependencies On Other Work

Offline work depends on M2-01. SDL/codegen depends on M2-02. Live acceptance depends on M2-03. The stable rendered IDs and preview route enable M2-05; M2-06 owns prerender rebuild and staging release evidence.

## Agent handoff

- **Owned:** `src/lib/wordpress/**`, `src/components/sections/**`, the representative service and preview routes, generated GraphQL types, offline fixtures and focused tests in `altitude-astro`.
- **Excluded:** WordPress schema/import, Airtable access, Stellar UI/runner, design-token generation, full navigation/footer, publication webhook, deployment and production changes.
- **Review gates:** schema/codegen review after M2-02; security/cache review for preview; responsive human review after real content, separate from final Figma or release approval.
