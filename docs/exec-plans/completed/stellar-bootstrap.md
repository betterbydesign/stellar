# Stellar repository bootstrap

## Context

The user authorized initial commits, folder reordering and integration of the supplied Altitude harness. Work is on `codex/stellar-bootstrap` in Stellar. The repo initially contained the Stacki application and untracked Stellar research and mockups. The user confirmed employee status in Pennsylvania, USA; the intended personal-ownership and company-use arrangement remains unresolved. See [bootstrap plan](../../BOOTSTRAP-PLAN.md).

## Goals

- Preserve research, reference source, Git history and third-party notices.
- Establish a standalone web workspace and working development harness.
- Verify installation, build and responsive rendering; make the requested local commits.

## Non-Goals

No working canvas, account system, agent runtime, CMS import, deployment or Agent Hub code reuse is included. No push, PR, merge or company-site change is requested.

## Scope

Root layout, `apps/web`, root npm commands and lockfile, local CI definition, harness instructions/adapters/scripts/tests, documentation and provenance. Adjacent Stacki and harness checkouts preserve the supplied sources.

## Plan

1. Inventory and preserve local research and source references.
2. Make the research commit; replace the root application with the web workspace.
3. Adapt and validate the supplied harness without inheriting company integrations.
4. Validate a clean dependency install, build and browser rendering; review and commit the bootstrap.

## Progress

- 2026-09-14: verified Stacki's original tracked files against the adjacent reference at commit `800fa5270523e7df3afbcaeee8bdbb3a6fe07b49`; preserved its MIT notice and existing history.
- 2026-09-14: commit `01d43eb` preserved the research, mockups, selected screenshots and ignore rules.
- 2026-09-14: created the Next.js workspace, local CI definition and adjacent harness checkout at commit `e629ae2ad1d1e8e08a4e202af243c26ba6f51c20`; installed the reviewed local harness adaptation.
- 2026-09-14: clean installation, full verification and production build passed; responsive browser inspection and independent review completed. The final bootstrap commit records this completed implementation.

## Surprises & Discoveries

The supplied harness assumes Astro or WordPress, two long-lived branches and configured external services. A documented local schema/profile adaptation was required. ESLint 10 exposed removed context APIs in the Next React rules; the official compatibility wrapper resolves that mismatch. The docs scanner also mistook pinned source URLs for high-entropy secrets and omitted untracked files in all-files mode; a narrow local adaptation and regression coverage address those findings.

## Decision Log

- 2026-09-14: keep source references adjacent and preserve ancestry instead of rewriting repository history. The product has no sibling build dependencies.
- 2026-09-14: use `apps/web` for a minimal Next.js shell; defer packages until the first editor proof needs them.
- 2026-09-14: retain explicit null tracker, reviewer and deployment integrations. The bootstrap must not claim live services or inherit company coordinates.
- 2026-09-14: preserve upstream notices and document unresolved ownership without asserting an exclusive ownership grant.

## Validation

The clean `npm ci` succeeded with no reported vulnerabilities; it reports a deprecation warning for an ESLint 9 peer dependency retained by upstream packages. The app's configured linter runs ESLint 10 with the compatibility wrapper. Production build passed after the clean install. Browser inspection at 1280px and 390px verified three-column and single-column workflow layouts, no horizontal overflow and no logged warnings or errors. The temporary server was stopped and viewport reset after inspection.

`npm run verify` passed: profile schema and path/command validation; strict integrity check of the 35 installed harness files; all 46 Markdown files scanned without findings; lint; generated route types and TypeScript; all four regression tests. Tests cover unsupported profile claims, missing required paths, scanning new documents, structural source links and secret detection. Independent SOL high review found no remaining blocking issues after the scanner fixes. Company-site and reference checkouts are clean and unchanged from their recorded source revisions. No remote CI result is claimed.

## Outcomes & Retrospective

The requested foundation is complete: research and notices preserved, source references separated, runnable web workspace and adapted development harness installed, and local commit preparation validated. No Stacki editor module has been ported yet. The next product milestone is the fixture-project shell and a source-preserving browser edit proof. The WP/ACF import remains an external POC workflow as specified in the PRD. Ownership and commercial licensing remain a separate unresolved business/legal decision.
