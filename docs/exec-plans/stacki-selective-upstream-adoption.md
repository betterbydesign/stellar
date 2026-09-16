# Selective Stacki upstream adoption

## Context
The user requested a decision on timing, a concrete plan, and separate kickoff tasks for upstream adoption and the independent platform foundation. Stellar's verified local editor and named-project baseline is e80cf4c. The preserved Stacki reference is 800fa52. A live upstream inspection on 2026-09-16 found fd2a38f (v0.1.26), 60 commits later, largely TypeScript/contracts/build migration. Stellar's current source engine is original implementation and has no Stacki runtime dependency.

## Goals
- Review the upstream delta now, before Stellar expands agent-driven source edits.
- Adopt only demonstrated correctness or source-preservation improvements relevant to Stellar.
- Produce a reproducible adopt/adapt/defer/reject inventory with commit and file provenance.
- Keep existing local project creation, authenticated editing, history and independent builds intact.

## Non-Goals
Wholesale upstream merge, Electron migration or packaging, replacing Stellar's authentication/contracts/backend, importing Agent Hub code, adopting an unimplemented editor redesign, and remote publication/deployment.

## Scope
Read upstream in an isolated temporary reference. Own upstream research/provenance notes and narrowly justified editor-core, preview bridge or editor regression changes. The parallel platform task owns WorkOS/Convex, project authorization and platform contracts. Coordinate any shared file before editing it; avoid runner lifecycle files and broad root dependency changes. Read the intake set before implementation.

## Plan
1. Start a new isolated work branch from the committed kickoff baseline; main is older and must not be treated as the feature baseline. Verify the exact upstream revision and retain the old reference provenance.
2. Use bounded SOL high agents for upstream delta analysis, comparison against Stellar's current engine/preview, and independent review. Keep implementation files disjoint.
3. Rank changes by demonstrated applicability: shared validation/property tests, source-preservation cases, parser/layout identification, queue convergence and preview behavior. Trace each candidate into current Stellar code; do not port a fix for code Stellar does not use.
4. Record a short decision matrix with upstream commit/file, behavior, Stellar counterpart, priority, dependency and test. Distinguish mechanical TypeScript migration from actual behavior changes.
5. Implement a small first batch only where the comparison establishes a concrete gap. Prefer a failing regression then the smallest compatible fix. If no applicable gap exists, complete the audit with explicit evidence rather than manufacture work.
6. Review the diff-mapping/edit-intent proposal as a later experiment. It is a post-migration plan, not shipped proof. Keep Stellar's revision/history/write ownership model until an isolated experiment demonstrates a clear benefit on representative source and concurrent edits.
7. Run relevant root verification, build and real browser acceptance for changed interactions; preserve notices and tests for imported code. Record exactly what shipped and what was deferred.

## Progress
- 2026-09-16: Plan created; independent kickoff requested. Upstream range inspected, implementation not started.

## Surprises & Discoveries
The upstream range changes hundreds of files; most serve Stacki's Electron/Vite architecture. A broad merge would replace unrelated Stellar application decisions. The latest release also fixes renderer module startup after migration, so migration commits alone are not a stable adoption target.

## Decision Log
- 2026-09-16: Begin the audit now, in parallel with platform foundation. Land applicable editor fixes before the first Letta write-enabled proof. The audit does not block WorkOS/Convex implementation.
- Retain separate upstream-reviewed and upstream-ported revisions; observing a release does not mean Stellar incorporates it.

## Validation
Kickoff documentation requires verify:docs and verify:harness. Implementation requires the applicable harness checks and source/preview evidence. Use temporary project data and isolated ports; never run against the user's saved data or stop existing services.

## Outcomes & Retrospective
Pending execution. Deliver an adoption report, independently reviewed first batch if warranted, exact verification, local commits and an integration handoff. Do not push, merge shared branches, sync another task's checkout or deploy without new scoped authorization.
