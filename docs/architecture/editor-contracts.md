# M1 editor contracts and fixture

The first implementation slice provides `packages/contracts` and the independent `fixtures/astro-style-lab` site. It establishes the data contract and known source cases for the local runner and source engine. No editor, runner, filesystem writer or authorization service is implemented by this package. The [M1-01 PRD](../prds/m1-01-contracts-and-fixture.md) defines its acceptance boundary.

## Package and entry points

Import runtime schemas, inferred TypeScript types, examples and guards from `@stellar/contracts`. The public entry point is [index.ts](../../packages/contracts/src/index.ts); generated `dist` output is ignored and compiled by root verification/build commands. The package uses Zod 4.6.5 and TypeScript 6.0.3; the web workspace retains its own TypeScript 7 version. The Astro fixture is deliberately outside npm workspaces and has its own exact dependency lock.

| Area | Public schemas or guards |
| --- | --- |
| Manifest | `ProjectManifestSchema`, `parseProjectManifest`, `resolveTokenLeaf` |
| Project lifecycle | `ProjectSchema`, `RegisteredWorkspaceSchema`, `SessionSchema`, `PageSchema`, `ListProjectsResponseSchema`, `GetProjectResponseSchema`, `OpenSessionRequestSchema`, `SessionResponseSchema`, `ListPagesResponseSchema` |
| Source and controls | `SourceModelSchema`, `SourceTargetSchema`, `ElementSourceTargetSchema`, `StyleControlSchema`, `TokenDefinitionTargetSchema` / `TokenDefinitionSchema` |
| Commands | `CommandSchema`, `PrepareChangeSchema`, `ApplyChangeSchema`, `HistoryCommandSchema`, `ReconcileRequestSchema` |
| Results | `ChangeProposalSchema`, `SourcePatchSchema`, `ChangeReceiptSchema`, `PrepareChangeResponseSchema`, `ApplyChangeResponseSchema`, `RequestOutcomeSchema`, `HistoryEntrySchema`, `HistoryResponseSchema`, `EditStateSchema` |
| Frame | `PreviewEnvelopeSchema`, `validatePreviewEnvelope` |
| Guards | `validatePrepareChange`, `validateApplyChange`, `validateHistoryCommand`, `validateReconcileRequest`, `assertExecutableProject`, `validateStyleValue`, `validateTokenValue`, `makeError` |

Most exported schemas have the same inferred type name without `Schema`. The named concrete token type is `TokenDefinition`. Read the actual exports before extending them. [Package guidance](../../packages/contracts/README.md) and validating [examples](../../packages/contracts/src/examples.ts) cover intended use. Examples are protocol illustrations, not an alternative authoritative fixture manifest or byte-accurate patch against the real site.

## Identity and transport

`PROTOCOL_VERSION` is `stellar.editor.v1`; the fixture's separate `MANIFEST_VERSION` is numeric `1`. Project/page IDs are durable, while session, frame, preview-generation and revision-scoped target IDs have separate purposes. `ProjectRevisionSchema` represents an opaque version; it must not be replaced with a parser node ID or preview process generation.

The future runner persists a new revision after a relevant source or manifest byte change. Reparse, unchanged reopen and preview restart preserve source revision. A restart rotates preview generation. Undo to earlier bytes receives a new source revision. These are obligations on M1-02/06, not persistence implemented by the contract package.

