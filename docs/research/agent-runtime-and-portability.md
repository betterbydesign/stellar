# Stellar research: agent runtime, workflow durability, and portability

Research date: 2026-09-13, with a 2026-09-14 reuse refinement. Status: architecture recommendation, not an implementation commitment. The initial report used user-reported Agent Hub architecture. A subsequent read-only source audit verifies reusable auth/tenancy, Letta chat, skills/workflow templates and Vault connections, and identifies unfinished features. Packaging and media recommendations in the [shared-foundation decision](../decisions/002-shared-foundation-media-and-integrations.md) supersede the initial separate-implementation assumptions below; vendor-runtime claims retain their original research date.

## Recommendation

Use a web application with a familiar Next.js / Convex / WorkOS control plane, a replaceable Letta Agent SDK integration, and a separate execution service for repository work, Astro previews, builds, and browser QA. Keep client content in its chosen WordPress or Neon backend. Reuse verified Agent Hub skill/workflow modules where ownership permits and extend their portable contracts for Stellar; do not build a parallel definition system unnecessarily.

Treat Letta as the leading agent-runtime candidate because its current platform now addresses coding workspaces and persistent agents directly. Do not make Letta memory, conversation IDs, Mods, or its legacy AgentFile the canonical representation of a Stellar project. Integration parity should mean compatible business inputs, artifact outputs, permissions, and workflow semantics; sharing a live agent instance is optional.

The architecture below is a proposed allocation of responsibilities, not a claim that these vendors automatically compose into a complete product.

| Layer | Proposed owner | Stored or executed here |
| --- | --- | --- |
| Product interface | Stellar web app | Project setup, canvas, IA, schema editor, content, reviews, workflow builder, client portal |
| Control plane | Stellar backend / Convex | Tenancy, roles, projects, draft revisions, workflow runs, approvals, comments, deploy manifests, task sync, notifications, audit history |
| Agent reasoning and working memory | Letta through a Stellar runtime adapter | Persistent client/project agents, conversations, tool calls, bounded specialist tasks |
| Durable workflow coordinator | Convex Workflow initially | SOP stage transitions, approval waits, retries, budgets, parallel jobs, recovery |
| Repository and browser execution | Isolated worker or managed Computer | Checkout, installation, Astro dev server, preview ports, builds, browser tests, screenshots |
| Published CMS data | WordPress or Neon adapter | Client-owned content records, relationships, media references, publication state |
| Artifact storage | Git and object storage | Code, design-system packages, schema migrations, screenshots, reports, immutable handoff snapshots |
| Cross-app context | Stellar context broker; optional Zep adapter | Authorized retrieval with provenance, temporal validity, ownership, and export policy |
| Plugin execution | Separate capability-scoped service | Third-party extensions; never implicit authority over the agent harness |

## What changed in Letta, and why it matters

