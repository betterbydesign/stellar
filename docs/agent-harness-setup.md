# Agent Harness Setup

The harness is installed in this repository. `../harness.json` is the profile, and `../harness.schema.json` defines its allowed shape. The root package scripts run the Next.js workspace and the harness checks. Use Node and npm versions compatible with the checked-in lockfile and the CI job.

## Local Setup

From the repository root, run `npm ci`, then `npm run verify` and `npm run build`. Use `npm run dev` to start `apps/web`. `npm run verify:docs` runs the upstream documentation scan; `npm run verify:harness` validates the profile and checks referenced files and commands. The scan reads changed Markdown from Git, so run it inside a checkout.

## Profile And Provenance

`harnessTemplate.ref` pins the upstream source revision. `provenance/harness-adaptation.md` records the Stellar-specific changes. `harness-lock.json` records hashes of the installed portable files. After intentional harness edits, run `node scripts/check-harness-drift.mjs --update-lock` and inspect the diff; this writes the lock and is not a validation command. The normal check is `node scripts/check-harness-drift.mjs`.

## Branch And CI

`branches.integration` is `main`; `branches.production` is null. Feature branches and pull requests target main. CI's locally defined `Verify` job runs `npm ci`, `npm run verify`, and `npm run build`; remote runs have not been verified. The profile records `required: false` until branch protection is verified. CI does not deploy or register any review product.

## Tracker And Reviewer

`tracker` and `review` are null. No tracker MCP connection, task list, external task ID, automated reviewer account, or check-run registration is configured. If either integration is adopted, update the schema-backed profile and shared docs from verified coordinates and authorization, then add only the matching configuration.

## Deployment And Secrets

`ci.deploy` is null. A successful local or CI build does not imply that a deployment target exists. Keep real environment values and personal credentials outside committed docs and code. Use placeholders in examples and verify any future deployment setup against the live provider before claiming it works.

## Troubleshooting

- If profile validation fails, compare `harness.json` with the local schema and the named missing file or command.
- If the docs scan reports a broken link, resolve it relative to the Markdown file containing it.
- If the drift check reports a hard failure, correct the unsafe path, link, lockfile, or adapter mismatch. Drift reports alone describe a hash change; review it before updating the lock.
- If CI and local verification differ, compare the `Verify` job's steps with `ci.jobs[].runs` and the root package scripts.
