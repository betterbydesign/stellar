import type { ProjectManifest, StyleRule, TokenEntry } from "./manifest.js";
import { IdentifierSchema, resolveTokenLeaf } from "./manifest.js";
import {
  ApplyChangeSchema, type ApplyChange, ChangeProposalSchema, type ChangeProposal,
  ErrorEnvelopeSchema, type ErrorEnvelope, type ErrorCode, HistoryCommandSchema, type HistoryCommand,
  PrepareChangeSchema, type PrepareChange, PreviewEnvelopeSchema, type PreviewEnvelope,
  PROTOCOL_VERSION, ReconcileRequestSchema, type ReconcileRequest, type Project, type SourceTarget, type StyleValue,
} from "./protocol.js";

export type ValidationResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorEnvelope };
export type ScopeContext = {
  readonly projectId: string;
  readonly sessionId: string;
  readonly sourceRevision: string;
  readonly previewGeneration: string;
  readonly frameId?: string;
  readonly pageId?: string;
};
export type ChangeContext = ScopeContext & { readonly targets: readonly SourceTarget[] };

const errorStatus: Record<ErrorCode, { status: ErrorEnvelope["error"]["httpStatus"]; recoverable: boolean; message: string }> = {
  INVALID_REQUEST: { status: 400, recoverable: false, message: "The request is invalid." },
  UNAUTHORIZED: { status: 401, recoverable: true, message: "Sign in to continue." },
  FORBIDDEN: { status: 403, recoverable: false, message: "This action is not allowed." },
  INVALID_SCOPE: { status: 403, recoverable: true, message: "The workspace context changed. Reopen it and retry." },
  UNKNOWN_PROJECT: { status: 404, recoverable: false, message: "Project not found." },
  UNKNOWN_TARGET: { status: 404, recoverable: true, message: "The selected target is no longer available." },
  STALE_REVISION: { status: 409, recoverable: true, message: "The project changed. Refresh before editing." },
  HISTORY_CONFLICT: { status: 409, recoverable: true, message: "History changed. Refresh before continuing." },
  IDEMPOTENCY_CONFLICT: { status: 409, recoverable: false, message: "This request ID was already used for a different action." },
  UNSUPPORTED_TARGET: { status: 422, recoverable: false, message: "This target is read-only." },
  INVALID_VALUE: { status: 422, recoverable: false, message: "The value is outside the allowed controls." },
  UNSUPPORTED_RENDERER: { status: 422, recoverable: false, message: "This renderer is not supported for editing." },
  RUNNER_UNAVAILABLE: { status: 503, recoverable: true, message: "The local runner is unavailable." },
  NOT_READY: { status: 503, recoverable: true, message: "The preview is not ready yet." },
};

export function makeError(scope: { projectId?: string; sessionId?: string; requestId?: string }, code: ErrorCode): ErrorEnvelope {
  const detail = errorStatus[code];
  return ErrorEnvelopeSchema.parse({
    protocolVersion: PROTOCOL_VERSION, projectId: scope.projectId ?? "unknown",
    sessionId: scope.sessionId ?? "unknown", requestId: scope.requestId ?? "unknown",
    status: "error", error: { code, httpStatus: detail.status, recoverable: detail.recoverable, message: detail.message },
  });
}
const failed = <T>(scope: { projectId?: string; sessionId?: string; requestId?: string }, code: ErrorCode): ValidationResult<T> => ({ ok: false, error: makeError(scope, code) });
const success = <T>(value: T): ValidationResult<T> => ({ ok: true, value });
function inputScope(input: unknown, context: ScopeContext): { projectId: string; sessionId: string; requestId: string } {
  if (typeof input !== "object" || input === null) return { ...context, requestId: "unknown" };
  const record = input as Record<string, unknown>;
  const safeId = (candidate: unknown, fallback: string): string => IdentifierSchema.safeParse(candidate).success ? candidate as string : fallback;
  return {
    projectId: safeId(record.projectId, context.projectId),
    sessionId: safeId(record.sessionId, context.sessionId),
    requestId: safeId(record.requestId, "unknown"),
  };
}
function checkScope<T extends { projectId: string; sessionId: string; requestId: string }>(request: T, context: ScopeContext): ErrorCode | null {
  if (request.projectId !== context.projectId) return "UNKNOWN_PROJECT";
  if (request.sessionId !== context.sessionId) return "INVALID_SCOPE";
  return null;
}
export function assertExecutableProject(project: Project, scope: { projectId?: string; sessionId?: string; requestId?: string }): ValidationResult<Project> {
  return project.renderer === "astro" ? success(project) : failed(scope, "UNSUPPORTED_RENDERER");
}

