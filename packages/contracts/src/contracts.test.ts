import assert from "node:assert/strict";
import test from "node:test";
import {
  ApplyChangeResponseSchema, ChangeProposalSchema, EditStateSchema, ErrorEnvelopeSchema, HistoryResponseSchema,
  ListPagesResponseSchema, ListProjectsResponseSchema, PrepareChangeResponseSchema, ProjectManifestSchema, RequestOutcomeSchema, SessionResponseSchema, SourceModelSchema,
  PreviewEnvelopeSchema, ProjectSchema, SessionSchema, PageSchema, SourceTargetSchema,
  StyleControlSchema, TokenDefinitionTargetSchema, ChangeReceiptSchema,
  PROTOCOL_VERSION,
} from "./index.js";
import {
  exampleApplyResponse, exampleDraftState, exampleElementTarget, exampleHistory, exampleListPages,
  exampleListProjects, exampleManifest, examplePage, examplePrepareChange, examplePrepareResponse,
  examplePreviewSelection, exampleProject, exampleProposal, exampleReadOnlyTarget,
  exampleReadyToApplyState, exampleReceipt, exampleSavedState, exampleSession,
  exampleSessionResponse, exampleTokenTarget,
} from "./examples.js";
import {
  assertExecutableProject, makeError, validateApplyChange, validateHistoryCommand,
  validatePrepareChange, validatePreviewEnvelope, validateReconcileRequest,
} from "./validation.js";

const clone = <T>(value: T): T => structuredClone(value);
const context = {
  projectId: "project-a", sessionId: "session-a", sourceRevision: "revision-0001",
  previewGeneration: "generation-0001", frameId: "frame-0001", pageId: "home",
  targets: [exampleElementTarget, exampleTokenTarget, exampleReadOnlyTarget],
};
const code = (result: ReturnType<typeof validatePrepareChange>) => result.ok ? null : result.error.error.code;

test("every exported example validates", () => {
  assert.equal(ProjectManifestSchema.safeParse(exampleManifest).success, true);
  assert.equal(ProjectSchema.safeParse(exampleProject).success, true);
  assert.equal(SessionSchema.safeParse(exampleSession).success, true);
  assert.equal(PageSchema.safeParse(examplePage).success, true);
  assert.equal(ListProjectsResponseSchema.safeParse(exampleListProjects).success, true);
  assert.equal(SessionResponseSchema.safeParse(exampleSessionResponse).success, true);
  assert.equal(ListPagesResponseSchema.safeParse(exampleListPages).success, true);
  for (const state of [exampleDraftState, exampleReadyToApplyState, exampleSavedState]) assert.equal(EditStateSchema.safeParse(state).success, true);
  for (const target of context.targets) assert.equal(SourceTargetSchema.safeParse(target).success, true);
  assert.equal(PrepareChangeResponseSchema.safeParse(examplePrepareResponse).success, true);
  assert.equal(ChangeProposalSchema.safeParse(exampleProposal).success, true);
  assert.equal(ApplyChangeResponseSchema.safeParse(exampleApplyResponse).success, true);
  assert.equal(HistoryResponseSchema.safeParse(exampleHistory).success, true);
  assert.equal(PreviewEnvelopeSchema.safeParse(examplePreviewSelection).success, true);
  assert.equal(SourceModelSchema.safeParse({
    protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "model-1",
    pageId: "home", projectRevision: "revision-0001", targets: context.targets,
  }).success, true);
  assert.equal(SourceModelSchema.safeParse({
    protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "model-1",
    pageId: "home", projectRevision: "revision-0001", targets: [{ ...exampleElementTarget, linkedTokenTargetIds: ["unknown-token-target"] }],
  }).success, false);
});

