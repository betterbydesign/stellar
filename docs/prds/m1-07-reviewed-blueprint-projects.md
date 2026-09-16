# M1-07 — Create projects from reviewed blueprints

Status: ready for isolated local implementation. Independent of the pending company ACF mapping. This is a follow-on to M1, not a claim that M2-05 company integration is complete.

## Overview

Let an operator create a named, persistent project from a reviewed local Astro blueprint, open its real preview in Studio, make an existing supported style/token edit and reopen it with the change intact. The current application always registers two fixed demo copies. Retain those saved copies during the transition and introduce actual project identity and creation.

## Scope and boundaries

- Ship one original reviewed blueprint from the existing Astro style lab, with a versioned manifest and declared renderer, design-system identity and capabilities. A one-item catalog is honest; do not add unavailable choices.
- Reuse the existing Projects/Studio shell, semantic tokens, runner source-write boundary, preview bridge and history system.
- Create isolated source and metadata per project. User display names must not become filesystem paths. Creation is idempotent by request ID, validates names and cleans incomplete staging directories safely.
- Preserve legacy project-a/project-b source, history and IDs. Migration must be additive, replay-safe and reject unsupported registrations without resetting data.
- Allow two newly created projects to differ independently. Each remains an ordinary Astro site that can build after Stellar stops.
- General Git import, remote template execution, installation hooks, hosted accounts, WP/ACF, arbitrary HTML rendering, deletion, deployment and editing template originals are outside this slice.

## Acceptance

1. The Projects screen can create a named project from the available blueprint, report creation/preview failures accurately, and navigate to its Studio.
2. Blueprint/renderer/design-system identity and version are persisted and displayed where useful; unsupported versions cannot silently execute.
3. Two new projects have independent source/history and survive app/runner restart with stable IDs.
4. Existing saved M1 copies survive additive registry migration unchanged. Repeated or interrupted creation never duplicates a successful project or overwrites an existing one.
5. Authenticated broker and runner validate project/name/request scopes; traversal names, symlink escapes and arbitrary source paths are refused.
6. Real browser evidence covers creation, responsive Studio preview, supported style edit, reload/reopen, and the retained legacy projects. An edited site builds independently of Stellar.

## Ownership and parallel coordination

Own the blueprint manifest/catalog, project creation/registry contracts, `apps/runner/src/registry.ts`, focused runner dispatch extensions and Projects UI. The originating thread is fixing launcher lifecycle in `launcher.mjs`, managed child supervision, startup diagnostics and the server entrypoint. Do not duplicate that work or operate its ports/data. Coordinate any `server.ts` merge carefully; project dispatch changes and entrypoint lifecycle changes have different owners.

Use isolated worktrees and SOL high subagents for bounded registry/contracts, Projects UI and independent review work. Read AGENTS/WORKFLOW/harness intake first. Root wiring has one coordinator. Do not run a default launcher on the user's occupied ports; use isolated acceptance harnesses and temporary data.

## Verification and closeout

Add meaningful regression coverage for isolation, migration, interruption/idempotency and unauthorized/path-escape input. Run root verify/build and affected local/editor acceptance. Capture real screenshots/video and source preservation evidence. Record changed behavior, decisions, actual verification and any unimplemented boundaries in local PRDs/plans/current-work/log. No Airtable or WordPress change is required. No push, merge to shared branches or deployment is authorized by this handoff.
