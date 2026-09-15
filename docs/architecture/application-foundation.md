# Application foundation

The Stellar application is a Next.js App Router workspace in `apps/web`. Its root opens the Projects dashboard; `/projects/{projectId}/studio` renders the local responsive editor. The authenticated local operator connects through the launcher, which starts the web app and separate runner. Hosted accounts, client portal, CMS, agents and deployments remain future implementation. Next.js hosts the product UI; Astro renders the current fixture output and HTML authoring remains a later capability.

## Repository and commands

Run commands from the root. A single npm lockfile covers root utilities and the application/package workspaces. The independent Astro fixture has a separate lockfile. `.nvmrc` pins Node; root scripts forward development and production-server arguments to the app. `npm ci` requires no adjacent repositories, secrets or service accounts. Next telemetry can be disabled with `NEXT_TELEMETRY_DISABLED=1`.

`npm run verify` checks the harness, documentation, lint, TypeScript, contracts, source engine, runner, broker, editor controls, preview bridge and fixture. `npm run build` builds packages, the production app and ordinary Astro fixture. `verify:local` exercises the real authenticated app-to-runner boundary; `verify:editor` adds Chromium interactions, source assertions, recovery, video/screenshots and the independent edited build. CI defines these checks for pull requests and pushes to `main`; no deployment or remote CI result is represented.

The app uses exact dependency versions in its package manifest and lockfile. ESLint 10 removes context helpers still used by the bundled React lint rules. The flat configuration applies `@eslint/compat` to the Next rule configurations to restore those helpers; lint succeeded with that adaptation. Reassess the compatibility wrapper when upgrading the Next lint package.

## Design foundation

`apps/web/app/globals.css` contains the Stellar shell tokens, separate from editable website tokens in each project. Feature styles define the dashboard, three-panel Studio and narrow-screen panels. Studio supports exact website viewport widths independent of its own window size. It does not yet provide a full Lumos adapter, template selector or content editor. Shipped workflows have [Studio](../user-guide/studio.md), [inspector](../user-guide/style-inspector.md) and [history](../user-guide/source-history.md) guides.

## Reference and harness boundaries

The source inventory in [provenance](../provenance/sources.json) records Stacki's preserved revision, the supplied harness revision, and the separate company-site targets. Stacki remains in Git history and in an adjacent reference checkout; its notice is preserved under `third-party/stacki`. No editor module has yet been extracted into the new app. Future ports should include source provenance and the relevant preservation tests.

The development harness is an installed local adaptation, not Stellar's end-user agent runtime. [Harness adaptation](../provenance/harness-adaptation.md) documents changes for Next.js, a single main base, and nullable external integrations. `harness-lock.json` records the reviewed installed files. Intentional changes require inspection, lock regeneration and strict drift verification. No developer credentials, company task IDs or deployment configuration are inherited.

## Next proof

M1 now supplies the registered fixture, bounded local runner, source-backed canvas and supported CSS/token commands. Prop editing and structural composition remain later work. The next product integration is the company POC's independently verified WPGraphQL content path, after reviewing the local editor workflow. See [bootstrap sequencing](../BOOTSTRAP-PLAN.md) and [POC-01](../POC-01-company-site.md).

## Local development output

The Next configuration uses `.next-local` only during the development phase with `STELLAR_LOCAL_MODE=1`. The local launcher can coexist with a web-only development process that uses `.next`. Next retains its normal output locking; production build/start always use `.next`, including authenticated production acceptance runs. Both generated directories are ignored, and their generated type paths are declared in the web TypeScript configuration.