test("standalone controls and token definitions reject incoherent type, scope and bounds", () => {
  const control = exampleElementTarget.kind === "element" ? exampleElementTarget.controls[0]! : null;
  if (!control) throw new Error("missing control");
  assert.equal(StyleControlSchema.safeParse(control).success, true);
  assert.equal(StyleControlSchema.safeParse({ ...control, valueType: "length", allowedUnits: ["rem"], min: 0, max: 3 }).success, false);
  assert.equal(StyleControlSchema.safeParse({ ...control, override: { ...control.override, atRule: "(max-width: 767px)" } }).success, false);
  assert.equal(StyleControlSchema.safeParse({ ...control, override: { ...control.override, selector: control.fallback.selector } }).success, false);
  assert.equal(StyleControlSchema.safeParse({ ...control, allowedTokenNames: ["--lab-color-action", "--lab-color-action"] }).success, false);
  assert.equal(StyleControlSchema.safeParse({ ...control, authoredValue: { kind: "token", name: "--unapproved" } }).success, false);
  assert.equal(TokenDefinitionTargetSchema.safeParse(exampleTokenTarget).success, true);
  assert.equal(TokenDefinitionTargetSchema.safeParse({ ...exampleTokenTarget, authoredValue: { kind: "token", name: "--lab-color-action" } }).success, false);
  assert.equal(TokenDefinitionTargetSchema.safeParse({ ...exampleTokenTarget, allowedUnits: ["px"], min: 0, max: 3 }).success, false);
  assert.equal(TokenDefinitionTargetSchema.safeParse({ ...exampleTokenTarget, source: { ...exampleTokenTarget.source, atRule: "(max-width: 767px)" } }).success, false);
});

test("manifest rejects unknown fields, hostile paths, invalid renderer and responsive scope", () => {
  const extra = clone(exampleManifest) as Record<string, unknown>;
  extra.secret = "unexpected";
  assert.equal(ProjectManifestSchema.safeParse(extra).success, false);
  const path = clone(exampleManifest);
  path.allowedCssFiles[0] = "../outside.css";
  assert.equal(ProjectManifestSchema.safeParse(path).success, false);
  const renderer = clone(exampleManifest) as Record<string, unknown>;
  renderer.renderer = "html";
  assert.equal(ProjectManifestSchema.safeParse(renderer).success, false);
  const media = clone(exampleManifest);
  const mobile = media.styleScopes[1];
  if (mobile?.kind !== "media") throw new Error("missing mobile scope");
  mobile.maxWidthPx = 768 as 767;
  assert.equal(ProjectManifestSchema.safeParse(media).success, false);
});

test("manifest rejects cycles, missing and wrong-type token references, owner and impact mismatches", () => {
  const cycle = clone(exampleManifest);
  const colorAlias = cycle.tokens.find((token) => token.kind === "alias" && token.name === "--lab-color-action");
  if (!colorAlias || colorAlias.kind !== "alias") throw new Error("missing alias");
  colorAlias.reference = "--lab-color-action";
  assert.equal(ProjectManifestSchema.safeParse(cycle).success, false);
  const missing = clone(exampleManifest);
  missing.styleRules[0]!.allowedTokenNames = ["--unknown"];
  assert.equal(ProjectManifestSchema.safeParse(missing).success, false);
  const wrongType = clone(exampleManifest);
  wrongType.styleRules[0]!.valueType = "length";
  assert.equal(ProjectManifestSchema.safeParse(wrongType).success, false);
  const readonly = clone(exampleManifest);
  readonly.styleRules[0]!.anchor = "home-feature-clarity";
  assert.equal(ProjectManifestSchema.safeParse(readonly).success, false);
  const impact = clone(exampleManifest);
  const colorDef = impact.tokens.find((token) => token.kind === "definition" && token.name === "--lab-color-action-base");
  if (!colorDef || colorDef.kind !== "definition") throw new Error("missing token");
  colorDef.impact.pageIds = ["contact"];
  assert.equal(ProjectManifestSchema.safeParse(impact).success, false);
});

