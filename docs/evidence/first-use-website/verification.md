# First-use slice verification

Date: 2026-09-24 (browser completion 2026-09-25 UTC). Branch `codex/first-use-website`, baseline `c93c803`. Worktree `933d`. Node 22.23.2, local macOS, Chromium, production Next app and real Astro previews; temporary source directories and independently allocated loopback ports. No credentials copied, no provider deployment and no existing service stopped.

## Results

- `npm ci` and `npm run fixture:install` passed with pinned dependencies.
- `npm run verify` passed: harness/docs, lint, types, fixture validation and 207 tests (contracts 10, content 14, editor 42, runner 29, web CJS 63, Convex 21, preview 2, root 26).
- `npm run build` passed packages, production web and independent Astro fixture. Final web lint, root lint and typecheck passed after the final local recovery refinement.
- `npm run verify:local` passed real guarded source writes, operator/Origin/CSRF gates, duplicate/stale requests, project isolation and restart reconciliation.
- `npm run verify:editor` passed real responsive preview, selection, base/mobile/reset/token changes, undo/redo, reopen, source isolation and independent site build.
- `npm run verify:projects` passed on the final implementation: blocked storage prevents a send; retry makes one website; lost successful response locks name/template; storage failure during retry cannot unlock an already-sent intent; reload recovers the same project; source/history survive runner restart; both legacy copies and seed remain unchanged; independent edited-site build succeeds. Browser errors: none.
- `npm run verify:proposals` passed existing synthetic review regression. This remains synthetic component evidence, not a live account or model-execution claim.
- Added four account-onboarding tests: missing personal setup/re-read, existing account reuse, organization/revocation/auth/outage refusal, and lost-bootstrap-response recovery. Existing offline Convex tests cover wrong identities, cross-account/project access, revoked grants, idempotency and fail-closed disconnected requests.
- Inspected the setup and local catalog screenshots. The real browser checked local narrow layout and 390/768/1440 previews. The account dashboard and record screens were not exercised with a live signed-in provider session.

The first sandboxed test run could not bind local ports; the full suite passed with permission to start disposable local servers. Two initial browser-test lint errors (unqualified browser globals) were fixed before the full passing run. A final review then tightened storage failure during recovery; final build, lint/types and the affected projects browser suite passed after that change. Editor/local/proposal results precede only that local form refinement; they are not represented as another full aggregate run.

## Timing samples

Final [projects result](projects-result.json) includes local samples: fresh creation acknowledgement 46 ms; fresh creation-to-edit 1,508 ms; acknowledged-save-to-current-preview 50 ms; recovered creation-to-edit 1,477 ms. These are single samples during concurrent local verification, not p95, a benchmark SLA or live account timings. The PRD's targets remain targets. The source hash in the result covers final implementation files. Full browser media is archived locally under `/tmp/stellar-first-use-browser-evidence` (ephemeral); compact results, logs and three screenshots are retained here. Historical committed output artifacts were restored after copying this evidence.

## Open gates

No authenticated computer pairing, exact account-to-source binding, distributed provisioning reconciliation or metadata-only project completion is implemented. No live WorkOS session lifecycle, Convex persistence/isolation, signed-in browser onboarding, live revocation or reconnect acceptance was performed. The platform source fence remains closed. See the [PRD](../../prds/first-use-website.md) and [handoff](../../handoffs/first-use-website.md). This slice improves prerequisites and the real local journey; it does not complete the requested account-to-editor product journey.
