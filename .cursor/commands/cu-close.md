---
name: cu-close
description: Close out the current Stellar task from the shared harness
---

# /cu-close — task closeout

Read `harness.json`, `WORKFLOW.md`, `docs/agent-rules.md`, and the current work pointer. This is a shared closeout prompt; the same body is used by Cursor, Claude Code, and Codex.

1. Inspect the worktree, diff, active ExecPlan, and current-work entry. Summarize the behavior delivered and the files changed.
2. Run the applicable `verify.*` commands in `harness.json`; report only results actually seen. Update affected architecture docs, user guides, the ExecPlan, status pointer, and operations log.
3. Prepare a concise completion summary using `docs/templates/completion-summary.md`: result, verification, evidence, risks, and next action.
4. If `tracker`, `review`, or `ci.deploy` is null, skip its integration. Never invent an ID, reviewer result, or deployment state.
5. Commits, pushes, PRs, merges, deployments, and external writes require authorization from the current user request or a prior applicable instruction. This prompt alone authorizes none of them.

Leave the repository in a reviewable state and give the user a self-contained final summary.
