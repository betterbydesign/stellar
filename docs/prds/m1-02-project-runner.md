# M1-02 — Open registered projects and run real Astro previews

Status: implemented and independently reviewed locally; included in the authorized foundation commit. Local identifier M1-02. Parent: [M1 index](README.md); partial R01 and the workspace foundations of R04/R06.

## Overview

Make a registered local project open into a recoverable workspace session with a real Astro preview and an authoritative source-write path. Separate the long-running project process from Next.js request handlers. The first usable slice opens a working copy and returns a live preview; later slices apply the engine's validated one-file proposals.

M1 accepts the trusted fixture from M1-01 and independent copies of it. It does not accept arbitrary uploaded repositories, untrusted build scripts, company production source or remote sandbox workloads. This local adapter is not an isolation claim for hostile code.

## Prerequisites

- M1-01 contracts, fixture lockfile and supported target matrix are integrated.
- M1-03 may run in parallel. The registry/lifecycle and adapter contract are an independent first handoff; the final real-write gate occurs only after M1-03 is integrated. M1-03's completion does not depend on this runner.
- No cloud accounts or company checkout access. Read [portability trust boundaries](../research/stacki-lumos-portability.md).

## User Stories

- As a developer, I want to open and reopen a registered project without reinstalling or losing my source changes.
- As an editor, I want a clear startup/failure state and retry that does not create a duplicate project.
- As a developer, I want stale edits rejected before they overwrite a newer observed source revision.

## Technical Requirements

### Endpoints and routes

Implement M1-01's project/session, pages, source-model, prepare/apply, request-outcome lookup and read-history transport in `apps/web` through a server-only runner adapter. History mutations are added in M1-06. Public requests resolve registered project IDs server-side; no endpoint accepts arbitrary filesystem roots, shell command strings, dependency URLs or general file writes.

Use a separately launched local runner process under `apps/runner`, binding loopback. The Next routes are short-lived broker calls, not owners of child-process lifetimes. The local launcher records its app/runner/preview addresses and authentication configuration. Require an explicitly enabled developer mode and an operator session, established with a one-time launcher-issued bootstrap nonce outside the project preview. Set the resulting app session in a host-scoped HttpOnly cookie; protect mutations with exact Origin and CSRF checks. The runner accepts authenticated broker requests only. Never expose broker credentials or general write authority to a rendered website.

Before serving a session, validate operator scope, project registration, supported renderer/fixture version and expected root. Use the M1-01 error model. Preview-not-ready is a normal lifecycle result, not a saved-state success. Source read/prepare/apply all require the same project/session authorization even if a target was obtained from a valid frame.

### Interface

Expose `registered`, `starting`, `ready`, `failed`, `stopped` and `reconnecting` states with safe progress/error messages and idempotent retry. M1-04 renders them. Startup waits for an actual successful page response, not just a spawned process or reserved port. Closing a session stops its process tree and watchers, while retaining the working copy and history. Restart rotates preview generation and invalidates old frame capabilities.

Use bounded/redacted log tails for diagnosis. Do not echo environment values, absolute host paths or bootstrap nonces into browser errors.

### Data model

Maintain a local registry and working copies under a documented gitignored directory such as `.stellar-local`. Registry entries map opaque IDs to validated roots. Separate source, runner metadata and build output. Creating the two M1 fixture copies must be reproducible and leave the seed untouched. Persist enough metadata to reopen after the runner and browser restart.

Canonicalize paths and resolve symlinks against the registered root; reject traversal, symlink escape, another project's target and writes to protected metadata or fixture seeds. Read source through the adapter and use M1-03 to prepare a bounded patch. At apply, resolve the stored proposal, validate scope and expected revision again, serialize operations per project, and verify expected file bytes immediately before atomic replacement. A browser-provided diff is never executable authority.

Every changed edit writes one source file; no-op results write none and add no history entry. Store a durable operation intent, authorized patch, preimage, expected postimage and request ID before replacing it, then a receipt containing before/after revisions and changed-file information. Preserve the data M1-06 needs to prepare guarded inverse/redo operations and its retention window. On retry/restart: matching before-state is unapplied, matching after-state recovers the receipt without reapplying, and any third state is a conflict. M1-06 builds user-facing history on these receipts; do not create a second history store.

