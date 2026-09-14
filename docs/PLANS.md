# ExecPlan Standard

ExecPlans are living Markdown plans for work that cannot be safely completed from a single short prompt. Use them for multi-session work, cross-subsystem changes, risky migrations, ambiguous requirements, or tasks that need durable handoff context.

Do not create an ExecPlan for every small change. Use `./current-work.md` for compact state.

## Required Sections

Every ExecPlan must include these sections:

1. `Context`
2. `Goals`
3. `Non-Goals`
4. `Scope`
5. `Plan`
6. `Progress`
7. `Surprises & Discoveries`
8. `Decision Log`
9. `Validation`
10. `Outcomes & Retrospective`

## Section Guidance

### Context

State the user request or real task link when one exists, branch or worktree, relevant PRD or plan links, and current repo state. Do not invent a tracker ID while `tracker` is null.

### Goals

List the outcomes this plan should achieve. Keep them testable and tied to the request.

### Non-Goals

Name explicit boundaries so future agents do not expand scope accidentally.

### Scope

List the expected files, subsystems, docs, and verification commands. If scope changes, update this section and record why in `Decision Log`.

### Plan

Describe the intended steps in execution order. Keep enough detail for another agent to resume without chat history, but avoid long templates or speculative implementation detail.

### Progress

Update this during work with dated bullets. Include what changed, what remains, and whether the next action changed.

### Surprises & Discoveries

Record facts learned during implementation that were not obvious from the task or docs. Promote durable subsystem knowledge into `./architecture/` at closeout.

### Decision Log

Record decisions with date, decision, rationale, and alternatives considered. Keep decisions concise and reusable.

### Validation

Record commands run, results, known failures, and any manual checks. Do not claim a command passed without seeing the result.

### Outcomes & Retrospective

Complete this when the work closes. Summarize shipped outcome, remaining risks, follow-up tasks, and lessons that should update repo rules or docs.

## Maintenance Rules

- Update the ExecPlan at start, meaningful checkpoints, blocked states, and finish.
- Keep the current next action in sync with `./current-work.md`.
- Keep acceptance criteria concise and link to the originating request or PRD when available.
- Move durable process rules into `./agent-rules.md` and lifecycle rules into `../WORKFLOW.md`.
- Move durable subsystem behavior into `./architecture/`.
