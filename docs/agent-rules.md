# Portable Agent Rules

These rules apply across agent hosts. The profile in `../harness.json` supplies commands, paths, and optional integrations. Tool adapters are pointers to this document and `../WORKFLOW.md`.

## Context And Scope

- Read `documentation.intakeSet` before changing files; confirm worktree, dirty state, scope, and verification.
- Preserve unrelated user changes and work only in the assigned checkout or worktree.
- Prefer existing application patterns, architecture references, and helpers.
- Do not add runtime services or hooks solely for harness documentation.
- Use `./PLANS.md` when work needs durable planning or a handoff.

## Subagent Orchestration

When the user requests subagents, divide work into bounded, reviewable units. Give each agent a clear file or behavior boundary and its own worktree if concurrent edits could conflict. Keep decisions, validation, and handoff state in repo docs or the branch so a successor can resume. Use SOL with high reasoning for every subagent, including narrow tasks. Name user review checkpoints explicitly; an agent's review does not satisfy a required personal review by the user.

## Design System

`designSystem.sourceOfTruth` and `designSystem.shippedImplementation` both point to the hand-authored CSS file in this repo. Edit the source directly; there is no generator. Reuse foundation and semantic tokens and verify affected UI. Diagrams may be maintained with architecture docs when they clarify behavior.

## Documentation

- Keep `documentation.artifacts.statusDoc` a compact current-work pointer.
- Update an active ExecPlan for meaningful progress and decisions.
- Update `documentation.artifacts.architecture` when subsystem behavior changes.
- Sweep `documentation.artifacts.userGuides` for affected shipped behavior and verify claims.
- Use `documentation.artifacts.operationsLog` for meaningful implementation sessions.
- `documentation.artifacts.schemaDoc` and `verify.schema` are null; no committed application schema artifact is claimed.

## Verification

Run the `verify.*` groups matching the change. `verify.docsOnly` is the floor for documentation-only edits. Run lint, typecheck, tests, and build as applicable to code changes. Null groups have no command. Report results that were actually seen.

## Optional Integrations And External Access

`tracker` and `review` are null. Do not invent task IDs, reviewer checks, or registration. If configured later, verify coordinates before tracker writes and use the profile's authorization policy. Do not commit credentials or real environment files. Ask before destructive operations or external writes outside the user's authorized request; a direct user request authorizes its own stated scope.

## Review Feedback

Investigate findings against current code and requirements. Fix clear in-scope issues and rerun affected checks. Ask for direction when a finding changes acceptance criteria or expands scope. Keep raw PR comments on the code host and distill accepted recurring lessons only when the review-lessons artifact is configured.
