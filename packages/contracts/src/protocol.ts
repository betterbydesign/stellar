import { z } from "zod";
import {
  CssDeclarationRefSchema, IdentifierSchema, ImpactSchema, RelativePathSchema,
  SUPPORTED_PROPERTIES, TokenNameSchema,
} from "./manifest.js";

export const PROTOCOL_VERSION = "stellar.editor.v1" as const;
export const ProjectRevisionSchema = z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const OpaqueIdSchema = IdentifierSchema;
const scope = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  projectId: OpaqueIdSchema,
  sessionId: OpaqueIdSchema,
  requestId: OpaqueIdSchema,
};
export const RequestScopeSchema = z.strictObject(scope);
export type RequestScope = z.infer<typeof RequestScopeSchema>;

export const ErrorCodeSchema = z.enum([
  "INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "INVALID_SCOPE", "UNKNOWN_PROJECT",
  "UNKNOWN_TARGET", "STALE_REVISION", "HISTORY_CONFLICT", "IDEMPOTENCY_CONFLICT",
  "UNSUPPORTED_TARGET", "INVALID_VALUE", "UNSUPPORTED_RENDERER", "RUNNER_UNAVAILABLE", "NOT_READY",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export const ERROR_HTTP_STATUS: Record<ErrorCode, 400 | 401 | 403 | 404 | 409 | 422 | 503> = {
  INVALID_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, INVALID_SCOPE: 403,
  UNKNOWN_PROJECT: 404, UNKNOWN_TARGET: 404, STALE_REVISION: 409,
  HISTORY_CONFLICT: 409, IDEMPOTENCY_CONFLICT: 409,
  UNSUPPORTED_TARGET: 422, INVALID_VALUE: 422, UNSUPPORTED_RENDERER: 422,
  RUNNER_UNAVAILABLE: 503, NOT_READY: 503,
};
export const ERROR_RECOVERABLE: Record<ErrorCode, boolean> = {
  INVALID_REQUEST: false, UNAUTHORIZED: true, FORBIDDEN: false, INVALID_SCOPE: true,
  UNKNOWN_PROJECT: false, UNKNOWN_TARGET: true, STALE_REVISION: true,
  HISTORY_CONFLICT: true, IDEMPOTENCY_CONFLICT: false,
  UNSUPPORTED_TARGET: false, INVALID_VALUE: false, UNSUPPORTED_RENDERER: false,
  RUNNER_UNAVAILABLE: true, NOT_READY: true,
};
export const ErrorDetailSchema = z.strictObject({
  code: ErrorCodeSchema, httpStatus: z.union([z.literal(400), z.literal(401), z.literal(403), z.literal(404), z.literal(409), z.literal(422), z.literal(503)]),
  recoverable: z.boolean(), message: z.string().min(1).max(160),
}).refine((error) => error.httpStatus === ERROR_HTTP_STATUS[error.code] && error.recoverable === ERROR_RECOVERABLE[error.code], "Error code, HTTP status or recoverability mismatch");
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;
export const ErrorEnvelopeSchema = z.strictObject({
  ...scope,
  status: z.literal("error"),
  error: ErrorDetailSchema,
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const CapabilitiesSchema = z.strictObject({
  styleEdits: z.boolean(), tokenEdits: z.boolean(), htmlEditing: z.literal(false),
  arbitraryAstroImport: z.literal(false), clientAuthorization: z.literal(false),
});
export const ProjectSchema = z.strictObject({
  id: OpaqueIdSchema, name: z.string().min(1).max(100), renderer: z.enum(["astro", "html"]),
  capabilities: CapabilitiesSchema, pageCount: z.int().nonnegative().max(100),
});
export type Project = z.infer<typeof ProjectSchema>;
export const RegisteredWorkspaceSchema = z.strictObject({
  id: OpaqueIdSchema, project: ProjectSchema, label: z.string().min(1).max(100),
  sourceKind: z.literal("trusted-local-copy"),
});
export type RegisteredWorkspace = z.infer<typeof RegisteredWorkspaceSchema>;
export const LifecycleStateSchema = z.enum(["registered", "starting", "ready", "failed", "stopped", "reconnecting"]);
export const SessionSchema = z.strictObject({
  id: OpaqueIdSchema, projectId: OpaqueIdSchema, state: LifecycleStateSchema,
  sourceRevision: ProjectRevisionSchema, previewGeneration: OpaqueIdSchema,
  previewUrl: z.url().refine((url) => /^https?:\/\//.test(url)).nullable(),
  statusMessage: z.string().max(160).nullable(),
});
export type Session = z.infer<typeof SessionSchema>;
export const PageSchema = z.strictObject({
  id: OpaqueIdSchema, route: z.string().regex(/^\/(?:[a-z0-9-]+\/)*$/), label: z.string().min(1).max(100),
});
export type Page = z.infer<typeof PageSchema>;
export const ListProjectsResponseSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION), requestId: OpaqueIdSchema,
  projects: z.array(RegisteredWorkspaceSchema).max(100),
});
export type ListProjectsResponse = z.infer<typeof ListProjectsResponseSchema>;
export const GetProjectResponseSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION), projectId: OpaqueIdSchema, requestId: OpaqueIdSchema,
  workspace: RegisteredWorkspaceSchema,
}).refine((response) => response.workspace.project.id === response.projectId, "Project scope mismatch");
export type GetProjectResponse = z.infer<typeof GetProjectResponseSchema>;
export const OpenSessionRequestSchema = z.strictObject({
  protocolVersion: z.literal(PROTOCOL_VERSION), projectId: OpaqueIdSchema, requestId: OpaqueIdSchema,
});
export type OpenSessionRequest = z.infer<typeof OpenSessionRequestSchema>;
export const SessionResponseSchema = z.strictObject({ ...scope, session: SessionSchema })
  .refine((response) => response.session.id === response.sessionId && response.session.projectId === response.projectId, "Session scope mismatch");
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export const ListPagesResponseSchema = z.strictObject({ ...scope, pages: z.array(PageSchema).max(100) });
export type ListPagesResponse = z.infer<typeof ListPagesResponseSchema>;

