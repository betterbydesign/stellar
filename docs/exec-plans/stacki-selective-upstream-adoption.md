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
- 2026-09-16: Execution started in isolated worktree `5f1e`, branch `codex/stacki-selective-upstream`. Clean detached `f12d3a5` was fast-forwarded to authorized kickoff `eac9459`; main and saved checkout were not changed.
- 2026-09-16: Fresh temporary clone verified upstream HEAD `fd2a38f`. The requested range contains 60 commits and 397 changed files. SOL high agents are auditing upstream semantics and queue/preview applicability; root owns source-preservation probes and implementation. Platform task confirmed disjoint ownership of auth/provider files and package manifests.
- 2026-09-16: Audit complete with [decision matrix](../research/stacki-selective-upstream-audit.md), raw range inventories and distinct reviewed/ported provenance. Implemented original source-engine BOM preservation and ASCII property ownership fixes after failing public-boundary regressions. Generated 32 source variants across four edit paths; all 42 editor tests/subtests pass.
- 2026-09-16: Independent SOL high review found an escaped-identifier ownership gap; added failing evidence and conservative refusal, then obtained no-residual-findings re-review. Dedicated real browser proof and independent edited Astro build passed. Full root verification/build and authenticated local acceptance passed. [Integration handoff](../handoffs/stacki-upstream-first-batch.md) records the first batch and deferred watcher risk.

## Surprises & Discoveries
The upstream range changes hundreds of files; most serve Stacki's Electron/Vite architecture. A broad merge would replace unrelated Stellar application decisions. The latest release also fixes renderer module startup after migration, so migration commits alone are not a stable adoption target.

Generated source variants exposed defects in Stellar's original byte/ownership logic despite its existing tests passing. PostCSS strips a leading BOM before assigning offsets, so retaining BOM in the decoder alone is insufficient; parser offsets must be translated back. Standard property names are case-insensitive, custom properties are case-sensitive, and CSS identifier escapes require refusal until decoded ownership can be proven.

The 400ms runner watcher can enqueue refreshes faster than slow snapshots finish. A 650ms in-memory refresh probe confirmed five scheduled/two complete/three outstanding at 2.1 seconds. Ordinary editing acceptance passed; this is a sustained slow-refresh follow-up, not a platform prerequisite established by the audit. Runner lifecycle was excluded and the user reiterated keeping coalescing outside this batch.

## Decision Log
- 2026-09-16: Begin the audit now, in parallel with platform foundation. Land applicable editor fixes before the first Letta write-enabled proof. The audit does not block WorkOS/Convex implementation.
- Retain separate upstream-reviewed and upstream-ported revisions; observing a release does not mean Stellar incorporates it.
- 2026-09-16: Adapt only the deterministic property-testing method from `a2ea168`, with original Stellar regressions and fixes. No upstream source copied. Keep direct Stacki queue/parser/IPC/build/morph ports out because corresponding implementations differ or are absent.
- 2026-09-16: Refuse escaped property identifiers conservatively instead of adding a general CSS decoder to this narrow batch. Defer watcher coalescing to a separately coordinated runner slice. Diff-mapping remains a future experiment and cannot replace current revision/history guards.

## Validation
Kickoff documentation requires verify:docs and verify:harness. Implementation requires the applicable harness checks and source/preview evidence. Use temporary project data and isolated ports; never run against the user's saved data or stop existing services.

- `npm ci` and fixture clean install passed with pinned dependencies in this worktree.
- Before-fix editor regression log records 27 failing tests/subtests; a separate review regression demonstrates escaped-name ownership before its fix. Final editor package passes 42 tests/subtests (128 generated edit cases inside 32 subtests). Independent reviewer ran the 37-test preservation file separately.
- `npm run verify`: passed docs/harness, lint, all workspace typechecks, 151 tests/subtests and fixture validation; [log](../evidence/stacki-upstream/verify.log).
- `npm run build`: passed packages, production Next and independent Astro fixture; [log](../evidence/stacki-upstream/build.log).
- `npm run verify:local`: passed real operator/Origin/CSRF, edits, stale/duplicate handling, two-project isolation and restart/reconciliation; [log](../evidence/stacki-upstream/local.log).
- `node test/editor-e2e/upstream-preservation.mjs`: passed real UI save/preview, exact-byte undo/redo, duplicate refusal and clean independent edited-site build. Temporary copies and dynamic ports only; seed and other project fingerprints unchanged; [result](../evidence/stacki-upstream/browser-result.json).
- Initial checks required routine corrections: docs scanner mistook full commit hashes for secrets (short display refs now link to exact JSON provenance); browser sandbox blocked local listeners (authorized elevated acceptance used); test initially used visible Undo/Redo text instead of their accessible names (corrected). No product failure was hidden by those harness corrections.

## Outcomes & Retrospective
Completed audit and independently reviewed first batch; [handoff](../handoffs/stacki-upstream-first-batch.md) owns integration and follow-up details. Source preservation and ownership improved without importing Stacki runtime architecture or weakening revisions/history. User integration review and a separately scoped watcher convergence fix remain. Local commits are authorized; push, shared-branch merge, another checkout's sync and deployment remain unauthorized.