The current documentation recommends `@letta-ai/letta-agent-sdk` for application developers and places the previous API documentation under **V1 SDK (legacy)**. The live release pages showed Agent SDK **v0.8.4** and Letta Code **v0.32.6**, both with September 13 release entries when checked. The docs changelog explicitly warns of delay and still begins with older 0.27.x entries. Pin versions and test the actual installed runtime; do not infer availability from an older Agent Hub integration or a search snippet. [Agent SDK deployment](https://docs.letta.com/agent-sdk/deployment), [Agent SDK releases](https://github.com/letta-ai/letta-agent-sdk/releases), [Letta Code releases](https://github.com/letta-ai/letta-code/releases), [changelog](https://docs.letta.com/reference/changelog).

| Capability | Verified current meaning | Stellar implication |
| --- | --- | --- |
| Agent SDK | High-level interface over managed cloud, local, and operated remote runtime modes | Prefer an SDK adapter over embedding Letta's low-level protocol throughout the application |
| Computers | Where shell commands, files, and local tools execute; distinct from agent identity/memory | A coding worker can change without changing the project agent |
| Cloud sandboxes | Managed isolated shell/filesystem environments; SDK or web sessions can provision them | Candidate for initial repository execution; validate preview routing, runtime limits, and economics |
| App Server | Always-on Letta harness with direct SDK / WebSocket clients; can use local or cloud agent state | Candidate inside Stellar-controlled isolated workers; separate from a machine connected through Letta's Computer picker |
| ACP | Agent Client Protocol adapter; client sessions map to conversations, with native client approval handling | Useful later for editor/desktop interoperability; not a project archive, CMS schema, or workflow format |
| Channels | External messaging adapters and routing into agent conversations | Optional communication integrations, separate from Stellar's internal workflow event bus |
| Mods | Fully trusted code inside the Letta Code process, with tool, event, permission, provider, and UI hooks | Only reviewed first-party harness extensions; unsuitable as the safe third-party plugin boundary |
| Shared memory | Organization-owned Git repositories attached to cloud agents | Possible shared client knowledge transport; requires explicit synchronization and ownership policy |

Sources: [Computers](https://docs.letta.com/platform/computers), [cloud sandboxes](https://docs.letta.com/platform/computers/cloud-sandboxes), [App Server](https://docs.letta.com/platform/app-server), [ACP](https://docs.letta.com/platform/acp), [Channels](https://docs.letta.com/configuration/channels), [Mods](https://docs.letta.com/configuration/mods), [shared memory](https://docs.letta.com/concepts/shared-memory).

### Three execution concepts must remain separate

1. **Legacy server-tool execution:** the V1 API supports custom server functions; its documentation discusses sandbox requirements for TypeScript functions and recommends skills for new Letta app / Agent SDK usage. This is not evidence of a durable Astro project workspace. [Custom server tools](https://docs.letta.com/v1-sdk/tools/server-tools).
2. **Coding Computer:** the current managed sandbox or selected machine runs shells, file edits, dependency installation, and computer-scoped tools. The agent can move between machines, but its repository checkout and local secrets do not move automatically. [Computers](https://docs.letta.com/platform/computers), [cloud sandboxes](https://docs.letta.com/platform/computers/cloud-sandboxes).
3. **Product orchestration:** Stellar decides what a stage means, who can approve it, which revision is being built, and whether a publication is complete. A running conversation is not that durable business record. Letta's own App Server guidance assigns product objects, durable job results, authorization, external credentials, and recovery responsibilities to the application. [Integration patterns](https://docs.letta.com/platform/app-server/integration-patterns).

### Lifecycle and deployment risks to validate

The SDK refreshes managed sandbox TTL while a session is active. After closing, a sandbox is retained until expiration; expired workspaces require a fresh session and restored files. The documented recovery case permits retrying a pre-send sandbox-expiration error. Failures after a successful send must be reconciled before retrying, because the turn may have started. Selecting a Computer and configuring a managed sandbox are mutually exclusive; the older `environment` selector is deprecated. [Deployment and recovery](https://docs.letta.com/agent-sdk/deployment).

Agent memory and conversation history persist across connections, but tool registrations, permission callbacks, working directory, and environment selection have session scope. Missed streaming events are not automatically replayed by the SDK: consumers must reconcile history or bootstrap a snapshot. Pending runtime approvals should not be treated as a permanent Stellar approval record. Stateless sessions are available for work that should not modify long-term agent memory. [Sessions and durability](https://docs.letta.com/agent-sdk/sessions).

These findings favor explicit worker jobs and checkpointed artifacts. A preview or build that has to survive browser closure should be owned by a backend worker, not by a browser's SDK session.

### Letta advantages and costs

**Advantages:** the Agent SDK offers one integration surface across managed and operated runtimes; current Computer support fits code-building tasks; persistent agents and shared memory suit ongoing client relationships; adopting the same runtime as Agent Hub can reduce later adapter work. Letta's current App Server documentation explicitly supports custom controllers and parallel agent runtimes. [App Server](https://docs.letta.com/platform/app-server).

**Costs and uncertainties:** there are multiple generations of APIs and memory concepts; the SDK and harness remain pre-1.0; release activity includes active fixes around reconnects, subagent routing, and sandbox transfers. Hosted tenancy, contractual isolation, data residency, quota/concurrency limits, cost attribution, preview networking, and the user's existing plan entitlements need an authenticated spike or vendor confirmation. These properties were not established by this documentation review. [Current releases](https://github.com/letta-ai/letta-code/releases).

**Decision:** adopt Letta behind a narrow `AgentRuntime` boundary after a proof of execution/recovery. Do not build a second full agent framework merely to hedge. Keep typed tools, explicit artifacts, run IDs, and standard events as an exit path if a particular agent task later needs another provider.

## Reusing the Agent Hub stack

| Choice | Benefit for Stellar | Tradeoff / decision |
| --- | --- | --- |
| Next.js + Convex + WorkOS | Familiar product development stack; good fit for collaborative portal state | Recommended control plane; independent Stellar deployment and authorization required |
| Neon for every control-plane and CMS table | A single relational foundation could simplify some administration/reporting | Viable alternative, but live collaborative state and durable orchestration still need implementation; do not switch solely because client CMS data uses Neon |
| Letta for all persistent project agents | Reuses the user's agent ecosystem and emerging workspace model | Recommended candidate; avoid vendor IDs as domain IDs |
| Provider calls without persistent agent state | Good for bounded classification, extraction, or deterministic formatting tasks | Allow behind the same task interface when no learning or computer environment is needed |
| Zep everywhere on day one | Potential context parity with Agent Hub | Defer as a mandatory dependency until cross-project temporal retrieval is demonstrated to help; maintain a compatible context contract now |

WorkOS supports organization membership roles, permissions in session JWTs, and server-side enforcement. Stellar still needs explicit project/client grants and resource checks. An agency employee who can manage one client must not gain every client's content by sharing an agency organization. Model client reviewer, content editor, designer, developer, publisher, agency admin, and service agent capabilities separately; publication and schema migration need distinct permissions. [WorkOS RBAC integration](https://workos.com/docs/rbac/integration).

The public web UI should connect to Stellar's authenticated API and event stream. The SDK does have a browser import for cloud/remote backends, but it cannot run the local backend or MCP servers, and its documentation warns that browser API keys are visible. A backend broker remains the proposed default; never ship a shared Letta organization key to portal users. [Browser SDK](https://docs.letta.com/agent-sdk/browser).

## Durable SOP workflows and QA teams

Use a versioned, declarative workflow definition whose steps reference registered implementations. The coordinator should persist `workflowDefinitionVersion`, project/revision IDs, actor and tenant IDs, inputs, output artifact hashes, approval state, provider job IDs, budgets, and retry history.

Convex Workflow supports sequential and parallel steps, retries, external events for human approvals, observable status, and restart. Its handler must remain deterministic: meaningful step changes can break active workflows. Cancellation does not stop an already running action. Large results should live outside the workflow journal and be referenced by ID. These constraints require versioned workflow handlers plus explicit cancellation of external workers. [Convex Workflow documentation](https://github.com/get-convex/workflow).

Proposed stage shape:

`brief → IA → wireframes → visual system/screens → data model/content → build → preview QA → release → post-release QA`

This is a dependency graph with page/section batches, not a project-wide lockstep wizard. Each deployment selects an approved release set and its transitive dependencies: routes, menus, components, tokens, collections, schema changes, and content snapshots. Other pages can remain in draft. A project should be able to revisit IA or design while deployed pages stay live.

For each step, record a schema-validated result and evidence; a conversational answer alone cannot advance a required gate. Bind approvals to an exact artifact or release hash. If code, tokens, content, or dependencies change, invalidate affected approvals and downstream checks. Persist authorization before execution and recheck it immediately before a sensitive operation.

Retries should use operation keys, provider deployment IDs, content revision checks, and reconciliation. An ambiguous network response must not result in duplicate deployments or repeated content publication. Reversible staging writes can be automated; destructive migrations and production releases follow project policy. These are proposed Stellar guarantees, not guarantees supplied by an LLM or transport.

Run QA as a bounded set of specialists with a deterministic coordinator:

| Specialist | Inputs | Required output |
| --- | --- | --- |
| Visual / responsive | Pinned preview, approved screens/Figma versions, viewport matrix | Screenshot evidence and element-linked deviations |
| Design system | Tokens, component contracts, code + rendered styles | Violations with rule IDs and affected components |
| Content / IA | Approved scope, sitemap, copy, navigation | Missing content, dead ends, hierarchy or navigation defects |
| Accessibility / behavior | Routes, roles, forms, keyboard flow | Reproducible failures and machine-check evidence |
| SEO / performance | Published and preview URLs, metadata contract, budgets | Audit results with environment and collection time |

Separate agent judgment from deterministic pass/fail checks. Aggregate findings by stable issue fingerprint; create a proposed fix task rather than a repair loop with unlimited authority. Use separate conversations for parallel jobs and a single writer or branch per proposed patch. Letta recommends one active turn per agent/conversation from a controller and separate runtimes for parallel work. [Concurrency guidance](https://docs.letta.com/platform/app-server/integration-patterns).

Post-release QA should inspect the actual deployment and create follow-up tasks; preview QA should catch blocking defects before release. Keep the two evidence sets separate. Preserve the precise commit, deployment, content snapshot, design-system version, viewport, browser, and reference-artifact revision for every finding.

## Context ownership and Agent Hub integration

Keep four separate sources of truth:

1. **Approved project facts and artifacts:** Stellar's immutable revisions and client-owned source documents.
2. **Agent working memory:** Letta MemFS or equivalent; useful for continuity, never authority to publish or change requirements.
3. **Shared knowledge:** approved client/team material, exposed through a scoped context broker.
4. **Temporal retrieval index:** optional Zep graph derived from source records, rebuildable and revocable.

Current Letta shared repositories are owned by a Letta organization and require cloud-hosted agents. Agents synchronize with normal Git operations; shared memory is not an automatically consistent shared mutable block. The docs recommend migrating older shared-block usage to repositories. This is useful for curated standards and client knowledge, but concurrent edits and cross-organization sharing still need product policy. [Shared memory](https://docs.letta.com/concepts/shared-memory).

Zep distinguishes when a fact became known from when it was valid through created/expired and valid/invalid timestamps. Episode associations provide evidence lineage. Deleting an episode does not necessarily delete nodes/edges still supported by other episodes. A cross-app deletion request therefore needs a source-to-derived-data inventory, not just removal of one message. [Zep facts](https://help.getzep.com/facts), [graph deletion](https://help.getzep.com/deleting-data-from-the-graph).

Proposed context envelope: stable client/project identifiers, source system and source record ID, author/actor, collection time, effective-from/to, supersedes relationship, consent/export policy, classification, artifact hash, and provenance links. Retrieval must enforce tenant/client/project scope server-side and report its source and as-of time. Stale or conflicting facts should remain visible as conflicts, not silently become requirements.

Initially, Agent Hub can export an approved snapshot, and Stellar can import it without any Agent Hub network dependency. Later, an optional connector can retrieve updates and submit proposed knowledge changes. Do not share an unrestricted agent or raw agency transcript across client portals. Revocation must cover future retrieval, local caches, exported knowledge allowed by policy, attached repositories, and derived indexes.

## Proposed portable Stellar contract

Define `.stellar` as a versioned project handoff archive with a machine-readable manifest and inspectable artifacts. This is a new proposed Stellar format, not an existing interoperable standard.

| Contract area | Minimum contents |
| --- | --- |
| Identity / compatibility | Format version, export ID, source app version, stable project/client IDs, schema versions, required features |
| Brief / scope / IA | Approved brief, goals, sitemap/routes, menu model, page scope and status |
| Design | Design-system ID/version, tokens, component contracts, screens/wireframes, responsive constraints, Figma references and pinned versions where available |
| Content / data | Logical collection/schema model, relationship graph, field mappings, content snapshots or authorized references, media inventory |
| Code / release | Repository reference and commit, template/blueprint version, build configuration, approved release sets, checksums |
| Workflows | Versioned DAG/step definitions, tool capability requirements, input/output schemas, reusable skill references with hashes, selected portable checkpoints |
| Context / lineage | Approved context snapshot with temporal provenance and export policy, external ID mapping, origin/import history |
| Evidence | Review decisions bound to artifact hashes, screenshots, audit results, unresolved issues |
| Connections | Required provider types and placeholders for connections; no API keys, credentials, or live sandbox tokens |

An import first validates format, size, paths, hashes, dependencies, and permissions, then presents a compatibility report. Imported workflows and plugin requirements are data until locally authorized; import must not execute arbitrary scripts. The receiving app creates its own IDs, connections, and runtime sessions while preserving origin IDs for traceability.

Agent Hub and Stellar should share tested contracts and suitable implementation packages. The v0.5 default is a separate Stellar application/backend; a common platform deployment remains an ownership-dependent option. Neither arrangement should require unrelated Agent Hub features for Stellar-only users. Keep runtime binding separate from the workflow definition: `generate_wireframe`, `model_collection`, or `review_release` should reference typed capability contracts, while a Letta adapter chooses the actual agent/session. This allows compatible workflow builders without forcing identical interfaces.

Do not use Letta's legacy `.af` AgentFile as the Stellar wrapper. Beyond the mismatch in scope, Letta Code's September 11 release notes explicitly list removal of deprecated AgentFile import/export CLI commands. Runtime-specific exports may be optional attachments only when validated. [Letta Code releases](https://github.com/letta-ai/letta-code/releases).

## Validation spikes before architecture lock

| Spike | Concrete acceptance evidence |
| --- | --- |
| Runtime parity | Pin Agent SDK/harness; create agent; perform one code edit through cloud sandbox and one through operated worker; compare outputs and tool permissions |
| Preview execution | Clone pinned Astro template, install, expose an authenticated preview with working assets/HMR, run browser QA, export artifacts; measure startup and per-project cost |
| Failure recovery | Close browser; restart controller; expire sandbox; interrupt worker; lose network after send; verify no duplicate release or lost accepted artifact |
| Tenant isolation | Two clients with separate projects, memory, repos, credentials and tools; prove cross-client tool and retrieval requests are rejected server-side |
| Workflow upgrade | Pause one workflow for approval, deploy a new definition version, resume original version, cancel external work, and verify idempotent release behavior |
| Agent Hub handoff | Import a fixture containing approved IA, tokens, schema and one page; build it without Agent Hub access; re-export and validate compatibility |
| Context quality | Use a dated client requirement that is later superseded; confirm correct as-of retrieval and source attribution; delete its sources and test revocation effects |
| Multi-agent QA | Run several bounded reviewers over the same pinned release; retain evidence, deduplicate findings, route a repair through a separate branch and approval |

## Questions for the next Agent Hub review

- Which Letta SDK/API generation and memory model is Agent Hub currently running, and is migration already planned?
- Is client context canonically owned by Agent Hub, the client organization, or an independent shared context service?
- Are workflow definitions already versioned and exportable, and do they contain business contracts or provider-specific prompts/tool IDs?
- How do agency organizations, client organizations, project membership, delegated agents, and WorkOS identities map today?
- Does the desired handoff contain approved artifacts only, or also unfinished tasks and selected private reasoning context? The recommended default is approved artifacts plus unresolved questions, with explicitly selected supporting context.
- Should agents use centrally billed Stellar connections, client-owned provider accounts, or both? This affects quotas, ownership, revocation and deployment credentials.

No authenticated Letta sandbox, deployment, or Agent Hub integration was executed during this research. Hosting limits and cost projections remain validation work, not established guarantees.

## Research method

Used the Context7 skill and resolved library IDs before querying `/websites/letta`, `/get-convex/workflow`, `/websites/help_getzep`, and `/websites/workos`. Followed with the official current documentation and release pages linked above. The callable Context7 query schema did not expose the skill's optional `researchMode` field, so direct primary-source reads supplied missing release/lifecycle evidence.
