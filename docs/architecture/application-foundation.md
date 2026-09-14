# Application foundation

The initial Stellar application is a Next.js App Router workspace in `apps/web`. It renders a responsive introduction page with planned workflow stages and no project controls. The studio, client portal, identity, storage, agents and deployment services are future implementation. Next.js hosts the product UI; it does not replace Astro and HTML as the site's output formats.

## Repository and commands

Run commands from the root. A single npm lockfile covers the root harness utilities and the web workspace. `.nvmrc` pins Node; root scripts forward development and production-server arguments to the app. `npm ci` requires no adjacent repositories, secrets or service accounts. Next telemetry can be disabled with `NEXT_TELEMETRY_DISABLED=1`.

`npm run verify` validates the harness profile and installed-file hashes, scans documentation, lints the app, generates Next route types and checks TypeScript, then runs the harness regression tests. `npm run build` creates the production build separately. CI defines those commands in a `Verify` job for pull requests and pushes to `main`; no deployment job or verified branch protection is represented.

The app uses exact dependency versions in its package manifest and lockfile. ESLint 10 removes context helpers still used by the bundled React lint rules. The flat configuration applies `@eslint/compat` to the Next rule configurations to restore those helpers; lint succeeded with that adaptation. Reassess the compatibility wrapper when upgrading the Next lint package.

## Design foundation

`apps/web/app/globals.css` contains the hand-authored tokens and layout. The starter uses system fonts and switches the planned-workflow list from three columns to one on narrow screens. It does not install or claim a complete Lumos design system, editable canvas, template selector or content editor. The user guide remains an index until an actual user workflow ships.

## Reference and harness boundaries

The source inventory in [provenance](../provenance/sources.json) records Stacki's preserved revision, the supplied harness revision, and the separate company-site targets. Stacki remains in Git history and in an adjacent reference checkout; its notice is preserved under `third-party/stacki`. No editor module has yet been extracted into the new app. Future ports should include source provenance and the relevant preservation tests.

The development harness is an installed local adaptation, not Stellar's end-user agent runtime. [Harness adaptation](../provenance/harness-adaptation.md) documents changes for Next.js, a single main base, and nullable external integrations. `harness-lock.json` records the reviewed installed files. Intentional changes require inspection, lock regeneration and strict drift verification. No developer credentials, company task IDs or deployment configuration are inherited.

## Next proof

Introduce one project fixture and a bounded preview-runner interface. Prove that a browser can render an Astro page, select one supported element, update a token or prop through a validated command, save source and retain the edit after reload. Then connect the company POC's independently verified WPGraphQL content path. See [bootstrap sequencing](../BOOTSTRAP-PLAN.md) and [POC-01](../POC-01-company-site.md).
