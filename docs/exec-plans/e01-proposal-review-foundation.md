# Provider-independent proposal review ExecPlan

## Context
Authorized task on `codex/proposal-review-foundation`, isolated worktree `47c4/stellar`. Clean bootstrap ancestry fast-forwarded to local foundation commit `545ef9e`. See [PRD](../prds/e01-proposal-review-foundation.md). Original provider acceptance task remains deferred.

## Goals
Deliver typed bounded review contracts, authorized durable records, project review UI and isolated synthetic evidence; prove negative/recovery cases and leave a committed local handoff.

## Non-Goals
No provider setup, source application, spending, merge/push/deploy or changes to other worktrees. Live gates remain intact.

## Scope
Backend agent owns new proposal domain files, Convex proposal functions/schema and backend tests; UI agent owns review components, isolated development harness and browser evidence. Root owns platform HTTP integration, shared boundary decisions, documentation and final checks. Independent reviewer reads concrete diff after integration.

## Plan
1. Establish shared contracts and disjoint ownership with SOL high agents.
2. Implement bounded domain/backend and UI concurrently; integrate authorized HTTP routes.
3. Run negative/recovery tests, browser harness and local regression acceptance.
4. Resolve independent review findings, finish docs and scoped local commits.

## Progress
- 2026-09-19: Read full intake and platform/Letta architecture and handoff. Fast-forward completed foundation into task branch; PRD and plan written before implementation.

- 2026-09-19: Implemented/integrated backend, strict account API, review UI and isolated synthetic harness. SOL high independent review completed with no unresolved actionable findings. Production build, synthetic browser and real local acceptance passed.

## Surprises & Discoveries
- Task began at bootstrap with detached HEAD. Created task branch and fast-forwarded without modifying saved checkout.

## Decision Log
- 2026-09-19: Review approval records intent only; application refuses until authenticated source revalidation exists. Synthetic data is isolated from production projects.

- 2026-09-19: Preserve at most two append-only decisions so approval withdrawal can be reconciled after lost responses. Match exact receipt identity and bindings, never status alone.
- 2026-09-19: Expose no fixture insertion or trusted ingestion while runner preparation is unavailable; exercise durable-record functions through convex-test only.

## Validation
Root lint/typecheck and production build passed. Focused final web checks passed 58 CJS and 21 Vitest tests. Synthetic browser checks and production 404 gate passed; real local acceptance passed with unchanged seed. Final aggregate `npm run verify` passed all docs/harness/lint/typechecks, 158 tests and fixture checks. See [verification](../evidence/proposal-review/verification.md) for exact evidence and limitations.

## Outcomes & Retrospective
Implemented and independently reviewed the bounded review foundation. All review records remain separate from source permissions, and production submission is disconnected. Synthetic UI evidence and offline Convex tests are explicitly separated from real local source regression acceptance. The original platform live prerequisite checklist remains open. See the [handoff](../handoffs/e01-proposal-review-foundation.md) for review and follow-up.