export function getStyleRule(manifest: ProjectManifest, anchor: string, property: string, scopeId: string): StyleRule | undefined {
  return manifest.styleRules.find((rule) => rule.anchor === anchor && rule.property === property && rule.scopeId === scopeId);
}
const sameCssRef = (left: StyleRule["fallback"], right: StyleRule["fallback"]): boolean =>
  left.file === right.file && left.selector === right.selector && left.scopeId === right.scopeId &&
  left.atRule === right.atRule && left.theme === right.theme && left.property === right.property;
const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value) => right.includes(value));

export function validateStyleValue(value: StyleValue, rule: StyleRule, manifest: ProjectManifest): boolean {
  if (value.kind === "token") {
    return rule.allowedTokenNames.includes(value.name) && resolveTokenLeaf(manifest, value.name)?.valueType === rule.valueType;
  }
  if (value.kind !== rule.valueType) return false;
  if (value.kind === "color") return true;
  return rule.allowedUnits.includes(value.unit) && rule.min !== null && rule.max !== null && value.amount >= rule.min && value.amount <= rule.max;
}

export function validateTokenValue(value: Extract<StyleValue, { kind: "color" | "length" }>, token: TokenEntry): boolean {
  if (token.kind !== "definition" || value.kind !== token.valueType) return false;
  if (value.kind === "color") return true;
  return token.allowedUnits.includes(value.unit) && token.min !== null && token.max !== null && value.amount >= token.min && value.amount <= token.max;
}

export function validatePrepareChange(input: unknown, context: ChangeContext, manifest: ProjectManifest): ValidationResult<PrepareChange> {
  const parsed = PrepareChangeSchema.safeParse(input);
  const received = inputScope(input, context);
  if (!parsed.success) return failed(received, "INVALID_REQUEST");
  const request = parsed.data;
  const mismatch = checkScope(request, context);
  if (mismatch) return failed(request, mismatch);
  if (request.expectedRevision !== context.sourceRevision) return failed(request, "STALE_REVISION");
  const target = context.targets.find((item) => item.targetId === request.targetId);
  if (!target) return failed(request, "UNKNOWN_TARGET");
  if (target.revision !== context.sourceRevision) return failed(request, "STALE_REVISION");
  if (!target.editable || target.readOnlyReason !== null) return failed(request, "UNSUPPORTED_TARGET");
  if (request.command.type === "token.set") {
    if (target.kind !== "token-definition") return failed(request, "UNSUPPORTED_TARGET");
    const token = manifest.tokens.find((item) => item.name === target.tokenName);
    if (!token || token.kind !== "definition" || target.valueType !== token.valueType ||
      !sameIds(target.allowedUnits, token.allowedUnits) || target.min !== token.min || target.max !== token.max ||
      target.source.file !== token.source.file || target.source.selector !== token.source.selector ||
      target.source.property !== token.source.property || target.source.scopeId !== "base" ||
      target.source.atRule !== null || target.source.theme !== null ||
      !sameIds(target.impact.pageIds, token.impact.pageIds) || !sameIds(target.impact.anchors, token.impact.anchors) ||
      !sameIds(target.aliases, manifest.tokens.filter((item) => item.kind === "alias" && resolveTokenLeaf(manifest, item.name)?.name === token.name).map((item) => item.name))) return failed(request, "UNSUPPORTED_TARGET");
    if (!validateTokenValue(request.command.value, token)) return failed(request, "INVALID_VALUE");
  } else {
    if (target.kind !== "element") return failed(request, "UNSUPPORTED_TARGET");
    const command = request.command;
    const rule = getStyleRule(manifest, target.anchor, command.property, command.scopeId);
    const control = target.controls.find((item) => item.property === command.property && item.scopeId === command.scopeId);
    const owner = manifest.targets.find((item) => item.anchor === target.anchor);
    if (!rule || !control || !owner || !owner.editable || target.pageId !== owner.pageId ||
      target.source.file !== owner.source.file || target.source.structuralLocator !== owner.source.locator ||
      target.source.componentDefinitionFile !== owner.source.componentDefinitionFile ||
      target.source.componentCallSiteFile !== owner.source.componentCallSiteFile ||
      control.valueType !== rule.valueType || !sameCssRef(control.fallback, rule.fallback) ||
      !sameCssRef(control.override, rule.override)) return failed(request, "UNSUPPORTED_TARGET");
    if (command.type === "style.set" && !validateStyleValue(command.value, rule, manifest)) return failed(request, "INVALID_VALUE");
  }
  return success(request);
}

