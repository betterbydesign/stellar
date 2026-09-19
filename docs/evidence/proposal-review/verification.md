# Proposal review verification

Date: 2026-09-19. All evidence is local; no provider setup or deployment was attempted.

## Completed checks

- `npm ci` and `npm run fixture:install`: passed from the existing lockfiles.
- Root `npm run lint` and `npm run typecheck`: passed.
- `npm run test`: first integrated pass passed 147 tests before proposal backend/recovery tests were added. A sandboxed attempt could not bind loopback ports; the authorized local-port run passed.
- Final focused web tests: 58 CJS tests and 21 Vitest tests passed, including eight proposal backend tests and three UI recovery tests.
- `npm run build`: passed packages, production Next and independent Astro fixture.
- `npm run verify:local`: passed authenticated operator/Origin/CSRF gates, two real Astro source copies, engine-backed edit, duplicate/stale checks, project isolation, durable restart/reconciliation and unchanged seed. This is real local source regression evidence, not hosted proposal application.
- `npm run verify:proposals`: synthetic browser checks passed for opt-in refusal, viewer mode, exact content, duplicate approval retry, rejection reload recovery, approval withdrawal, cancellation and narrow layout. Zero account API calls and no browser script errors. The script uses isolated temporary data/ports and stops its own processes.
- Production route check: a temporary production server returned 404 for `/dev/proposal-review` even with `STELLAR_PROPOSAL_REVIEW_DEV=1`.
- Independent SOL high review: no unresolved actionable findings; focused backend 8/8, HTTP/transport 14/14, UI recovery 3/3 independently passed.

Final `npm run verify` passed: docs/harness, lint, typechecks, all 158 tests and fixture validation. An earlier aggregate attempt stopped at a handoff link to this then-unwritten evidence file; the link was completed before the successful rerun.

## Acceptance coverage

| Requirement | Evidence |
| --- | --- |
| Exact payload/digest, actor, tenant/project, revision and expiry | Domain seal and backend integrity tests |
| Cross-tenant and same-tenant wrong project | Backend list/get/decide/submit refusals; wrong proposal under another accessible project |
| Viewer and revoked access, including retries | Current-grant backend tests; browser read-only controls |
| Altered, stale and expired proposals | Backend digest/payload/decision integrity, revision mismatch and timer tests |
| Duplicate submission and decisions | Repeated disabled submit creates zero records; exact decision replay, conflicting reuse and concurrent decision tests |
| Cancellation and reload | Append-only approve/cancel history, exact receipt reconciliation tests and synthetic browser scenarios |
| Production isolation and zero budget | No deployed ingestion/apply path, disabled execution policy, development/production route fences |
| Existing local source/history | `verify:local` with independent temporary copies and unchanged seed |

## Limits

Convex tests use an in-memory backend simulation, not deployed durability or real production concurrency. Browser harness proposals, hashes and source patches are synthetic; screenshots demonstrate UI behavior only. Source revision comparison identifies the sealed review base and cannot attest current runner source. WorkOS sessions, real revocation, deployed persistence, runner connectivity and provider/media budgets remain open in the original platform handoff.