test("prepare checks project, session, revision, target kind and rule-bound values", () => {
  assert.equal(validatePrepareChange(examplePrepareChange, context, exampleManifest).ok, true);
  assert.equal(validatePrepareChange({ ...examplePrepareChange, command: { type: "style.reset", property: "background-color", scopeId: "base" } }, context, exampleManifest).ok, true);
  const project = clone(examplePrepareChange);
  project.projectId = "project-b";
  assert.equal(code(validatePrepareChange(project, context, exampleManifest)), "UNKNOWN_PROJECT");
  const session = clone(examplePrepareChange);
  session.sessionId = "session-old";
  assert.equal(code(validatePrepareChange(session, context, exampleManifest)), "INVALID_SCOPE");
  const stale = clone(examplePrepareChange);
  stale.expectedRevision = "revision-old";
  assert.equal(code(validatePrepareChange(stale, context, exampleManifest)), "STALE_REVISION");
  const missing = clone(examplePrepareChange);
  missing.targetId = "target-missing";
  assert.equal(code(validatePrepareChange(missing, context, exampleManifest)), "UNKNOWN_TARGET");
  const readonly = clone(examplePrepareChange);
  readonly.targetId = exampleReadOnlyTarget.targetId;
  assert.equal(code(validatePrepareChange(readonly, context, exampleManifest)), "UNSUPPORTED_TARGET");
  const tokenAsElement = clone(examplePrepareChange);
  tokenAsElement.command = { type: "token.set", value: { kind: "color", hex: "#123456" } };
  assert.equal(code(validatePrepareChange(tokenAsElement, context, exampleManifest)), "UNSUPPORTED_TARGET");
  const unknownProperty = clone(examplePrepareChange) as Record<string, unknown>;
  unknownProperty.command = { type: "style.set", property: "width", scopeId: "base", value: { kind: "length", amount: 2, unit: "rem" } };
  assert.equal(code(validatePrepareChange(unknownProperty, context, exampleManifest)), "INVALID_REQUEST");
  const invalidValue = clone(examplePrepareChange);
  invalidValue.command = { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "token", name: "--lab-space-button" } };
  assert.equal(code(validatePrepareChange(invalidValue, context, exampleManifest)), "INVALID_VALUE");
  const extra = clone(examplePrepareChange) as Record<string, unknown>;
  extra.file = "/etc/passwd";
  assert.equal(code(validatePrepareChange(extra, context, exampleManifest)), "INVALID_REQUEST");
  const version = clone(examplePrepareChange) as Record<string, unknown>;
  version.protocolVersion = "stellar.editor.v2";
  assert.equal(code(validatePrepareChange(version, context, exampleManifest)), "INVALID_REQUEST");
  const viewport = clone(examplePrepareChange) as Record<string, unknown>;
  viewport.viewportWidth = 390;
  assert.equal(code(validatePrepareChange(viewport, context, exampleManifest)), "INVALID_REQUEST");
});

test("mobile edit scope is explicit and may fall back to a base rule", () => {
  const manifest = clone(exampleManifest);
  const base = manifest.styleRules[0]!;
  const mobileRule = { ...base, scopeId: "mobile" as const, override: { ...base.override, scopeId: "mobile" as const, atRule: "(max-width: 767px)" as const } };
  manifest.styleRules.push(mobileRule);
  assert.equal(ProjectManifestSchema.safeParse(manifest).success, true);
  const target = clone(exampleElementTarget);
  if (target.kind !== "element") throw new Error("expected element");
  target.controls.push({ ...target.controls[0]!, scopeId: "mobile", override: mobileRule.override });
  const command = { ...examplePrepareChange, command: { type: "style.set", property: "background-color", scopeId: "mobile", value: { kind: "color", hex: "#123456" } } };
  assert.equal(validatePrepareChange(command, { ...context, targets: [target] }, manifest).ok, true);
  const passiveViewport = { ...examplePrepareChange, command: { ...examplePrepareChange.command, scopeId: "mobile" } };
  assert.equal(code(validatePrepareChange(passiveViewport, context, exampleManifest)), "UNSUPPORTED_TARGET");
});