Server requests carry a version, project/session scope where applicable and request ID. The [PRD operation table](../prds/m1-01-contracts-and-fixture.md#endpoints-and-routes) is the route contract; M1-02 creates routes. Unknown fields and protocol versions fail validation. Error helpers emit canned safe messages and consistent HTTP status/recoverability; callers must not substitute raw exceptions or host paths.

The runner supplies its own current source model and validated manifest to `validatePrepareChange(input, context, manifest)`. `validateApplyChange(input, context, proposal, manifest)` additionally binds the stored proposal to current scope/revision, its target's actual allowed file and exact declared impact. Style edits affect the selected page/anchor; shared token edits use the concrete token's manifest impact. A proposal contains a single relative file, SHA-256 expectation, UTF-8 byte range, expected old text and replacement text. It is a preview until applied.

The guards do not authenticate an operator, validate live file bytes, lock a workspace, verify a patch's semantic transformation or write a file. M1-02 must load the proposal server-side by ID, verify current source and patch identity under a write lock, enforce filesystem containment, and persist source/revision/receipt atomically. M1-03 must create a minimal patch for the owned declaration. Never accept a browser-supplied proposal object as a trusted stored proposal.

Prepare, apply, undo and redo use different request IDs. Retain an ID only for retrying the same intent. The future idempotency ledger is keyed by authorized operator, project and operation, and records an intent fingerprint and durable result. Changed reuse conflicts. A replacement session can reconcile an older project's authorized result, including an old-session receipt; it cannot replay that session's write capability. The envelope records the lookup request and original operation separately.

## Source and edit surface

The authoritative [fixture manifest](../../fixtures/astro-style-lab/.stellar/project.json) describes two pages, eleven targets, four tokens and fifteen property/scope rules. Six targets are editable. Two pairs of shared component internals and one generated list remain read-only. Structural locators identify authored source; repeated components use definition/call-site context, while runtime occurrences are added by M1-04.

Every supported local property has a separate fallback and override identity. Reset removes only the override declaration and preserves both authored rules. Empty override rules are deliberate insertion points. The six possible properties are `color`, `background-color`, `padding-inline`, `padding-block`, `gap`, and `border-radius`. Explicit typed colors, bounded `px`/`rem` values and allowlisted token names exclude arbitrary CSS expressions.

Editable scopes are `base` and named `mobile`, exactly `(max-width: 767px)`. Preview widths are independent of edit scope. Other authored responsive layout rules are read-only. Concrete color and spacing tokens are base-only; semantic aliases remain `var(...)` references and resolve to distinct leaf targets. Token controls expose authored values, units, bounds, aliases and declared impact without making the UI reconstruct a manifest. Both pages consume the same two semantic aliases.

The [source verifier](../../scripts/check-fixture.mjs) parses Astro without evaluating frontmatter and parses CSS with PostCSS. It checks fixture-root containment, unique static source locators, repeated/dynamic cases, selector ownership, exact media identity, declaration presence/uniqueness, concrete token bounds, alias references and declared usage. It is a controlled-fixture assertion, not the general source engine or a CSS cascade solver. The [regression tests](../../test/fixture.test.mjs) deliberately mutate those assumptions.

## Browser and capability boundary

The preview envelope carries project, session, generation, frame, page and source revision for ready, selection, geometry, clear and diagnostic messages. Selection reports an anchor/source key and occurrence; it has no write command. M1-04 must also validate the exact iframe window and origin before accepting a message and uniquely join the observation to the current source model.

HTML can appear as future project metadata, but `assertExecutableProject` refuses it in M1. Fixture capabilities explicitly reject HTML editing, arbitrary Astro import and client authorization. No Convex, WorkOS, Letta, CMS, company repository or external account is needed for this slice.

## Reproduction and handoff

From the repository root, run `npm ci`, `npm run fixture:install`, `npm run verify`, then `npm run build`. Verification includes contracts and source assertions; build compiles contracts, Next.js and the standalone fixture. CI uses the same sequence and caches both locks. Run `npm run dev --prefix fixtures/astro-style-lab -- --host 127.0.0.1` to inspect the original site separately. It uses no remote assets or editor markers; its [README](../../fixtures/astro-style-lab/README.md) records provenance and the target matrix.

M1-02 creates separate runtime working copies in a documented ignored local state directory and keeps the seed untouched. M1-03 consumes the same manifest and produces source models/proposals. Their work may proceed in parallel after this change is integrated. See the [M1-01 handoff](../handoffs/m1-01.md) for review and verification evidence.
