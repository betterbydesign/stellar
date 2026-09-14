# M1-03 — Source engine and bounded CSS edits

Status: implemented and independently reviewed locally; included in the authorized foundation commit. Local identifier M1-03. Parent: [M1 index](README.md); bounded source-preservation and token-editing foundations for product R04/R06/R07.

## Overview

Build the pure source-analysis and patch-preparation layer for the first local browser editor proof. For a registered, trusted Astro fixture, it will map a rendered selection to an unambiguous source target and prepare one reviewable CSS declaration edit at a time. It will never write a file or serialize an entire Astro page as part of an M1 style change. The project runner in [M1-02](m1-02-project-runner.md) will enforce filesystem access, current revisions, and durable application of the patch; the browser integration in [M1-04](m1-04-canvas-and-selection.md) will instrument the Astro preview.

## Prerequisites

- [M1-01](m1-01-contracts-and-fixture.md) will define the common protocol, fixture manifest, authored element anchors, approved CSS files, selector scopes, token definitions, alias policy, and responsive widths. Its contract will be authoritative wherever this PRD describes a shape conceptually.
- The adjacent `../stacki-reference` checkout at commit `800fa5270523e7df3afbcaeee8bdbb3a6fe07b49` is reference material only. Stellar will build and test without that sibling checkout.
- No account, remote service, company-site repository, CMS, or agent runtime is required.

## User Stories

- As an agency editor, I want a clicked element to identify a specific editable style source so I can understand what an edit will change.
- As an agency editor, I want to change or reset a local override and change an approved shared token so the saved Astro preview reflects an intentional scope.
- As a developer, I want unrelated source bytes and repeated component instances protected so a visual edit cannot silently change another element.
- As a developer, I want a proposed inverse edit so a later history control can safely request an undo against the exact saved revision.

## Technical Requirements

### Endpoints and routes

M1-03 owns no HTTP endpoint, route, authentication middleware, or filesystem handler. It will expose deterministic in-process read, prepare, and inverse operations from `packages/editor-core/src`. M1-02 will expose and authorize runner operations; M1-04 and [M1-05](m1-05-style-inspector.md) will consume the shared contracts. No browser input will directly select an absolute file path or byte range to write.

### Interface

The engine will accept a runner-supplied snapshot of allowlisted source files, their relative paths and bytes, a `projectRevision` (the same opaque revision used by the shared request/response envelopes), and the M1-01 fixture manifest. It will return a source model with opaque, revision-scoped `targetId` values. A target will retain its authored/fixture anchor, route, relative source file, source locator, declared responsive scope, and the source-side component/instance anchor where applicable. Runtime occurrence is observed by M1-04 and joined to this source model for unique resolution; the pure parser does not infer rendered occurrence counts. A parsed node's transient ID or index path alone will not be treated as a durable identity. The preview integration may carry a revision-scoped source key, but the engine must resolve and validate it against its current model before preparing an edit.

The supported M1 commands are `style.set`, `style.reset`, and `token.set`. Each request will carry the M1-01 common envelope: `protocolVersion`, `projectId`, `sessionId`, `requestId`, `expectedRevision`, `targetId`, and `command`. `style.set` will set one approved `color`, `background-color`, `padding-inline`, `padding-block`, `gap`, or `border-radius` declaration for a uniquely authored fixture class in the base or explicitly declared mobile scope. It may replace an owned override or insert one in an existing, allowlisted override rule; the authored base/token fallback is separate and not editable by this command. `style.reset` will remove that explicit override, restoring the inherited or token-bound value, without deleting other declarations, the rule or the separate fallback. Reset of the fallback/design-system default is refused. `token.set` will replace one approved base color or length custom property in the declared file, selector, and at-rule context. It uses a distinct token-definition target linked from the selected element, and edits only a manifest-approved concrete leaf definition. It will not rename variables, create a new token or replace a semantic alias with a literal. Alias declarations remain read-only and their chains remain intact for bounded impact analysis. The inspector will distinguish the literal authored value, an alias such as `var(--color-brand)`, and the computed preview value; the engine will not guess a source declaration from a computed value.