const ColorValueSchema = z.strictObject({ kind: z.literal("color"), hex: z.string().regex(/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/) });
const LengthValueSchema = z.strictObject({ kind: z.literal("length"), amount: z.number().finite(), unit: z.enum(["px", "rem"]) });
export const ConcreteValueSchema = z.discriminatedUnion("kind", [ColorValueSchema, LengthValueSchema]);
export type ConcreteValue = z.infer<typeof ConcreteValueSchema>;
export const StyleValueSchema = z.discriminatedUnion("kind", [
  ColorValueSchema,
  LengthValueSchema,
  z.strictObject({ kind: z.literal("token"), name: TokenNameSchema }),
]);
export type StyleValue = z.infer<typeof StyleValueSchema>;
export const CommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("style.set"), property: z.enum(SUPPORTED_PROPERTIES), scopeId: z.enum(["base", "mobile"]), value: StyleValueSchema }),
  z.strictObject({ type: z.literal("style.reset"), property: z.enum(SUPPORTED_PROPERTIES), scopeId: z.enum(["base", "mobile"]) }),
  z.strictObject({ type: z.literal("token.set"), value: ConcreteValueSchema }),
]);
export type Command = z.infer<typeof CommandSchema>;
export const PrepareChangeSchema = z.strictObject({ ...scope, expectedRevision: ProjectRevisionSchema, targetId: OpaqueIdSchema, command: CommandSchema });
export type PrepareChange = z.infer<typeof PrepareChangeSchema>;
export const ApplyChangeSchema = z.strictObject({ ...scope, proposalId: OpaqueIdSchema, expectedRevision: ProjectRevisionSchema });
export type ApplyChange = z.infer<typeof ApplyChangeSchema>;

