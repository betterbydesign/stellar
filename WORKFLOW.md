# Workflow

This is Stellar's repo-owned lifecycle contract. `harness.json` records the actual commands, paths, branch model, CI shape, and optional integrations. A null verification group or integration has no step to perform. Never claim a result you did not run.

## Source Of Truth

- User instructions and the current scoped request own acceptance criteria until an external tracker is adopted.
- Repo docs own durable decisions, verification evidence, handoffs, and subsystem behavior.
- Git and the code host own branch history, pull requests, review threads, and CI status.
- `tracker`, `review`, and `ci.deploy` are currently null. Do not create identifiers or describe absent services as active.

## Session Start

1. Read each file in `documentation.intakeSet` and inspect the requested change.
2. Check the branch or worktree and preserve unrelated changes.
3. Identify scope, acceptance criteria, and applicable `verify.*` groups.
4. Update `documentation.artifacts.statusDoc` when a durable work pointer helps a later session.
5. For multi-session, cross-subsystem, risky, or ambiguous work, create or update an ExecPlan using `docs/PLANS.md`.

## During Work

- Work within the requested scope and record durable decisions in an ExecPlan or architecture doc.
- Follow existing application patterns and the design-system source in `designSystem.sourceOfTruth`.
- Update user guides when shipped behavior changes, after verifying the behavior.
- Keep progress comments and status updates grounded in actual work and results.
- If the user requests subagents, follow `docs/agent-rules.md` for bounded, independently reviewable units.

## Branches And Pull Requests

- Feature branches target `branches.integration`, currently `main`; `branches.production` is null.
- Use a task ID in branch, PR, or commit text only when the user supplies or a real tracker establishes one.
- PR descriptions state behavior, scope, verification, and remaining risks. Include screenshots or video for visual changes when useful.
- Preserve unrelated work in isolated worktrees. Never commit secrets or local credentials.
- Do not commit, push, open a PR, merge, or deploy merely because a closeout command was invoked. Follow the user's authorization for those actions.

## Verification

- Documentation-only changes: run `verify.docsOnly`, including the shipped docs scan and profile validation.
- Code changes: run applicable `verify.lint`, `verify.typecheck`, and `verify.test`.
- User-facing or release-sensitive changes: run `verify.build` when practical.
- CI's `Verify` job runs `npm ci`, `npm run fixture:install`, `npm run verify`, `npm run build`, and `npm run verify:local`. `ci.jobs[].required` is false because branch rules have not been verified.
- Record actual command results in the final response and active ExecPlan. Say why a command could not run.

## Review

Review findings are evidence to investigate against code and requirements. Fix confirmed in-scope defects, then repeat affected checks. Raw PR discussion stays on the code host; recurring accepted lessons belong in `documentation.artifacts.reviewLessons` if that artifact is later enabled. `review` is null today, so no automated reviewer or local review CLI is assumed.

## Closeout

1. Confirm final scope, changed files, and verification results.
2. Update `documentation.artifacts.statusDoc` and any active ExecPlan if their state changed.
3. Update architecture docs and user guides when behavior changed.
4. Append a meaningful session to `documentation.artifacts.operationsLog` when it aids handoff.
5. Report remaining risks and the next action. If an external tracker is adopted later, apply its configured write policy; otherwise use repo docs or the final response.
6. Leave commit, push, PR, merge, external writes, and deployment to the authorization for the current task.

## Escalation

Ask for direction when acceptance criteria cannot be inferred after useful work, unrelated changes block safe edits, a required secret is missing, or a failing check needs a scope expansion. Carry out unaffected work first.