`prepare` will return either a typed refusal with a reason or a proposal containing `proposalId`, `baseRevision`, target and declared impact scope, and a `sourcePatch` for one file. The patch will specify the relative file, exact old byte span, replacement bytes, and expected source bytes/digest so it can be reviewed before application. `inverse` will derive a guarded reverse patch from the applied change; it will not itself undo a file. M1-02 will assign the authoritative receipt and apply only after checking the project revision and approved file capability. The apply result will include `receiptId`, old/new revisions, `changedFile`, and `requestId`. A relevant source or manifest byte change rotates the persistent project revision and requires target re-resolution. No-op reads/reparses and ordinary restart preserve that revision; preview generation can rotate independently. Prepare/apply/undo/redo use separate logical-operation request IDs, with retries retaining the ID only for identical intent, as specified in M1-01.

The engine will refuse a visual edit when the element cannot be mapped to a unique source target, the clicked DOM occurrence represents a repeated component with no instance-specific authored source, the selected property is inherited from an ambiguous rule, the variable's declaration scope is ambiguous, an alias is unresolved or cyclic, the value fails the M1-01 manifest's type/bounds, or the source cannot be preserved. Unsupported nodes will remain inspectable with a disabled edit reason. M1 will not offer arbitrary props, text, structural commands, component-definition edits, framework component internals, or broad CSS selector creation.

### Data model

M1-01 will own the protocol and manifest types in `packages/contracts`. M1-03 will own internal source models and patch/inverse implementations in `packages/editor-core/src`, with no database schema. A CSS declaration identity will include relative file, at-rule/theme context, selector, property or custom-property name, source span, and source revision. This prevents duplicate `--name` declarations in different scopes from collapsing into one target. The engine will preserve aliases as authored, report the chosen declaration and known fixture impact, and mark effects outside the declared fixture scope as unknown rather than claiming a complete dependency graph.

Astro parsing for source location will be a pure function of source bytes. It may use a narrow, attributed extraction from Stacki where useful, but filesystem-dependent helpers will stay outside editor-core. The actual M1 write path will patch only the declaration span or insertion point after validating the surrounding rule and original text. A no-op command will return no patch and leave bytes unchanged. Opening or reading a fixture will never rewrite it. No generated preview marker will be saved into project source.

### Integrations

M1-02 will provide trusted project snapshots and guarded single-file writes. M1-04 will map development-only Astro preview markers to the engine's revision-scoped source keys, including occurrence information. M1-05 will present editable scope, literal/alias/computed values, impact, and refusal reasons. [M1-06](m1-06-history-and-editor-proof.md) will consume proposals, receipts, conflicts, and inverses for history and the browser proof. The engine will not import Electron preload, IPC, terminal, Git, CMS, or package-install behavior from Stacki.

## Acceptance Criteria

- [x] M1-03-A: The M1-01 fixture's supported Astro element resolves from a preview source key to one revision-scoped `targetId`; an unsupported or ambiguous selection produces an explicit non-editable reason.
- [x] M1-03-B: The same component rendered more than once cannot cause an accidental per-instance CSS edit. A repeated occurrence is editable only when M1-01 supplies a unique authored instance target and the engine proves its source scope.
- [x] M1-03-C: `style.set` changes or inserts exactly one allowed declaration in an existing local fixture rule at base or declared mobile scope. `style.reset` removes only that explicit declaration; unrelated source bytes are identical.
- [x] M1-03-D: `token.set` changes exactly one approved shared base color or length token declaration. The proposal identifies its file, selector/at-rule context, raw value, alias relationship when present, and manifest-bounded impact; duplicate-name declarations cannot be silently conflated.
- [x] M1-03-E: Each accepted prepare result has a one-file, reviewable patch and guarded inverse. Repeating a no-op edit yields no source change or new history entry.
- [x] M1-03-F: The engine rejects invalid values, disallowed properties/scopes, stale or missing revision-scoped targets, ambiguous inheritance, unresolved/cyclic aliases, and source shapes that would require a whole-file rewrite.
- [x] M1-03-G: Read and prepare operations perform no filesystem writes or process spawning. Imported code and tests are self-contained in Stellar, retain required Stacki MIT attribution, and need no sibling checkout.
- [x] M1-03-H: The supported fixture remains byte-identical after read/no-op and after applying a prepared patch to an in-memory snapshot and reparsing without a new edit. One accepted edit alters only the intended declaration span, and the resulting source passes the engine's Astro/CSS parsing checks. Real rendered behavior is a downstream M1-06 acceptance gate, not a prerequisite for closing M1-03.

