# Stellar — Agent Instructions

## Stack Summary

Stellar is a Next.js application in an npm workspace. The application lives in `apps/web`; run the root package scripts so workspace checks and the harness stay aligned. No deployment, external task tracker, or automated review service is configured in `harness.json`.

## Agent Harness

Read `documentation.intakeSet` in `harness.json` before editing: `AGENTS.md`, `WORKFLOW.md`, `harness.json`, `docs/agent-rules.md`, `docs/current-work.md`, and `docs/PLANS.md`. `AGENTS.md` is the canonical agent-instruction file. `CLAUDE.md` imports it verbatim. Host adapters point to the shared documents.

Use `docs/PLANS.md` for multi-session, cross-subsystem, risky, or ambiguous work. Keep `docs/current-work.md` a compact pointer and preserve unrelated user changes. Branch work targets `branches.integration` (`main`). There is no separate production branch or deployment configured.

## Verification Commands

From the repository root, run the commands that match the change:

- Local development: `npm run dev`
- Docs and harness: `npm run verify:docs`, `npm run verify:harness`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Tests: `npm run test`
- Production build: `npm run build`
- Full local check: `npm run verify`

`npm ci` is the clean-install command used by CI. Never claim a verification result that was not run and seen. The exact verification groups live in `harness.json`.

## Context7 Documentation

When the user asks about a library, framework, SDK, API, CLI tool, or cloud service, fetch current documentation with Context7 MCP, even for familiar tools. Start with `resolve-library-id` using the library name and the user's full question unless an exact `/org/project` ID was provided. Choose the best match by name, relevance, snippet coverage, reputation, and benchmark score; use a version-specific ID when the user names a version, and retry resolution with another name or query if the matches are poor. Then call `query-docs` with the selected ID and the full question. If the answer is insufficient, retry the same ID with `researchMode: true`. Prefer Context7 to web search for library documentation. This requirement does not apply to refactoring, scripts from scratch, business-logic debugging, code review, or general programming concepts.

## Subagents

When subagents are explicitly requested for a task, use SOL with high reasoning for every subagent and give each a bounded unit of work. Independent agents use separate worktrees or disjoint files. A reviewer agent does not substitute for the user's own required review.

## Design And Documentation

`apps/web/app/globals.css` is both the hand-authored design-token source and the shipped stylesheet. Preserve existing foundation and semantic token names. Diagrams are allowed when they help explain a system; place durable diagrams with the relevant architecture documentation. Keep documentation claims tied to shipped behavior.

## External Actions

`tracker`, `review`, and `ci.deploy` are null in the profile. Do not invent task IDs, registration, branch protection, or deployment. External writes, commits, pushes, merges, and deployments require authorization appropriate to the requested work. Treat a user request to make such a change as authorization for that scope; avoid asking twice.

## Learned User Preferences

## Learned Workspace Facts
