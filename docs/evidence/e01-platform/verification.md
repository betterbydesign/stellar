# E01 platform verification

Date: 2026-09-16. Branch: `codex/independent-platform-foundation`, based on kickoff commit eac9459. Work is isolated from the saved checkout, main and the parallel Stacki task.

## Current evidence

- WorkOS and Convex configuration names were checked for presence without printing secrets. None of the required variables were present in the task process; no real environment files existed in this worktree. Other products' account configuration was not imported or inspected.
- Runtime SDKs are installed and pinned. AuthKit Next.js 4.3.2, WorkOS Node 10.13.0 and Convex 1.45.0 compile with the existing Next.js 16.3.5 application.
- Focused web tests passed: 51 Node tests including 16 platform config/proxy/HTTP/intent checks, plus 13 `convex-test` backend tests. Convex tests execute application function handlers against a mock backend and explicit test identities; they do not prove JWT validation or a real deployed database.
- Production Next build passed without provider credentials. The setup screen and API failure paths remain available without pretending to connect.
- Independent SOL high review found and prompted fixes for revoked-project create retries, public pagination bounds and consistent mode selection. The root added the last same-tenant wrong-project test and completed fix verification after follow-up SOL agents hit an account usage limit. No fresh final independent approval is claimed.

## Live provider acceptance remains pending

No WorkOS login/logout, real JWT expiry/refresh, Convex deployment, provider-backed persistence, remote workspace pairing or paid job ran. No real provider was substituted by a mock in the application. No live credentials were requested in chat.

Concrete next setup: a Stellar-owned WorkOS development application; its API key/client ID and a unique cookie password entered securely in `apps/web/.env.local`; matching callback/login/sign-out URLs; a Stellar-owned development Convex URL with these functions deployed under separately authorized setup and the same WorkOS client ID configured for JWT validation. Use two test identities and organization memberships for the live isolation/revocation pass.

After setup, prove real sign-in, personal bootstrap, create/reopen after browser/server restart, two-tenant denial, organization provisioning, grant revocation, expired cookie/token rejection, provider outage/reconnect and safe request reconciliation. Source connectivity needs a separate pairing/hosted-runner slice. Its absence is intentional and visible, not a provider-configuration problem.

Stored command logs have terminal line endings/trailing whitespace normalized; command outcomes are unchanged.

## Final command results

- `npm run verify`: passed. Docs/harness, lint, typechecks, 143 tests total (130 Node tests across workspaces/root plus 13 Convex mock-backed tests), fixture validation. The initial restricted run failed solely because loopback test servers could not bind; the rerun with local socket permission passed.
- `npm run build`: passed packages, production Next and independent two-page Astro fixture build.
- `npm run verify:local`: passed real operator/Origin/CSRF gates, two temporary Astro copies, supported source edit, duplicate/stale checks, project isolation, durable restart/reconciliation and unchanged seed.
- Browser/server setup check: built Next app on a random loopback port, desktop 1440 and mobile 390 layouts, `/` and `/projects` redirects, setup page, disabled auth/platform/local APIs. No app runtime errors; the missing favicon returned 404.
- `git diff --check`: passed during closeout; final clean-state result is recorded in the handoff.

The generated-directory TypeScript helpers are standard offline-compatible Convex wrappers, checked locally. `convex codegen --init --typecheck disable` could not run without `CONVEX_DEPLOYMENT`; regenerate those helpers during the authorized live deployment pass. Compilation and the offline wrappers are not deployment evidence.

Browser screenshots and route assertions are in `output/playwright/e01-platform`. The browser setup check never entered a real signed-in session. Source/local-runner evidence uses temporary copies and dynamically assigned ports; no saved-checkout data or running service was modified.

## Offline component browser proof

A temporary browser fixture bundled the actual dashboard/details components with synthetic HTTP and storage. It simulated persistence followed by a lost response: reload kept the original request and recovered the synthetic record; retry left exactly one project and cleared the pending intent. Reopen showed disconnected source and disabled Studio. A viewer had no create control and the 390px layout had no horizontal overflow. Screenshots visibly label the mock environment. This is UI/recovery behavior proof, not WorkOS/Convex provider proof.

After the final layout-level auth-error fallback, web lint/typecheck, 51 Node + 13 Convex tests and the production web build were repeated. The fallback keeps unknown auth-service errors inside safe retry UI without clearing sessions or pending intent.