## Testing Plan

Unit tests in `packages/editor-core` will use the M1-01 fixture and colocated narrow bad cases: duplicate token names under different selectors or media rules, direct values and aliases, invalid/cyclic aliases, malformed CSS, missing declaration insertion, reset with neighboring declarations, repeated component occurrences, changed source text, and unsupported Astro syntax. Tests will assert pure determinism, byte-identical no-op, one-declaration diff locality, inverse correctness, and refusal without a patch. The runner's actual stale-revision rejection and browser persistence are owned by M1-02 and M1-06; engine tests will prove it cannot prepare from a stale source target. M1-06 will complete the integrated render/select/edit/reload/reopen evidence. Run the root harness verification groups for code changes (`npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` when integrated into the user-facing proof); record only results actually observed.

## Rollback Plan

Remove or revert the editor-core package and its imports while leaving the registered fixture and application scaffold intact. A committed source edit can be reversed only with its guarded inverse against the expected current revision, or by a reviewed Git change; no deployment rollback applies because Stellar has no configured deployment.

## Timeline

1. **First shippable slice:** read the M1-01 fixture into a pure, revision-scoped source model and mark editable versus unsupported targets without writing source.
2. Prepare and test local CSS declaration set/reset patches with byte-preservation guarantees.
3. Prepare and test manifest-bound shared token edits, alias reporting, scoped impact, and guarded inverse patches.
4. Hand the tested snapshot/proposal interface to M1-02 and source-key mapping examples to M1-04. Engine completion uses pure fixture tests and does not wait for M1-04 to exist; browser integration is validated by M1-04 and M1-06.

## Dependencies On Other Work

- M1-01's contract and fixture manifest must be agreed before implementing target IDs, command validation, and allowed CSS edits.
- M1-03 and M1-02 may be built in parallel against M1-01's shared contract. M1-02 remains the sole authority for real filesystem application, revision rotation, capability checks, and receipts.
- M1-04 depends on the source-key mapping supplied here; M1-05 uses the prepare/refusal model; M1-06 uses all prior slices for end-to-end acceptance.

## Agent handoff

- **Owned implementation:** `packages/editor-core/src/**` and its colocated engine tests, plus this PRD. Add only the package wiring needed for root workspace checks after coordinating with M1-01/M1-02 owners.
- **Prohibited edits:** M1-01's `packages/contracts/**` and shared fixture files; M1-02's runner/filesystem handlers and receipts; M1-04's `packages/astro-editor-integration/**` and preview instrumentation; M1-05's inspector UI; M1-06's history UI and end-to-end evidence. Do not edit the company-site repositories or `apps/web/app/globals.css` for the fixture's tokens.
- **Upstream provenance:** inspect `../stacki-reference/electron/astroParser.js` for parse/source-location behavior, `electron/cssVars.js` for PostCSS declaration offsets, `test/roundtrip.test.js` and `test/expectations.json` for preservation gaps, all pinned to commit `800fa5270523e7df3afbcaeee8bdbb3a6fe07b49`. Copy only selected code that is needed, record exact file/revision provenance, and retain the preserved MIT notice. The Stacki parser's generated node IDs, disk-reading `locateSelection`, and whole-model `page:write` are not the M1 identity or write contract.
- **Prerequisite handoff:** obtain M1-01's manifest and command-envelope definitions. Return to the runner owner a pure patch/apply input shape and to the selection owner the source-key/occurrence rules before either integration hardens its API.
- **Evidence to provide:** test output for byte identity, one-declaration diff, scoped duplicate-token selection, repeated-occurrence refusal, invalid alias/value refusal, and inverse behavior; example proposal and typed refusal payloads; exact code provenance for any ported lines. Update the active ExecPlan and architecture docs only through the coordinating parent when cross-slice behavior becomes settled.

## Implementation evidence

Implemented with the shared runner/source-engine handoff on 2026-09-14. See the [reviewed handoff](../handoffs/m1-02-and-m1-03.md) and [completed execution plan](../exec-plans/completed/m1-02-project-runner.md) for exact checks, source fingerprints and downstream limits.