test("token.set checks the concrete target and approved bounds", () => {
  const valid = { ...examplePrepareChange, targetId: exampleTokenTarget.targetId, command: { type: "token.set", value: { kind: "color", hex: "#123456" } } };
  assert.equal(validatePrepareChange(valid, context, exampleManifest).ok, true);
  const aliasTarget = { ...exampleTokenTarget, tokenName: "--lab-color-action" };
  assert.equal(code(validatePrepareChange(valid, { ...context, targets: [aliasTarget] }, exampleManifest)), "UNSUPPORTED_TARGET");
  const lengthTarget = SourceTargetSchema.parse({ ...exampleTokenTarget, targetId: "target-length-rev1", tokenName: "--lab-space-action", valueType: "length", authoredValue: { kind: "length", amount: 1.25, unit: "rem" }, allowedUnits: ["px", "rem"], min: 0, max: 3, aliases: ["--lab-space-button"], source: { ...exampleTokenTarget.source, property: "--lab-space-action" } });
  const tooLarge = { ...examplePrepareChange, targetId: lengthTarget.targetId, command: { type: "token.set", value: { kind: "length", amount: 4, unit: "rem" } } };
  assert.equal(code(validatePrepareChange(tooLarge, { ...context, targets: [lengthTarget] }, exampleManifest)), "INVALID_VALUE");
  const unsupportedUnit = { ...examplePrepareChange, targetId: lengthTarget.targetId, command: { type: "token.set", value: { kind: "length", amount: 1, unit: "vh" } } };
  assert.equal(code(validatePrepareChange(unsupportedUnit, { ...context, targets: [lengthTarget] }, exampleManifest)), "INVALID_REQUEST");
});

test("apply, history and preview validation bind to current scope and revision", () => {
  const apply = { protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "apply-0001", expectedRevision: "revision-0001", proposalId: "proposal-0001" };
  assert.equal(validateApplyChange(apply, context, exampleProposal, exampleManifest).ok, true);
  assert.equal(validateApplyChange({ ...apply, proposalId: "another-proposal" }, context, exampleProposal, exampleManifest).ok, false);
  assert.equal(validateApplyChange(apply, { ...context, sourceRevision: "revision-0002" }, exampleProposal, exampleManifest).ok, false);
  assert.equal(validateApplyChange(apply, context, { ...exampleProposal, sourcePatch: { ...exampleProposal.sourcePatch, file: "src/styles/unknown.css" } }, exampleManifest).ok, false);
  assert.equal(validateApplyChange(apply, context, { ...exampleProposal, sourcePatch: { ...exampleProposal.sourcePatch, file: "src/styles/tokens.css" } }, exampleManifest).ok, false);
  assert.equal(validateApplyChange(apply, context, { ...exampleProposal, impact: { pageIds: ["home", "contact"], anchors: ["home-primary-cta", "contact-primary-cta"], coverage: "declared" } }, exampleManifest).ok, false);
  const tokenProposal = ChangeProposalSchema.parse({
    ...exampleProposal, targetId: exampleTokenTarget.targetId,
    command: { type: "token.set", value: { kind: "color", hex: "#123456" } },
    impact: { pageIds: ["home", "contact"], anchors: ["home-primary-cta", "contact-primary-cta"], coverage: "declared" },
    sourcePatch: { ...exampleProposal.sourcePatch, file: "src/styles/tokens.css", replacementText: "#123456" },
  });
  assert.equal(validateApplyChange(apply, context, tokenProposal, exampleManifest).ok, true);
  assert.equal(validateApplyChange(apply, context, { ...tokenProposal, sourcePatch: { ...tokenProposal.sourcePatch, file: "src/styles/site.css" } }, exampleManifest).ok, false);
  assert.equal(validateApplyChange(apply, context, { ...tokenProposal, impact: exampleProposal.impact }, exampleManifest).ok, false);
  const history = { protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "undo-0001", operation: "undo", expectedRevision: "revision-0001", entryId: "entry-0001" };
  assert.equal(validateHistoryCommand(history, context).ok, true);
  assert.equal(validateHistoryCommand({ ...history, expectedRevision: "revision-0000" }, context).ok, false);
  assert.equal(validateReconcileRequest({ protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "lookup-1", lookupRequestId: "apply-old" }, context).ok, true);
  assert.equal(validatePreviewEnvelope(examplePreviewSelection, context).ok, true);
  assert.equal(validatePreviewEnvelope({ ...examplePreviewSelection, previewGeneration: "generation-old" }, context).ok, false);
  assert.equal(validatePreviewEnvelope({ ...examplePreviewSelection, frameId: "frame-old" }, context).ok, false);
  assert.equal(validatePreviewEnvelope({ ...examplePreviewSelection, sourceRevision: "revision-old" }, context).ok, false);
  assert.equal(PreviewEnvelopeSchema.safeParse({ ...examplePreviewSelection, type: "apply", payload: { file: "/tmp/attack.css" } }).success, false);
});

