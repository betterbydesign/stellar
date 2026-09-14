# Stellar

An agent-assisted website studio and client portal for responsive Astro and HTML sites.

This repository contains a working local Studio: a project dashboard, responsive Astro canvas, source-linked selection, supported style and token controls, and durable undo/redo. It uses an authenticated local runner, a pure CSS source engine and a project-local adaptation of the Altitude agent harness. Hosted identity, general repository onboarding, CMS connections, agent execution, HTML authoring and deployments are later work.

## Start locally

Use the Node version in `.nvmrc` and npm. From the repository root:

```sh
npm ci
npm run fixture:install
npm run dev:local
```

Open the one-time connection link printed by the launcher. It starts the app and runner and establishes the local operator session without external accounts. See [local projects](docs/user-guide/local-projects.md) for saved copies and recovery. The launcher serves the app at `http://127.0.0.1:3210` by default. `npm run dev` starts only the web process and does not connect a runner; use `dev:local` for the complete editor. The application lives in `apps/web`; application and contract workspaces use the root lockfile. The independent Astro fixture has its own lockfile.

```sh
npm run verify
npm run build
npm run verify:local
npx playwright install chromium
npm run verify:editor
```

Verification checks the harness, documentation, lint, TypeScript, source engine, real Astro runner/recovery, authenticated broker and fixture mappings. The production build includes the app, packages and standalone fixture. `verify:local` then tests the real authenticated app-to-runner flow using temporary working copies. `verify:editor` runs the real browser workflow, records screenshots/video, checks source isolation and recovery, and builds the edited site after stopping Stellar. It uses temporary copies and requires the production build above. CI uses these root commands and installs Chromium; no remote CI result is claimed.

## Project documents

- [Product requirements](docs/STELLAR-PRD.md)
- [Bootstrap plan and ownership discussion](docs/BOOTSTRAP-PLAN.md)
- [Company-site proof](docs/POC-01-company-site.md)
- [Editor contracts and fixture](docs/architecture/editor-contracts.md)
- [Local runner and source engine](docs/architecture/local-project-runner.md)
- [Studio guide](docs/user-guide/studio.md)
- [Active work](docs/current-work.md)
- [Agent instructions](AGENTS.md)
- [Licensing](LICENSING.md) and [source provenance](docs/provenance/sources.json)

The Stacki reference and harness source are adjacent checkouts for development. Neither is required to install or build Stellar. The current source engine is original Stellar code. Any future port must retain its upstream tests and notices. The company Astro and WordPress repositories remain separate POC targets.