const readOnlyReason = z.enum(["repeated-component", "dynamic-source", "ambiguous-owner", "unsupported-source", "inherited", "alias-cycle", "unknown-token", "scope-ambiguous"]).nullable();
export const StyleControlSchema = z.strictObject({
  property: z.enum(SUPPORTED_PROPERTIES), scopeId: z.enum(["base", "mobile"]),
  valueType: z.enum(["color", "length"]), allowedUnits: z.array(z.enum(["px", "rem"])),
  min: z.number().finite().nullable(), max: z.number().finite().nullable(),
  allowedTokenNames: z.array(TokenNameSchema),
  authoredValue: StyleValueSchema.nullable(), resolvedValue: StyleValueSchema.nullable(),
  provenance: z.enum(["override", "fallback", "token", "inherited"]),
  fallback: CssDeclarationRefSchema, override: CssDeclarationRefSchema,
}).refine((control) => {
  const expectedType = control.property === "color" || control.property === "background-color" ? "color" : "length";
  if (control.valueType !== expectedType || control.override.scopeId !== control.scopeId ||
    (control.fallback.scopeId !== control.scopeId && !(control.scopeId === "mobile" && control.fallback.scopeId === "base"))) return false;
  if (control.fallback.property !== control.property || control.override.property !== control.property ||
    (control.fallback.file === control.override.file && control.fallback.selector === control.override.selector && control.fallback.atRule === control.override.atRule)) return false;
  if (control.fallback.atRule !== (control.fallback.scopeId === "base" ? null : "(max-width: 767px)") ||
    control.override.atRule !== (control.override.scopeId === "base" ? null : "(max-width: 767px)")) return false;
  if (new Set(control.allowedUnits).size !== control.allowedUnits.length ||
    new Set(control.allowedTokenNames).size !== control.allowedTokenNames.length) return false;
  if (control.valueType === "color") {
    if (control.allowedUnits.length || control.min !== null || control.max !== null) return false;
  } else if (!control.allowedUnits.length || control.min === null || control.max === null || control.min > control.max) return false;
  if (control.authoredValue?.kind === "token" && !control.allowedTokenNames.includes(control.authoredValue.name)) return false;
  if (control.authoredValue && control.authoredValue.kind !== "token" && control.authoredValue.kind !== control.valueType) return false;
  if (control.resolvedValue && control.resolvedValue.kind !== control.valueType) return false;
  return true;
}, "Style control type, scope, bounds or declaration mismatch");
export type StyleControl = z.infer<typeof StyleControlSchema>;
export const ElementSourceTargetSchema = z.strictObject({
    kind: z.literal("element"), targetId: OpaqueIdSchema, revision: ProjectRevisionSchema,
    anchor: OpaqueIdSchema, pageId: OpaqueIdSchema,
    source: z.strictObject({ file: RelativePathSchema, structuralLocator: z.string().min(1).max(200), componentDefinitionFile: RelativePathSchema.nullable(), componentCallSiteFile: RelativePathSchema.nullable() }),
    editable: z.boolean(), readOnlyReason,
    controls: z.array(StyleControlSchema), linkedTokenTargetIds: z.array(OpaqueIdSchema),
  }).refine((target) => target.editable === (target.readOnlyReason === null), "Target editability and reason mismatch");
export type ElementSourceTarget = z.infer<typeof ElementSourceTargetSchema>;
export const TokenDefinitionTargetSchema = z.strictObject({
    kind: z.literal("token-definition"), targetId: OpaqueIdSchema, revision: ProjectRevisionSchema,
    tokenName: TokenNameSchema, source: CssDeclarationRefSchema,
    valueType: z.enum(["color", "length"]), editable: z.boolean(), readOnlyReason,
    authoredValue: ConcreteValueSchema, allowedUnits: z.array(z.enum(["px", "rem"])).max(2),
    min: z.number().finite().nullable(), max: z.number().finite().nullable(),
    aliases: z.array(TokenNameSchema), impact: ImpactSchema,
  }).refine((target) => {
    if (target.editable !== (target.readOnlyReason === null) ||
      target.source.property !== target.tokenName || target.source.scopeId !== "base" ||
      target.source.atRule !== null || target.source.theme !== null ||
      target.authoredValue.kind !== target.valueType || new Set(target.aliases).size !== target.aliases.length ||
      new Set(target.allowedUnits).size !== target.allowedUnits.length) return false;
    if (target.valueType === "color") return target.allowedUnits.length === 0 && target.min === null && target.max === null;
    return target.allowedUnits.length > 0 && target.min !== null && target.max !== null && target.min <= target.max &&
      target.authoredValue.kind === "length" && target.allowedUnits.includes(target.authoredValue.unit) &&
      target.authoredValue.amount >= target.min && target.authoredValue.amount <= target.max;
  }, "Token definition must be an approved concrete base value");
export const TokenDefinitionSchema = TokenDefinitionTargetSchema;
export type TokenDefinition = z.infer<typeof TokenDefinitionTargetSchema>;
export const SourceTargetSchema = z.union([ElementSourceTargetSchema, TokenDefinitionTargetSchema])
  .refine((target) => target.editable === (target.readOnlyReason === null), "Target editability and reason mismatch");
export type SourceTarget = z.infer<typeof SourceTargetSchema>;
export const SourceModelSchema = z.strictObject({
  ...scope, pageId: OpaqueIdSchema, projectRevision: ProjectRevisionSchema,
  targets: z.array(SourceTargetSchema).max(256),
}).refine((model) => {
  const ids = model.targets.map((target) => target.targetId);
  if (new Set(ids).size !== ids.length) return false;
  const tokenIds = new Set(model.targets.filter((target) => target.kind === "token-definition").map((target) => target.targetId));
  return model.targets.every((target) => target.revision === model.projectRevision &&
    (target.kind !== "element" || (target.pageId === model.pageId && target.linkedTokenTargetIds.every((id) => tokenIds.has(id)))));
}, "Target revision, page, ID or token link mismatch");
export type SourceModel = z.infer<typeof SourceModelSchema>;

