# Combined foundation verification

Date: 2026-09-24. Isolated integration worktree: `codex/integrated-foundation`. All checks use local/offline provider fixtures or disposable local source copies. No hosted deployment, provider execution or spending occurred.

## Results

- Offline lockfile installation (`npm ci --offline --ignore-scripts`) passed; fixture dependencies were already present.
- `npm run verify` passed docs/harness, lint, types, fixture validation and 202 tests: contracts 10, content 14, editor 42, runner 29, web 58 + Convex 21, preview 2, root 26.
- `npm run build` passed all packages, production web and independent Astro fixture.
- `npm run verify:local` passed real authenticated editing, restart/reconciliation, isolation and unchanged seed.
- `npm run verify:editor` passed responsive canvas, selection, base/mobile/reset/token edits, history, reopen, isolation and independent site build.
- `npm run verify:projects` initially exposed a test interceptor race. After correcting that race, named creation, lost-response retry, restart recovery, independent history, legacy preservation and independent build passed. The first failure and successful rerun logs are retained.
- `node test/editor-e2e/upstream-preservation.mjs` passed exact-byte save/undo/redo, preview, duplicate declaration refusal and independent build.
- `npm run verify:proposals` passed synthetic browser recovery/permissions/cancellation, with no account requests or browser errors. This is explicitly not live Convex persistence or agent execution.
- Real launcher proof (`node test/editor-e2e/launcher-lifecycle.mjs`, first run from an identical temporary script) passed SIGTERM, SIGKILL and restart: each returned its listeners, released its data lease and preserved the registry.
- After the review-driven proposal fix, web lint, typecheck, all 59 CJS + 21 Convex tests and production web rebuild passed. The added regression means the component test counts now total 203; the initial aggregate pass was 202, not a claimed second full aggregate run.
- Independent fresh review and re-review passed after the fix; see [review](review.md).

The editor/projects/preservation JSON records retain the source hashes at each run. Subsequent changes were the proposal recovery fix and its regression plus a copy of the exercised launcher proof script. Final proposal browser validation covers the recovery fix. Historical evidence directories are preserved; compact fresh JSON, logs and two inspected screenshots are stored here. Full fresh browser media is archived locally under `/tmp/stellar-integration-browser-evidence` and is ephemeral.

## Remaining acceptance

Live WorkOS login/session/revocation, Convex deployment/codegen/persistence and real tenant isolation still require the deferred provider setup. Hosted runner pairing, source application revalidation, Letta and OpenRouter remain later work. Main and saved project data are outside this branch's changes.
