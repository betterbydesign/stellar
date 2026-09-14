# M1-02 project runner and real-write dependency

## Context

The user asked to do the next PRD after the reviewed M1-01 implementation. The local M1-01 changes are uncommitted and preserved on `codex/m1-02-project-runner`, branched from their previous work branch without discarding changes. M1-02 explicitly requires real M1-03 proposals for final write acceptance, so the pure source engine is included as a necessary dependency. No commit, push, merge, company checkout or deployment is authorized by this implementation request.

## Goals

- Open two reproducible registered Astro working copies through a separate trusted local runner.
- Establish an explicit local operator session and authenticated server broker; keep preview credentials separate.
- Persist guarded one-file changes and receipts, reject stale/unauthorized operations, and recover interrupted writes.
- Review and test actual Astro/engine behavior and leave a usable setup and downstream handoff.

## Non-Goals

No hosted sandbox, arbitrary repository import, CMS, Agent Hub integration, canvas selection, inspector, or user-facing undo/redo. This local adapter does not isolate hostile code. The source-engine dependency does not expand into later editor UI PRDs.

## Scope

SOL high runner agent owns `apps/runner` in its own worktree. SOL high broker agent owns web API/server operator connection code in another worktree. SOL high engine agent owns `packages/editor-core` in a third worktree. The coordinator owns root dependency/build wiring, cross-package decisions, integration tests where needed, documentation and independent review. Each worktree includes a copy of the reviewed local M1-01 source so no unapproved commit is required to share the prerequisite.

## Plan

1. Read harness and predecessor outputs; agree engine and authenticated runner transport interfaces.
2. Implement pure source analysis/proposals while runner lifecycle/journal and web broker/auth progress independently.
3. Integrate disjoint packages and root commands; test the real two-copy fixture flow.
4. Review filesystem, authentication, process cleanup, revision and recovery boundaries; fix confirmed defects.
5. Run applicable full root checks, production builds, real API/browser operator connection and preview checks.
6. Record acceptance evidence, limitations and exact next-agent contracts.

## Progress

- 2026-09-14: preserved the uncommitted M1-01 implementation and created isolated worktrees for three SOL high agents.
- 2026-09-14: delegated runner, broker and required pure source-engine work; integrated their disjoint packages and root lock/CI commands.
- 2026-09-14: independently reviewed parser ownership, inverse guards, lifecycle cancellation, auth, filesystem boundaries, concurrent writes and recovery; confirmed defects were fixed with regressions.
- 2026-09-14: real production API acceptance exposed NextURL loopback normalization that mocked tests missed. Corrected URL handling while retaining exact transport Host/Origin validation.
- 2026-09-14: browser connection, reload and actual runner Home/Contact rendering passed. Temporary review processes were stopped.
- 2026-09-14: final tests exposed a startup exit/status race. Only a ready worker now publishes unexpected-exit state; startup owns its actionable failure result. Three consecutive occupied-port retries passed the targeted regression.

## Surprises & Discoveries

The PRD's real-write gate depends on M1-03 even though its lifecycle slice can ship earlier. The pinned Astro CLI can daemonize preview processes, so the runner uses a directly owned programmatic Astro worker. NextURL normalizes loopback IPs to localhost internally; the actual Host header and Origin remain the authorization boundary. Next dev also generated nested agent files; the supported agentRules option disables that behavior in favor of the repo-owned root harness.

## Decision Log

- 2026-09-14: implement the real engine dependency alongside M1-02 because mock patches cannot satisfy its acceptance criteria.
- 2026-09-14: retain M1-01 as local uncommitted prerequisite source; shared changes stay coordinator-owned.
- 2026-09-14: require different hostnames for app cookies and website previews, exact origins and loopback-only listeners.

## Validation

Final checks passed on 2026-09-14 after review fixes:

- Clean root `npm ci --no-audit --no-fund` and `npm run fixture:install` passed against both lockfiles.
- Root `npm run lint` and `npm run typecheck` passed for all four workspaces and root validation scripts.
- Root `npm run test` passed all 41 tests: 9 contracts, 5 pure engine, 11 real runner, 6 broker and 10 fixture/harness tests. The occupied-port regression now exercises three successive failures before successful recovery.
- Root `npm run build` passed for packages, Next production output and both standalone Astro routes.
- Root `npm run verify:local` passed through production Next and a separate runner: operator/Origin/CSRF gates, two actual Astro copies, real engine edit, duplicate/stale rejection, project isolation, restart/reconciliation and unchanged seed.
- Browser operator connection/reload and actual Astro Home/Contact navigation passed at 1280 × 720. Temporary tabs and processes were stopped.
- Final `npm run verify:docs`, `npm run verify:harness`, `npm run verify:fixture` and `git diff --check` passed. Earlier `npm run verify` passed before the final targeted fixes; its constituent lint/typecheck/test checks were rerun successfully afterward. No remote CI or deployment was run.

The first full production API run exposed the NextURL origin issue, and a later runner test exposed the startup-state race; both were fixed and regression-covered. All M1-02 A–G and M1-03 A–H criteria are satisfied locally within the documented trusted-fixture scope. See the [reviewed handoff](../../handoffs/m1-02-and-m1-03.md) and [source fingerprints](../../evidence/m1-02-source-fingerprints.json).

## Outcomes & Retrospective

M1-02 and its required M1-03 dependency are implemented and independently reviewed locally. The handoff supplies the authoritative project/session API, pure source keys/proposals and durable receipts. M1-04 will consume the preview/integration seam and M1-06 will consume the same operation journal. Neither UI stage is implemented here. Changes remain uncommitted; no hosted or hostile-code isolation is claimed.
