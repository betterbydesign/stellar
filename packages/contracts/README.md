# @stellar/contracts

Shared, versioned M1 editor protocol and fixture manifest validation. Import from `@stellar/contracts` after the workspace build. The package defines data and guard helpers; it does not start a runner, write files, authenticate a user, or implement compare-and-swap persistence.

```ts
import {
  ProjectManifestSchema,
  validatePrepareChange,
  validateApplyChange,
  validatePreviewEnvelope,
} from "@stellar/contracts";

const manifest = ProjectManifestSchema.parse(untrustedManifestJson);
const checked = validatePrepareChange(untrustedBody, currentSessionAndTargets, manifest);
if (!checked.ok) return checked.error;
// The engine may now prepare a patch. The runner still authenticates, checks
// current bytes/revision and writes only an approved single file.
```

The fixture's authoritative manifest is `fixtures/astro-style-lab/.stellar/project.json`. It declares known pages, ordinary authored anchors, approved CSS files and declaration identities, base/mobile scopes, editable leaf tokens, read-only aliases, and bounded impact. `ProjectManifestSchema` rejects extra keys, unsafe relative paths, duplicate IDs/rules, unknown references, alias cycles, wrong property types, wrong bounds and out-of-scope CSS references. The manifest's `coverage: "declared"` means impact is limited to its named routes and anchors; it is not a global CSS dependency analysis. A separate source check must confirm the manifest's selectors, declarations and file paths against actual project bytes.

`PROTOCOL_VERSION` is `stellar.editor.v1`. Every transport request and response has a literal protocol version and request ID. Project and page IDs are durable. Session IDs, preview generations, frame IDs, parser-local IDs and revision-scoped target IDs are different identities. `ProjectRevisionSchema` represents an opaque project source revision. The runner must mint and persist a new revision after each relevant source or manifest byte change, including undo that restores earlier bytes. Reparse, unchanged reopen and preview restart preserve that revision; restart rotates the preview generation. `StyleControlSchema` carries an element's typed authored/resolved value, token references, bounds and exact fallback/override declaration identities. `TokenDefinitionTargetSchema` (also exported as `TokenDefinitionSchema`) carries a concrete leaf's authored value, approved units/bounds, aliases, source identity and declared impact for the inspector.

The core command schemas are `PrepareChangeSchema`, `ApplyChangeSchema`, `HistoryCommandSchema` and `ReconcileRequestSchema`. `style.set` and `style.reset` require an element target and an explicit base or mobile property. `token.set` requires a distinct, approved concrete base token-definition target. The alias chain remains authored; the user chooses the leaf target after impact review. Values are typed hex colors, bounded `px`/`rem` lengths, or manifest-allowlisted token references. The server should call `validatePrepareChange` with its current source model, `validateApplyChange` with a current proposal, and `validateHistoryCommand` with current revision context. These helpers reject mismatched project/session/revision and unsupported values. They cannot prove that the caller is authorized or that on-disk bytes are still current; M1-02 owns those checks.

`ChangeProposalSchema` contains one relative-file patch and its expected digest/byte span. `validateApplyChange` binds a style proposal's patch file to the selected override rule and its impact to that one element/page; a token proposal must name the concrete definition file and exact manifest-declared impact. `ChangeReceiptSchema` records a durable write and distinct old/new revisions; an apply receipt must name its proposal. `PrepareChangeResponseSchema` distinguishes ready, unchanged and refused. `ApplyChangeResponseSchema` distinguishes applied and unchanged; errors use `ErrorEnvelopeSchema`. `RequestOutcomeSchema` supports project-authorized reconciliation of an earlier operation after a lost response, including a prepared proposal, pending, applied, unchanged or conflicted result. An applied outcome's operation must match its receipt. The runner must scope idempotency to the authorized operator, project and operation, and reject reuse of one request ID with changed intent. A retry of one logical operation retains its request ID; prepare, apply, undo and redo each use a different ID. Reconciliation with a replacement session is a read, not reuse of the old session's write capability.

`PreviewEnvelopeSchema` covers ready, selection, geometry, clear and diagnostic messages. `validatePreviewEnvelope` checks the expected project, session, generation, frame, page and source revision. A frame's source key or anchor is an observation to reconcile with `SourceModelSchema`, never a write target or authorization. The bridge must separately bind the exact origin and iframe window.

`ProjectSchema` reserves `renderer: "html"` for later metadata, while `assertExecutableProject` refuses it in M1. Capabilities explicitly set HTML editing, arbitrary Astro import and client authorization to false. `ListProjectsResponseSchema`, `GetProjectResponseSchema`, `OpenSessionRequestSchema`, `SessionResponseSchema`, `ListPagesResponseSchema`, `SourceModelSchema`, `HistoryResponseSchema` and the edit state schema give later runner and UI work one shared vocabulary. `examples.ts` exports validating project, session, page, editable/read-only targets, draft/proposal/saved states, history and preview examples.

Error codes map to stable HTTP statuses through `ERROR_HTTP_STATUS`: malformed requests 400; auth/scope 401/403; unknown project/target 404; stale revision, history or idempotency conflict 409; unsupported target/value/renderer 422; unavailable or not-ready runner 503. `makeError` emits safe canned messages. Do not put host paths, credentials or source bytes in an error message.

Run `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` in this package during development. Root workspace commands should call these after M1-01 wiring. TypeScript 6 is pinned locally for `typescript-eslint` compatibility; the emitted declarations and JavaScript remain consumable by the Next.js workspace, which currently uses TypeScript 7.