Follow M1-01's separate request IDs per logical operation and persistent source-revision semantics. A new authorized session can reconcile a prior project operation through request lookup, but cannot replay an expired session's write capability. No-op reparse/restart does not create a source revision or invalidate history; actual relevant byte changes do. Preview generation and authorization lifetime remain separate.

A source watcher invalidates the model when relevant external edits occur. Tests must reject an external edit made between preparation and apply. Ordinary filesystem rename is not a transaction with arbitrary external editors: document the limit, retain recovery information and detect observed races; do not claim protection against every uncooperative writer in the check/rename window. Supported simultaneous writes in M1 go through the single runner.

### Integrations

Launch the pinned fixture's Astro development process with a sanitized environment, fixed argument construction and a working directory controlled by the registry. Do not inherit provider tokens, SSH credentials or the application's private environment. Do not silently install new project packages or execute changed scripts from an unreviewed project.

Serve preview from a different origin and hostname from the app, with no shared credential cookies. M1-04's bridge gets only a session-scoped selection/preview capability. Configure exact allowed app/preview origins and reject unrelated browser origins at the broker. No wildcard CORS or file-serving routes into the host home directory. The local runner must refuse public/LAN binding in this mode; tunneling it does not turn it into a hosted sandbox.

M1-04 provides the Astro integration. M1-02 owns the launch/configuration seam so the integration can be supplied in development without rewriting or dirtying the project's ordinary config. Stop/restart, occupied ports, missing dependencies, compiler errors and a crashed child process must have bounded recovery paths.

## Acceptance Criteria

- [x] M1-02-A: Two registered copies open/reopen with distinct source roots and IDs; retries do not create duplicate copies or processes.
- [x] M1-02-B: Ready means a real Astro route responded; failed startup, occupied port and compiler failure show actionable state and can be retried.
- [x] M1-02-C: Close/restart cleans up the process tree and watchers, preserves source and rotates the preview generation.
- [x] M1-02-D: An unauthorized origin/operator, mismatched project/session, traversal or symlink escape cannot read or mutate project source.
- [x] M1-02-E: Real M1-03 proposals apply atomically to one file and return a durable receipt; duplicate apply returns the same result, and changed reuse of a request ID fails.
- [x] M1-02-F: An observed newer revision makes prepare/apply stale with no overwrite. Simulated interruption around file replacement recovers or reports a conflict without replaying an edit.
- [x] M1-02-G: No server credentials appear in preview code, logs or bundles. The trusted-local limitation is explicit in setup and the UI connection state.

## Testing Plan

Integration tests use temporary roots and a small process fixture for lifecycle failures, then the actual Astro fixture for readiness and writes. Cover project A/B isolation, unauthorized requests, path and symlink escape, duplicate open/apply, cancelled startup, orphan cleanup and fault injection before/after replacement. Run the real engine for the final source-write test. Add runner integration checks to root verification; do not rely solely on API mocks.

## Rollback Plan

Stop owned child processes before reverting the runner/broker. Keep local working copies and operation journals for recovery; never clean them as a side effect of reverting source code. Document explicit developer reset separately. No production deployment exists in this slice.

## Timeline

1. Registry, local auth and launch/lifecycle with a real preview: first usable slice.
2. Connect source reads and the engine proposal interface, then guarded write receipts and crash recovery.
3. Integrate M1-03, validate real writes, hand off the preview/session API to M1-04 and receipt store to M1-06.

## Dependencies On Other Work

M1-01 is required. M1-03 can progress independently after contract freeze but must be integrated for write acceptance. M1-04 supplies instrumentation; M1-06 supplies user-facing undo/redo and the final integrated evidence.

## Agent handoff

Own `apps/runner/**`, `apps/web/app/api/projects/**`, `apps/web/lib/server/projects/**` and `apps/web/lib/server/runner/**`, runner tests and implemented runtime architecture/setup docs. Do not edit engine internals, contracts, fixture source or inspector UI. Root lock/CI wiring is coordinated with the integrator. Deliver a lifecycle/state matrix, launch instructions, repeatable A/B project setup, guarded-write tests and documented local security limits. Use SOL high and a separate worktree when parallel with M1-03.

## Implementation evidence

Implemented with the shared runner/source-engine handoff on 2026-09-14. See the [reviewed handoff](../handoffs/m1-02-and-m1-03.md) and [completed execution plan](../exec-plans/completed/m1-02-project-runner.md) for exact checks, source fingerprints and downstream limits.