test("responses keep status and nested scope coherent; errors have stable HTTP semantics", () => {
  assert.equal(PrepareChangeResponseSchema.safeParse({ ...examplePrepareResponse, proposal: { ...exampleProposal, projectId: "project-b" } }).success, false);
  assert.equal(ApplyChangeResponseSchema.safeParse({ ...exampleApplyResponse, receipt: { ...exampleReceipt, requestId: "apply-other" } }).success, false);
  assert.equal(PrepareChangeResponseSchema.safeParse({ ...examplePrepareResponse, status: "unchanged", reason: "No change", proposal: exampleProposal }).success, false);
  assert.equal(HistoryResponseSchema.safeParse({ ...exampleHistory, entries: [{ ...exampleHistory.entries[0], receipt: { ...exampleReceipt, changedFile: "/tmp/leak.css" } }] }).success, false);
  assert.equal(RequestOutcomeSchema.safeParse({ protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-new", requestId: "lookup-1", originalRequestId: "prepare-0001", operation: "prepare", status: "prepared", proposal: exampleProposal }).success, true);
  assert.equal(RequestOutcomeSchema.safeParse({ protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-new", requestId: "lookup-1", originalRequestId: "prepare-0001", operation: "prepare", status: "applied", receipt: exampleReceipt }).success, false);
  assert.equal(RequestOutcomeSchema.safeParse({ protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-new", requestId: "lookup-1", originalRequestId: "apply-0001", operation: "undo", status: "applied", receipt: exampleReceipt }).success, false);
  assert.equal(ChangeReceiptSchema.safeParse({ ...exampleReceipt, proposalId: null }).success, false);
  assert.equal(HistoryResponseSchema.safeParse({ ...exampleHistory, entries: [{ ...exampleHistory.entries[0], receipt: { ...exampleReceipt, projectId: "project-b" } }] }).success, false);
  const conflict = makeError({ projectId: "project-a", sessionId: "session-a", requestId: "apply-0001" }, "STALE_REVISION");
  assert.equal(conflict.error.httpStatus, 409);
  assert.equal(conflict.error.recoverable, true);
  assert.equal(ErrorEnvelopeSchema.safeParse(conflict).success, true);
  assert.equal(ErrorEnvelopeSchema.safeParse({ ...conflict, error: { ...conflict.error, httpStatus: 422 } }).success, false);
  assert.equal(ErrorEnvelopeSchema.safeParse({ ...conflict, error: { ...conflict.error, recoverable: false } }).success, false);
  assert.equal(code(validatePrepareChange({ ...examplePrepareChange, projectId: "/etc/passwd" }, context, exampleManifest)), "INVALID_REQUEST");
  const html = ProjectSchema.parse({ ...exampleProject, renderer: "html" });
  const executable = assertExecutableProject(html, { projectId: "project-a", sessionId: "session-a", requestId: "open-1" });
  assert.equal(executable.ok ? null : executable.error.error.code, "UNSUPPORTED_RENDERER");
});