export const SourcePatchSchema = z.strictObject({
  file: RelativePathSchema, startByte: z.int().nonnegative().max(10_000_000),
  endByte: z.int().nonnegative().max(10_000_000), expectedOldText: z.string().max(16_384),
  replacementText: z.string().max(16_384), expectedFileSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).refine((patch) => patch.endByte >= patch.startByte && patch.endByte - patch.startByte === new TextEncoder().encode(patch.expectedOldText).length, "Patch byte span does not match expected old text");
export type SourcePatch = z.infer<typeof SourcePatchSchema>;
export const ChangeProposalSchema = z.strictObject({
  proposalId: OpaqueIdSchema, projectId: OpaqueIdSchema, sessionId: OpaqueIdSchema,
  targetId: OpaqueIdSchema, baseRevision: ProjectRevisionSchema,
  command: CommandSchema, impact: ImpactSchema, sourcePatch: SourcePatchSchema,
});
export type ChangeProposal = z.infer<typeof ChangeProposalSchema>;
export const PrepareChangeResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...scope, status: z.literal("ready"), proposal: ChangeProposalSchema }),
  z.strictObject({ ...scope, status: z.literal("unchanged"), reason: z.string().min(1).max(160) }),
  z.strictObject({ ...scope, status: z.literal("refused"), error: ErrorEnvelopeSchema.shape.error }),
]).refine((response) => response.status !== "ready" || (response.proposal.projectId === response.projectId && response.proposal.sessionId === response.sessionId), "Proposal scope mismatch");
export type PrepareChangeResponse = z.infer<typeof PrepareChangeResponseSchema>;
export const ChangeReceiptSchema = z.strictObject({
  receiptId: OpaqueIdSchema, projectId: OpaqueIdSchema, sessionId: OpaqueIdSchema,
  requestId: OpaqueIdSchema, proposalId: OpaqueIdSchema.nullable(),
  operation: z.enum(["apply", "undo", "redo"]), targetId: OpaqueIdSchema,
  oldRevision: ProjectRevisionSchema, newRevision: ProjectRevisionSchema,
  changedFile: RelativePathSchema,
}).refine((receipt) => receipt.oldRevision !== receipt.newRevision && (receipt.operation !== "apply" || receipt.proposalId !== null), "A write must create a new revision and apply needs a proposal");
export type ChangeReceipt = z.infer<typeof ChangeReceiptSchema>;
export const ApplyChangeResponseSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...scope, status: z.literal("applied"), receipt: ChangeReceiptSchema }),
  z.strictObject({ ...scope, status: z.literal("unchanged"), reason: z.string().min(1).max(160) }),
]).refine((response) => response.status !== "applied" || (response.receipt.projectId === response.projectId && response.receipt.sessionId === response.sessionId && response.receipt.requestId === response.requestId), "Receipt scope mismatch");
export type ApplyChangeResponse = z.infer<typeof ApplyChangeResponseSchema>;

