# Documentation Map

Start with the [repository README](../README.md), `../AGENTS.md`, `../WORKFLOW.md`, and `../harness.json`. The profile's `documentation.intakeSet` is the ordered session-start list. `../CLAUDE.md` imports the same agent instructions for Claude Code.

Product planning starts with [Stellar PRD](STELLAR-PRD.md), the [bootstrap plan](BOOTSTRAP-PLAN.md), and the [company-site POC](POC-01-company-site.md). These existing documents remain at their original paths. New scoped PRDs can use `prds/`; the initial PRD is not duplicated there.

- `./agent-rules.md` — shared operating rules.
- `./agent-harness-setup.md` — local setup, profile validation, and current integration state.
- `./current-work.md` — compact active-work pointer.
- `./PLANS.md` and `./exec-plans/` — planning standard and active, completed, archived plans.
- `./architecture/` — durable subsystem behavior and diagrams where useful.
- `./user-guide/` — instructions for people using Stellar.
- `./prds/` — product requirements and acceptance context.
- `./evidence/` and `./handoffs/` — task evidence and cross-session handoffs.
- `./reviews/` — review policy and accepted recurring lessons, if configured.
- `./templates/` — short session, PRD, progress, completion, and handoff templates.
- `./agent-operations-log.md` — chronological implementation history.
- `./provenance/harness-adaptation.md` — upstream source and Stellar adaptations.

The harness documents, scripts, and adapters came from the upstream revision recorded in `harnessTemplate`. Stellar-specific adaptations are recorded in the provenance note; the installed copy is maintained here. After an intentional change to a lock-managed file, inspect the change before updating `harness-lock.json`.
