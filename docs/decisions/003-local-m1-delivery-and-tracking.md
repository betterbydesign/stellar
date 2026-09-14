# Decision 003 — Local editor delivery and tracking

Date: 2026-09-14. Status: accepted for the current M1 implementation.

The user authorized committing all existing changes, starting M1-04 with SOL high subagents, and running independent M1-05/M1-06 work in parallel. Commit authorization covers the requested local implementation; it does not imply publishing, merging or deployment.

## Delivery sequence

M1-01 through M1-03 provide contracts, reproducible fixture copies, a real Astro runner, authenticated transport, source models and durable guarded writes. Their APIs are verified, but the root page is still the bootstrap screen. M1-04 replaces that entry with a project list and studio containing page navigation, a responsive canvas and source-linked selection. M1-05 supplies actual style controls. M1-06 adds guarded undo/redo and integrated workflow evidence.

Use separate worktrees with one SOL high agent per PRD. Agree inspector/history extension points with the canvas owner before integration. Inspector controls and history persistence can proceed in parallel; neither can be marked fully accepted before real canvas integration and browser verification. The coordinator owns integration, root configuration, final review and commits.

## Local source of truth

ClickUp and Macroscope are not connected. Keep their harness values null. Local PRD acceptance checkboxes, the active ExecPlan, current-work pointer, architecture decisions, operations log and handoffs track work and evidence. Record actual local review findings and tests; do not claim external review or remote CI. Preserve explicit pending user visual review separately from implementation review.

## Product scope

The first dashboard is the registered-project list and working studio. Do not add inactive CMS, IA, deployment or agency navigation to imply broader functionality. Those product areas follow the local editing proof and the existing WP/ACF company-site POC. The existing company repositories and fixture seed remain outside ordinary editor writes.