export const ReconcileRequestSchema = z.strictObject({ ...scope, lookupRequestId: OpaqueIdSchema });
export type ReconcileRequest = z.infer<typeof ReconcileRequestSchema>;
export const RequestOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...scope, originalRequestId: OpaqueIdSchema, operation: z.enum(["prepare", "apply", "undo", "redo"]), status: z.literal("pending") }),
  z.strictObject({ ...scope, originalRequestId: OpaqueIdSchema, operation: z.literal("prepare"), status: z.literal("prepared"), proposal: ChangeProposalSchema }),
  z.strictObject({ ...scope, originalRequestId: OpaqueIdSchema, operation: z.enum(["prepare", "apply", "undo", "redo"]), status: z.literal("applied"), receipt: ChangeReceiptSchema }),
  z.strictObject({ ...scope, originalRequestId: OpaqueIdSchema, operation: z.enum(["prepare", "apply", "undo", "redo"]), status: z.literal("unchanged") }),
  z.strictObject({ ...scope, originalRequestId: OpaqueIdSchema, operation: z.enum(["prepare", "apply", "undo", "redo"]), status: z.literal("conflicted"), error: ErrorEnvelopeSchema.shape.error }),
]).refine((outcome) => {
  if (outcome.status === "prepared") return outcome.proposal.projectId === outcome.projectId;
  if (outcome.status === "applied") return outcome.operation !== "prepare" && outcome.receipt.operation === outcome.operation && outcome.receipt.projectId === outcome.projectId && outcome.receipt.requestId === outcome.originalRequestId;
  return true;
}, "Reconciled outcome scope or operation mismatch");
export type RequestOutcome = z.infer<typeof RequestOutcomeSchema>;
export const HistoryEntrySchema = z.strictObject({
  entryId: OpaqueIdSchema, receipt: ChangeReceiptSchema, command: CommandSchema,
  state: z.enum(["applied", "undone"]), impact: ImpactSchema,
  display: z.strictObject({
    timestamp: z.iso.datetime(), before: z.string().max(160), after: z.string().max(160), target: z.string().min(1).max(160).optional(),
  }).optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export const HistoryResponseSchema = z.strictObject({ ...scope,
  projectRevision: ProjectRevisionSchema, entries: z.array(HistoryEntrySchema).max(200),
  canUndo: z.boolean(), canRedo: z.boolean(),
  undoEntryId: OpaqueIdSchema.nullable().optional(), redoEntryId: OpaqueIdSchema.nullable().optional(),
}).refine((history) => history.entries.every((entry) => entry.receipt.projectId === history.projectId) &&
  (history.canUndo ? history.entries.some((entry) => entry.entryId === history.undoEntryId && entry.state === "applied") : history.undoEntryId == null) &&
  (history.canRedo ? history.entries.some((entry) => entry.entryId === history.redoEntryId && entry.state === "undone") : history.redoEntryId == null),
  "History scope or available entry mismatch");
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
export const HistoryCommandSchema = z.strictObject({ ...scope,
  operation: z.enum(["undo", "redo"]), expectedRevision: ProjectRevisionSchema, entryId: OpaqueIdSchema,
});
export type HistoryCommand = z.infer<typeof HistoryCommandSchema>;

export const EditStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("draft"), command: CommandSchema }),
  z.strictObject({ status: z.literal("preparing"), requestId: OpaqueIdSchema, command: CommandSchema }),
  z.strictObject({ status: z.literal("ready-to-apply"), proposal: ChangeProposalSchema }),
  z.strictObject({ status: z.literal("saving"), requestId: OpaqueIdSchema, proposal: ChangeProposalSchema }),
  z.strictObject({ status: z.literal("saved"), receipt: ChangeReceiptSchema, previewFresh: z.boolean() }),
  z.strictObject({ status: z.literal("conflict"), error: ErrorDetailSchema }),
  z.strictObject({ status: z.literal("failed"), error: ErrorDetailSchema }),
]);
export type EditState = z.infer<typeof EditStateSchema>;

const frameScope = {
  protocolVersion: z.literal(PROTOCOL_VERSION), projectId: OpaqueIdSchema, sessionId: OpaqueIdSchema,
  previewGeneration: OpaqueIdSchema, frameId: OpaqueIdSchema, pageId: OpaqueIdSchema,
  sourceRevision: ProjectRevisionSchema,
};
const GeometrySchema = z.strictObject({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative() });
export const PreviewEnvelopeSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...frameScope, type: z.literal("ready"), payload: z.strictObject({ route: z.string().regex(/^\/(?:[a-z0-9-]+\/)*$/) }) }),
  z.strictObject({ ...frameScope, type: z.literal("selection"), payload: z.strictObject({ sourceKey: OpaqueIdSchema, anchor: OpaqueIdSchema, occurrenceId: OpaqueIdSchema, geometry: GeometrySchema,
    computedStyles: z.partialRecord(z.enum(SUPPORTED_PROPERTIES), z.string().max(160)).optional(),
  }) }),
  z.strictObject({ ...frameScope, type: z.literal("geometry"), payload: z.strictObject({ occurrenceId: OpaqueIdSchema, geometry: GeometrySchema }) }),
  z.strictObject({ ...frameScope, type: z.literal("clear"), payload: z.strictObject({ reason: z.enum(["escape", "navigation", "stale", "removed"]) }) }),
  z.strictObject({ ...frameScope, type: z.literal("diagnostic"), payload: z.strictObject({ code: z.enum(["UNMAPPED_SOURCE", "RENDER_ERROR", "BRIDGE_ERROR"]), message: z.string().min(1).max(160) }) }),
]);
export type PreviewEnvelope = z.infer<typeof PreviewEnvelopeSchema>;
