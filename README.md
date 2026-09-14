# Stellar

An agent-assisted website studio and client portal for responsive Astro and HTML sites.

This repository contains the Next.js foundation, versioned editor contracts, a pure CSS source engine, an authenticated local Astro project runner and a project-local adaptation of the Altitude agent harness. The canvas/inspector, hosted identity, CMS connections, agent runtime and deployments are planned work; the starter page is not yet a working studio.

## Start locally

Use the Node version in `.nvmrc` and npm. From the repository root:

```sh
npm ci
npm run fixture:install
npm run dev:local
```

Open the one-time connection link printed by the launcher. It starts the app and runner and establishes the local operator session without external accounts. See [local projects](docs/user-guide/local-projects.md) for saved copies and recovery. Use `npm run dev` if you only need the unauthenticated bootstrap shell. The application lives in `apps/web`; application and contract workspaces use the root lockfile. The independent Astro fixture has its own lockfile.

```sh
npm run verify
npm run build
npm run verify:local
```

Verification checks the harness, documentation, lint, TypeScript, source engine, real Astro runner/recovery, authenticated broker and fixture mappings. The production build includes the app, packages and standalone fixture. `verify:local` then tests the real authenticated app-to-runner flow using temporary working copies. CI uses these same root commands; this implementation has not been pushed or run remotely.

## Project documents

- [Product requirements](docs/STELLAR-PRD.md)
- [Bootstrap plan and ownership discussion](docs/BOOTSTRAP-PLAN.md)
- [Company-site proof](docs/POC-01-company-site.md)
- [Editor contracts and fixture](docs/architecture/editor-contracts.md)
- [Local runner and source engine](docs/architecture/local-project-runner.md)
- [Active work](docs/current-work.md)
- [Agent instructions](AGENTS.md)
- [Licensing](LICENSING.md) and [source provenance](docs/provenance/sources.json)

The Stacki reference and harness source are adjacent checkouts for development. Neither is required to install or build Stellar. The current source engine is original Stellar code. Any future port must retain its upstream tests and notices. The company Astro and WordPress repositories remain separate POC targets.
