# Harness Adaptation Provenance

Stellar's harness began from `altitudemarketing/altitude-agent-harness` at commit `e629ae2ad1d1e8e08a4e202af243c26ba6f51c20`. The core template files were copied and reviewed in staging before the repo-specific adaptations below were installed. This records provenance and behavior; it does not assert an upstream license grant or determine rights in the original application code.

- The local schema selects a Next.js npm workspace role, allows null tracker, review, and deployment integrations, and models a single `main` integration branch with no separate production branch.
- The profile points to root npm scripts, the locally defined `Verify` CI job, and the same hand-authored CSS file for the design-token source and shipped stylesheet. Remote CI has not run for the bootstrap.
- Shared lifecycle docs and host adapters were adapted to avoid claiming ClickUp, Macroscope, deployment, required branch checks, or automatic merge behavior.
- The docs scanner is locally adapted to include untracked commit candidates in an all-files scan and distinguish structural source links from high-entropy credentials. Explicit token and credential-assignment checks remain active, including within URLs. Regression tests cover those boundaries.
- The drift checker retains denied deployment identities and task coordinates, absolute-path, forbidden-lockfile, broken-link, skill-lock, adapter, and hash-lock checks. Its source-stack vocabulary was narrowed so legitimate Stellar dependencies are not reported as extraction leaks.
- No upstream Astro or WordPress variant configuration, deployment pipeline, review registration, or source application data was copied.

`harnessTemplate.ref` is the upstream revision, while `harness-lock.json` pins the installed files after adaptation. Inspect changes before refreshing the lock with the drift script's `--update-lock` option.