export function validateApplyChange(input: unknown, context: ChangeContext, proposal: ChangeProposal, manifest: ProjectManifest): ValidationResult<ApplyChange> {
  const parsed = ApplyChangeSchema.safeParse(input);
  const received = inputScope(input, context);
  if (!parsed.success || !ChangeProposalSchema.safeParse(proposal).success) return failed(received, "INVALID_REQUEST");
  const request = parsed.data;
  const mismatch = checkScope(request, context);
  if (mismatch) return failed(request, mismatch);
  if (request.expectedRevision !== context.sourceRevision || proposal.baseRevision !== context.sourceRevision) return failed(request, "STALE_REVISION");
  if (request.proposalId !== proposal.proposalId || request.projectId !== proposal.projectId || request.sessionId !== proposal.sessionId) return failed(request, "INVALID_SCOPE");
  if (!manifest.allowedCssFiles.includes(proposal.sourcePatch.file)) return failed(request, "UNSUPPORTED_TARGET");
  const prepared = validatePrepareChange({
    protocolVersion: PROTOCOL_VERSION, projectId: request.projectId, sessionId: request.sessionId,
    requestId: request.requestId, expectedRevision: proposal.baseRevision,
    targetId: proposal.targetId, command: proposal.command,
  }, context, manifest);
  if (!prepared.ok) return failed(request, prepared.error.error.code);
  const target = context.targets.find((item) => item.targetId === proposal.targetId);
  if (!target) return failed(request, "UNKNOWN_TARGET");
  if (proposal.command.type === "token.set") {
    if (target.kind !== "token-definition") return failed(request, "UNSUPPORTED_TARGET");
    const token = manifest.tokens.find((item) => item.kind === "definition" && item.name === target.tokenName);
    if (!token || token.kind !== "definition" || proposal.sourcePatch.file !== token.source.file ||
      !sameIds(proposal.impact.pageIds, token.impact.pageIds) ||
      !sameIds(proposal.impact.anchors, token.impact.anchors)) return failed(request, "UNSUPPORTED_TARGET");
  } else {
    if (target.kind !== "element") return failed(request, "UNSUPPORTED_TARGET");
    const rule = getStyleRule(manifest, target.anchor, proposal.command.property, proposal.command.scopeId);
    if (!rule || proposal.sourcePatch.file !== rule.override.file ||
      !sameIds(proposal.impact.pageIds, [target.pageId]) ||
      !sameIds(proposal.impact.anchors, [target.anchor])) return failed(request, "UNSUPPORTED_TARGET");
  }
  return success(request);
}

export function validateHistoryCommand(input: unknown, context: ScopeContext): ValidationResult<HistoryCommand> {
  const parsed = HistoryCommandSchema.safeParse(input);
  const received = inputScope(input, context);
  if (!parsed.success) return failed(received, "INVALID_REQUEST");
  const mismatch = checkScope(parsed.data, context);
  if (mismatch) return failed(parsed.data, mismatch);
  if (parsed.data.expectedRevision !== context.sourceRevision) return failed(parsed.data, "STALE_REVISION");
  return success(parsed.data);
}

export function validateReconcileRequest(input: unknown, context: ScopeContext): ValidationResult<ReconcileRequest> {
  const parsed = ReconcileRequestSchema.safeParse(input);
  const received = inputScope(input, context);
  if (!parsed.success) return failed(received, "INVALID_REQUEST");
  const mismatch = checkScope(parsed.data, context);
  if (mismatch) return failed(parsed.data, mismatch);
  return success(parsed.data);
}

export function validatePreviewEnvelope(input: unknown, context: ScopeContext): ValidationResult<PreviewEnvelope> {
  const parsed = PreviewEnvelopeSchema.safeParse(input);
  const received = inputScope(input, context);
  if (!parsed.success) return failed(received, "INVALID_REQUEST");
  const message = parsed.data;
  if (message.projectId !== context.projectId || message.sessionId !== context.sessionId || message.previewGeneration !== context.previewGeneration || message.frameId !== context.frameId || message.pageId !== context.pageId) return failed(received, "INVALID_SCOPE");
  if (message.sourceRevision !== context.sourceRevision) return failed(received, "STALE_REVISION");
  return success(message);
}
