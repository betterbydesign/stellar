# Stellar

An agent-assisted website studio and client portal for responsive Astro and HTML sites.

This repository now contains the initial Next.js web foundation and a project-local adaptation of the Altitude agent harness. The editor, authentication, CMS connections, agent runtime and deployments are planned work; the starter page is not a working studio.

## Start locally

Use the Node version in `.nvmrc` and npm. From the repository root:

```sh
npm ci
npm run dev
```

Open the local address printed by the development server. This initial scaffold needs no environment variables or external accounts. The application lives in `apps/web`; dependencies use the one root lockfile.

```sh
npm run verify
npm run build
npm run start
```

Verification checks the harness profile and file integrity, documentation, lint, TypeScript and the harness regression tests. Production build validation is separate. CI is defined locally but remote runs and branch protection have not been configured or verified.

## Project documents

- [Product requirements](docs/STELLAR-PRD.md)
- [Bootstrap plan and ownership discussion](docs/BOOTSTRAP-PLAN.md)
- [Company-site proof](docs/POC-01-company-site.md)
- [Active work](docs/current-work.md)
- [Agent instructions](AGENTS.md)
- [Licensing](LICENSING.md) and [source provenance](docs/provenance/sources.json)

The Stacki reference and harness source are adjacent checkouts for development. Neither is required to install or build Stellar. Selected editor modules can be ported with their upstream tests and notices when the first editing proof begins. The company Astro and WordPress repositories remain separate POC targets.
