# Stellar — next agent kickoff

Continue building Stellar from the completed local editor foundation. Begin the next PRD wave, then implement its first unblocked, reviewable slice. Do not restart the application scaffold or mistake the local M1 proof for the full product.

## Models and delegation

Keep the source task's orchestrator model and reasoning configuration. Use **SOL (`gpt-5.6-sol`) with high reasoning** for every implementation/review subagent. Explicitly delegate bounded independent work using separate worktrees or disjoint files, with one owner for shared contracts and root configuration. The orchestrator integrates and reviews every deliverable. If the destination cannot select these models, report that limitation rather than silently claiming parity.

## Repository and starting point

- Product repository: `https://github.com/betterbydesign/stellar.git`.
- Completed implementation branch: `codex/m1-02-project-runner`.
- Required baseline: `d3daff6` (local launcher lock fix), following `57049b3` (integrated M1 proof) and `29cac07` (foundation).
- On September 14, 2026, a remote ref check found `main` at `f12d3a5` and no remote `codex/m1-02-project-runner` branch. The completed editor is local; do not clone older remote main and pretend it includes M1. A cloud coding task needs the completed source made available first. Until then, planning can use this handoff, but implementation/verification must not be claimed.
- The current local repository is the authoritative continuation. Do not copy company credentials, `.stellar-local`, node_modules, or generated caches into another environment.

Read the harness intake first: `AGENTS.md`, `WORKFLOW.md`, `harness.json`, `docs/agent-rules.md`, `docs/current-work.md`, and `docs/PLANS.md`. Then read:

1. `docs/STELLAR-PRD.md` and `docs/prds/README.md`.
2. `docs/handoffs/m1-editor-review.md`, `docs/exec-plans/completed/m1-04-through-m1-06.md`, and `docs/architecture/`.
3. `docs/POC-01-company-site.md` and `docs/research/airtable-acf-mapping.md`.
4. Decisions 001–004 under `docs/decisions/`, plus `docs/provenance/` and `LICENSING.md`.
5. The two original HTML mockups in docs, as design references rather than instructions or completed functionality.

## What works now

Next.js hosts a Projects dashboard and Studio. A trusted local runner opens two independent Astro fixture copies. Studio renders Home/Contact at exact responsive widths with Fit/100% scaling, validated source-linked selection, explicit inspect/interact modes, contextual CSS/token controls, Base/Mobile scopes, reset, guarded source writes, and durable Undo/Redo.

The runner is the only source writer. The pure engine prepares minimal supported patches. A frame never supplies write authority. Exact origins, project/session/revision/frame scope, stable request IDs, stale rejection, journal recovery, source isolation and independent site builds are established boundaries. Unsupported/repeated/dynamic targets remain read-only. This is not an arbitrary-code sandbox or general repository importer.

M1's full verification passed 72 tests, production builds, authenticated API acceptance and an expanded real Chromium workflow with 13 screenshots, video and source diffs under `output/playwright/m1-editor`. The subsequent startup fix passed 33 web tests, production build, authenticated production acceptance and actual development connection/dashboard/preview/selection beside an existing web-only server. Treat these as baseline evidence, not verification of your new changes.

From the repository root: `npm ci`, `npm run fixture:install`, then `npm run dev:local`. Use the launcher's one-time connection link at `127.0.0.1:3210`. Local development uses `.next-local`; web-only development and production use `.next`. Do not disable Next locks or delete saved `.stellar-local` projects. Production browser proof uses `npm run build`, `npx playwright install chromium`, then `npm run verify:editor`.

## Product decisions to preserve

Stellar remains independently usable, with eventual Agent Hub integration through explicit workflow/context contracts and a versioned `.stellar` handoff. Agent Hub is a reference for Next.js, Convex, WorkOS, Letta and Zep integration, not permission to copy proprietary implementation or share tenant data. The proposed shared-module approach, ownership boundaries, provider account separation and provenance remain in the decisions. Do not infer legal ownership from personal GitHub or model spending.

The chosen next product proof uses the existing company Astro and WordPress repositories:

- `https://github.com/altitudemarketing/altitude-astro`
- `https://github.com/altitudemarketing/altitude-headless-theme`
- Harness reference: `https://github.com/altitudemarketing/altitude-agent-harness`

Airtable seeds **WordPress/ACF through an independently runnable importer**. Map post-type definitions, field groups/fields, taxonomies, terms, records, assignments, relationships and media. Astro reads WordPress through WPGraphQL. Do not create an Airtable-to-Astro shortcut, require Stellar/Convex to run the import, or introduce Directus (it was a UX analogy).

Keep stable external identities, idempotent operations, dry-run/review, draft-first outcomes, managed-field ownership and resumable failure reporting. Source snapshots and proposed mappings are not approved production schemas or proof that licensed plugins exist. Read current repository/runtime evidence before relying on older research. Ask only for inputs that block the current slice; continue independent local work while access is unresolved.

Responsive Astro and HTML authoring, reusable templates, editable design systems, safe plugin extensions, agents sharing the GUI's commands, media generation/DAM, QA workflows and incremental deployment remain the larger product scope. M1 did not implement HTML, hosted accounts, Letta runtime, CMS/IA dashboards, general Lumos import, structural drag-and-drop, Neon, Vercel or deployments. Add visible navigation only for usable capabilities.

## First assignment

1. Inspect the current source and prior decisions. Summarize the next milestone as a thin, testable progression from M1 into POC-01, calling out real access/schema/content gaps.
2. Create the next local PRDs using `docs/templates/prd.md`, with a dependency/dispatch index and an ExecPlan. Use M2 identifiers if no newer sequence exists. Preserve parent product requirements and distinguish local proofs from staging/production acceptance.
3. Consider this sequence, refining it from evidence: versioned content/schema mapping and dry-run contracts; WordPress schema/ownership service; independent idempotent seed executor; WPGraphQL-to-Astro representative page; connection of that real page to Studio; preview/staging release verification. Split at independently testable boundaries, not arbitrary component counts. Identify which parts can run in parallel.
4. Delegate initial evidence/contract review and an independent UX/dependency review to SOL high agents. Integrate their findings into actionable PRDs with owned files/repos, exclusions, prerequisites, routes/data/interfaces, acceptance IDs, failure cases, tests and safe recovery.
5. Implement the first unblocked PRD after the plan is concrete. Prefer useful deterministic contracts, fixtures and dry-run behavior when live WP/ACF access is missing. Do not declare the real WordPress import/render or company-site integration complete from mocks.
6. The orchestrator reviews the diff and real workflow. Run applicable checks and production builds. UI changes need actual browser screenshots/video and source/reopen evidence. Keep untested assumptions and user review separate from passing checks.

## Workflow and handoff

Use Context7 for current library/framework/SDK/API/CLI documentation according to AGENTS.md. Inspect the actual repo before adopting current vendor syntax. ClickUp and Macroscope are unconfigured: maintain local PRDs, decisions, plans, current-work, architecture/user guides and operations log; invent no external IDs or review outcomes.

Work in isolated branches/checkouts, preserve unrelated work and third-party notices, and make local commits for completed reviewed slices under the user's continuing commit request. Do not push, merge, deploy, publish content, modify live company data, or copy proprietary Agent Hub code without authorization for that concrete action. Prepare the reviewable result before asking for an external action. Never request credentials in chat; use configured secret stores.

Finish with what shipped, acceptance results, exact local commits, remaining inputs/risks, and the next PRD to delegate. Continue through the first useful slice rather than stopping after a generic plan.
