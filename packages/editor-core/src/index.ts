import { createHash } from "node:crypto";
import { parse as parseAstro } from "@astrojs/compiler";
import postcss, { type Declaration, type Root, type Rule } from "postcss";
import {
  ChangeProposalSchema, OpaqueIdSchema, ProjectManifestSchema, ProjectRevisionSchema, SourceModelSchema,
  SourcePatchSchema, validatePrepareChange, makeError, resolveTokenLeaf,
  type ConcreteValue, type CssDeclarationRef, type PrepareChangeResponse,
  type ProjectManifest, type SourceModel, type SourcePatch, type SourceTarget,
  type StyleValue,
} from "@stellar/contracts";

export type SourceSnapshot = Readonly<Record<string, Uint8Array>>;
export type SourceModelInput = {
  snapshot: SourceSnapshot; manifest: ProjectManifest; projectId: string; sessionId: string;
  requestId: string; projectRevision: string; pageId: string;
};
export type PrepareSourceInput = {
  snapshot: SourceSnapshot; manifest: ProjectManifest; model: SourceModel; request: unknown;
};
export type SourceSelection = { sourceKey: string; anchor: string; occurrenceId: string };

const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
const sha = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const sourceText = (snapshot: SourceSnapshot, file: string): string => {
  const bytes = snapshot[file];
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 10_000_000) throw new Error("Missing or oversized source file");
  return decoder.decode(bytes);
};
const byteAt = (text: string, index: number): number => encoder.encode(text.slice(0, index)).length;
const identity = (revision: string, kind: string, key: string, snapshotHash: string): string =>
  `target-${sha(`${revision}\0${kind}\0${key}\0${snapshotHash}`).slice(0, 32)}`;

type CssFile = { text: string; root: Root };
type CssFiles = ReadonlyMap<string, CssFile>;
type Located = { status: "ok"; rule: Rule; declaration: Declaration | null; file: CssFile } | { status: "missing" | "ambiguous" };

function parseCssFiles(snapshot: SourceSnapshot, manifest: ProjectManifest): CssFiles {
  const files = new Map<string, CssFile>();
  for (const file of manifest.allowedCssFiles) {
    const text = sourceText(snapshot, file);
    files.set(file, { text, root: postcss.parse(text, { from: file }) });
  }
  return files;
}

function ruleScope(rule: Rule): { scopeId: "base" | "mobile"; atRule: string | null } | null {
  const parent = rule.parent;
  if (parent?.type === "root") return { scopeId: "base", atRule: null };
  if (parent?.type === "atrule" && parent.name.toLowerCase() === "media" && parent.params.trim() === "(max-width: 767px)" && parent.parent?.type === "root") {
    return { scopeId: "mobile", atRule: parent.params.trim() };
  }
  return null;
}

function locate(files: CssFiles, ref: CssDeclarationRef): Located {
  const file = files.get(ref.file);
  if (!file) return { status: "missing" };
  const rules: Rule[] = [];
  file.root.walkRules((rule) => {
    const scope = ruleScope(rule);
    if (rule.selector.trim() === ref.selector && scope?.scopeId === ref.scopeId && scope.atRule === ref.atRule) rules.push(rule);
  });
  if (rules.length === 0) return { status: "missing" };
  if (rules.length !== 1) return { status: "ambiguous" };
  const rule = rules[0]!;
  const declarations = (rule.nodes ?? []).filter((node): node is Declaration => node.type === "decl" && node.prop === ref.property);
  if (declarations.length > 1) return { status: "ambiguous" };
  return { status: "ok", rule, declaration: declarations[0] ?? null, file };
}

function ambiguousTokenNames(files: CssFiles, manifest: ProjectManifest): ReadonlySet<string> {
  const ambiguous = new Set<string>();
  for (const token of manifest.tokens) {
    let count = 0;
    for (const file of files.values()) file.root.walkDecls(token.name, () => { count++; });
    if (count > 1) ambiguous.add(token.name);
  }
  return ambiguous;
}

function tokenChainAmbiguous(manifest: ProjectManifest, names: ReadonlySet<string>, name: string): boolean {
  const seen = new Set<string>();
  let current = manifest.tokens.find((item) => item.name === name);
  while (current) {
    if (names.has(current.name)) return true;
    if (current.kind === "definition") return false;
    if (seen.has(current.name)) return true;
    seen.add(current.name);
    const reference: string = current.reference;
    current = manifest.tokens.find((item) => item.name === reference);
  }
  return false;
}

function authoredValue(raw: string): StyleValue | null {
  const value = raw.trim();
  if (/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value)) return { kind: "color", hex: value };
  const length = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|rem)$/.exec(value);
  if (length) return { kind: "length", amount: Number(length[1]), unit: length[2] as "px" | "rem" };
  const token = /^var\((--[a-z][a-z0-9-]*)\)$/.exec(value);
  if (token) return { kind: "token", name: token[1]! };
  return null;
}

function tokenState(files: CssFiles, manifest: ProjectManifest, ambiguous: ReadonlySet<string>): Map<string, { value: ConcreteValue; leaf: string } | null> {
  const state = new Map<string, { value: ConcreteValue; leaf: string } | null>();
  for (const token of manifest.tokens) {
    // A second declaration of a named token may override the selected leaf in a
    // different selector or media condition. M1 cannot prove its effect.
    if (ambiguous.has(token.name)) { state.set(token.name, null); continue; }
    const found = locate(files, token.source);
    if (found.status !== "ok" || !found.declaration || found.declaration.important) { state.set(token.name, null); continue; }
    const parsed = authoredValue(found.declaration.value);
    if (token.kind === "definition") {
      const valid = parsed?.kind === token.valueType && (parsed.kind === "color" ||
        (token.allowedUnits.includes(parsed.unit) && token.min !== null && token.max !== null && parsed.amount >= token.min && parsed.amount <= token.max));
      state.set(token.name, valid ? { value: parsed as ConcreteValue, leaf: token.name } : null);
    } else {
      state.set(token.name, parsed?.kind === "token" && parsed.name === token.reference ? { value: { kind: "color", hex: "#000000" }, leaf: token.reference } : null);
    }
  }
  for (const token of manifest.tokens) {
    if (token.kind !== "alias" || !state.get(token.name)) continue;
    const leaf = resolveTokenLeaf(manifest, token.name);
    const leafState = leaf && state.get(leaf.name);
    let current: (typeof manifest.tokens)[number] = token;
    const seen = new Set<string>();
    let chainValid = true;
    while (current.kind === "alias") {
      if (seen.has(current.name) || !state.get(current.name)) { chainValid = false; break; }
      seen.add(current.name);
      const reference: string = current.reference;
      const next: (typeof manifest.tokens)[number] | undefined = manifest.tokens.find((item) => item.name === reference);
      if (!next) { chainValid = false; break; }
      current = next;
    }
    state.set(token.name, chainValid && leafState ? { value: leafState.value, leaf: leaf!.name } : null);
  }
  return state;
}

type AstroAttribute = { type?: string; kind?: string; name?: string; value?: string };
type AstroNode = { type?: string; name?: string; attributes?: AstroAttribute[]; children?: AstroNode[] };
function staticAttribute(node: AstroNode, name: string): string | null {
  const attribute = node.attributes?.find((item) => item.type === "attribute" && item.name === name);
  return attribute?.kind === "quoted" ? attribute.value ?? null : null;
}
function findStaticIds(nodes: AstroNode[], id: string): AstroNode[] {
  const matches: AstroNode[] = [];
  const visit = (node: AstroNode, dynamic: boolean) => {
    const insideDynamic = dynamic || node.type === "expression";
    if (!insideDynamic && node.type === "element" && /^[a-z][a-z0-9-]*$/.test(node.name ?? "") && staticAttribute(node, "id") === id) matches.push(node);
    node.children?.forEach((child) => visit(child, insideDynamic));
  };
  nodes.forEach((node) => visit(node, false));
  return matches;
}

async function astroAnchorStatus(snapshot: SourceSnapshot, manifest: ProjectManifest, pageId: string): Promise<Map<string, "ok" | "unsupported">> {
  const status = new Map<string, "ok" | "unsupported">();
  const page = manifest.pages.find((item) => item.id === pageId);
  if (!page) throw new Error("Unknown page");
  const files = new Map<string, AstroNode[]>();
  for (const target of manifest.targets.filter((item) => item.pageId === pageId)) {
    for (const file of [target.source.file, target.source.componentCallSiteFile]) {
      if (!file || files.has(file)) continue;
      try {
        const parsed = await parseAstro(sourceText(snapshot, file), { position: true });
        files.set(file, parsed.diagnostics.some((diagnostic) => diagnostic.severity === 1) ? [] : parsed.ast.children as AstroNode[]);
      } catch { files.set(file, []); }
    }
    const source = files.get(target.source.file) ?? [];
    const callSite = target.source.componentCallSiteFile ? files.get(target.source.componentCallSiteFile) ?? [] : source;
    const id = target.anchor;
    const nodes = findStaticIds(target.source.componentCallSiteFile ? callSite : source, id);
    if (target.source.componentCallSiteFile) {
      // Repeated component instances have only a call-site ID in M1; the
      // rendered node lives in a shared definition, so they remain read-only.
      status.set(id, nodes.length === 0 ? "unsupported" : "ok");
      continue;
    }
    const ownRules = manifest.styleRules.filter((rule) => rule.anchor === id);
    const node = nodes[0];
    const classes = (node ? staticAttribute(node, "class")?.split(/\s+/) : null) ?? [];
    const selectorsMatch = ownRules.every((rule) => rule.override.selector === `#${id}` &&
      (rule.fallback.selector.startsWith(".") ? classes.includes(rule.fallback.selector.slice(1)) : rule.fallback.selector === `#${id}`));
    status.set(id, target.source.locator === `#${id}` && nodes.length === 1 && selectorsMatch ? "ok" : "unsupported");
  }
  return status;
}

function snapshotFingerprint(snapshot: SourceSnapshot, manifest: ProjectManifest): string {
  const files = [...new Set([...manifest.allowedCssFiles, ...manifest.pages.map((p) => p.sourceFile), ...manifest.targets.flatMap((t) => [t.source.file, t.source.componentCallSiteFile].filter((f): f is string => f !== null))])].sort();
  const hash = createHash("sha256");
  for (const file of files) { hash.update(file); hash.update("\0"); hash.update(sourceText(snapshot, file)); hash.update("\0"); }
  hash.update(JSON.stringify(manifest));
  return hash.digest("hex");
}

export async function createSourceModel(input: SourceModelInput): Promise<SourceModel> {
  const manifest = ProjectManifestSchema.parse(input.manifest);
  ProjectRevisionSchema.parse(input.projectRevision);
  const page = manifest.pages.find((item) => item.id === input.pageId);
  if (!page) throw new Error("Unknown page");
  const files = parseCssFiles(input.snapshot, manifest);
  const ambiguousTokens = ambiguousTokenNames(files, manifest);
  const tokenValues = tokenState(files, manifest, ambiguousTokens);
  const astroStatus = await astroAnchorStatus(input.snapshot, manifest, input.pageId);
  const fingerprint = snapshotFingerprint(input.snapshot, manifest);
  const tokenTargets: SourceTarget[] = [];
  for (const token of manifest.tokens) {
    if (token.kind !== "definition") continue;
    const current = tokenValues.get(token.name);
    const approved = locate(files, token.source);
    const raw = approved.status === "ok" && approved.declaration ? authoredValue(approved.declaration.value) : null;
    const directValue = raw?.kind === token.valueType && (raw.kind === "color" ||
      (token.allowedUnits.includes(raw.unit) && token.min !== null && token.max !== null && raw.amount >= token.min && raw.amount <= token.max)) ? raw as ConcreteValue : null;
    if (!directValue || (!current && !ambiguousTokens.has(token.name))) continue;
    const aliases = manifest.tokens.filter((item) => item.kind === "alias" && resolveTokenLeaf(manifest, item.name)?.name === token.name).map((item) => item.name);
    const brokenAlias = aliases.some((name) => !tokenValues.get(name));
    const scopeAmbiguous = tokenChainAmbiguous(manifest, ambiguousTokens, token.name) || aliases.some((name) => tokenChainAmbiguous(manifest, ambiguousTokens, name));
    const readOnlyReason = scopeAmbiguous ? "scope-ambiguous" : brokenAlias ? "unknown-token" : null;
    tokenTargets.push({
      kind: "token-definition", targetId: identity(input.projectRevision, "token", token.id, fingerprint), revision: input.projectRevision,
      tokenName: token.name, source: token.source, valueType: token.valueType, editable: readOnlyReason === null, readOnlyReason,
      authoredValue: directValue, allowedUnits: token.allowedUnits, min: token.min, max: token.max, aliases, impact: token.impact,
    });
  }
  const elementTargets: SourceTarget[] = [];
  for (const target of manifest.targets.filter((item) => item.pageId === input.pageId)) {
    let reason: Extract<SourceTarget, { kind: "element" }>["readOnlyReason"] = target.readOnlyReason;
    if (!reason && astroStatus.get(target.anchor) !== "ok") reason = "unsupported-source";
    const controls: Extract<SourceTarget, { kind: "element" }>["controls"] = [];
    for (const rule of manifest.styleRules.filter((item) => item.anchor === target.anchor)) {
      const fallback = locate(files, rule.fallback);
      const override = locate(files, rule.override);
      if (fallback.status !== "ok" || !fallback.declaration || override.status !== "ok") { reason ??= "ambiguous-owner"; continue; }
      if (fallback.declaration.important || override.declaration?.important) { reason ??= "ambiguous-owner"; continue; }
      const fallbackValue = authoredValue(fallback.declaration.value);
      const overrideValue = override.declaration ? authoredValue(override.declaration.value) : null;
      const chosen = override.declaration ? overrideValue : fallbackValue;
      const token = chosen?.kind === "token" ? tokenValues.get(chosen.name) : null;
      const brokenBoundToken = [fallbackValue, overrideValue].some((value) => value?.kind === "token" && rule.allowedTokenNames.includes(value.name) && !tokenValues.get(value.name));
      if (brokenBoundToken) {
        reason ??= [fallbackValue, overrideValue].some((value) => value?.kind === "token" && tokenChainAmbiguous(manifest, ambiguousTokens, value.name)) ? "scope-ambiguous" : "unknown-token";
        continue;
      }
      if (!chosen || (chosen.kind === "token" && rule.allowedTokenNames.includes(chosen.name) && !token) || (override.declaration && !overrideValue)) { reason ??= chosen?.kind === "token" ? "unknown-token" : "unsupported-source"; continue; }
      if (chosen.kind !== "token" && chosen.kind !== rule.valueType) { reason ??= "unsupported-source"; continue; }
      controls.push({
        property: rule.property, scopeId: rule.scopeId, valueType: rule.valueType, allowedUnits: rule.allowedUnits,
        min: rule.min, max: rule.max, allowedTokenNames: rule.allowedTokenNames,
        authoredValue: overrideValue, resolvedValue: chosen.kind === "token" ? token?.value ?? null : chosen,
        provenance: override.declaration ? "override" : fallbackValue?.kind === "token" ? "token" : "fallback",
        fallback: rule.fallback, override: rule.override,
      });
    }
    const linked = tokenTargets.filter((item) => item.kind === "token-definition" && manifest.styleRules.some((rule) => rule.anchor === target.anchor && rule.allowedTokenNames.some((name) => resolveTokenLeaf(manifest, name)?.name === item.tokenName))).map((item) => item.targetId);
    elementTargets.push({
      kind: "element", targetId: identity(input.projectRevision, "element", `${input.pageId}\0${target.anchor}`, fingerprint), revision: input.projectRevision,
      anchor: target.anchor, pageId: target.pageId,
      source: { file: target.source.file, structuralLocator: target.source.locator, componentDefinitionFile: target.source.componentDefinitionFile, componentCallSiteFile: target.source.componentCallSiteFile },
      editable: reason === null, readOnlyReason: reason, controls, linkedTokenTargetIds: linked,
    });
  }
  return SourceModelSchema.parse({
    protocolVersion: "stellar.editor.v1", projectId: input.projectId, sessionId: input.sessionId,
    requestId: input.requestId, pageId: input.pageId, projectRevision: input.projectRevision,
    targets: [...elementTargets, ...tokenTargets],
  });
}

export function resolveSourceSelection(model: SourceModel, selection: SourceSelection): SourceTarget | null {
  const target = model.targets.find((item) => item.kind === "element" && item.targetId === selection.sourceKey && item.anchor === selection.anchor);
  return target ?? null;
}

function formatValue(value: StyleValue): string {
  if (value.kind === "color") return value.hex;
  if (value.kind === "length") return `${value.amount}${value.unit}`;
  return `var(${value.name})`;
}

function valueSpan(file: CssFile, declaration: Declaration): { start: number; end: number; oldText: string } | null {
  const start = declaration.source?.start?.offset;
  const end = declaration.source?.end?.offset;
  if (start === undefined || end === undefined) return null;
  const raw = file.text.slice(start, end);
  const colon = raw.indexOf(":");
  if (colon < 0 || raw.slice(0, colon).trim() !== declaration.prop || declaration.important || raw.includes("/*")) return null;
  const afterColon = raw.slice(colon + 1);
  const match = /^(\s*)(.*?)(\s*;?\s*)$/s.exec(afterColon);
  if (!match || match[2]?.trim() !== declaration.value.trim()) return null;
  const valueStart = start + colon + 1 + match[1]!.length;
  return { start: valueStart, end: valueStart + match[2]!.length, oldText: match[2]! };
}

function patchForValue(ref: CssDeclarationRef, located: Extract<Located, { status: "ok" }>, replacement: string | null): SourcePatch | null {
  const bytes = encoder.encode(located.file.text);
  if (located.declaration) {
    const span = valueSpan(located.file, located.declaration);
    if (!span) return null;
    if (replacement === span.oldText) return null;
    if (replacement === null) {
      const start = located.declaration.source?.start?.offset;
      const end = located.declaration.source?.end?.offset;
      if (start === undefined || end === undefined) return null;
      return SourcePatchSchema.parse({ file: ref.file, startByte: byteAt(located.file.text, start), endByte: byteAt(located.file.text, end),
        expectedOldText: located.file.text.slice(start, end), replacementText: "", expectedFileSha256: sha(bytes) });
    }
    return SourcePatchSchema.parse({ file: ref.file, startByte: byteAt(located.file.text, span.start), endByte: byteAt(located.file.text, span.end),
      expectedOldText: span.oldText, replacementText: replacement, expectedFileSha256: sha(bytes) });
  }
  if (replacement === null) return null;
  const closing = located.rule.source?.end?.offset;
  if (closing === undefined || located.file.text[closing - 1] !== "}") return null;
  const index = closing - 1;
  const prefix = /\s/.test(located.file.text[index - 1] ?? "") ? "" : " ";
  return SourcePatchSchema.parse({ file: ref.file, startByte: byteAt(located.file.text, index), endByte: byteAt(located.file.text, index),
    expectedOldText: "", replacementText: `${prefix}${ref.property}: ${replacement}; `, expectedFileSha256: sha(bytes) });
}

function refusal(model: SourceModel, requestId: string, code: Parameters<typeof makeError>[1]): PrepareChangeResponse {
  return { protocolVersion: "stellar.editor.v1", projectId: model.projectId, sessionId: model.sessionId, requestId,
    status: "refused", error: makeError({ projectId: model.projectId, sessionId: model.sessionId, requestId }, code).error };
}

export async function prepareSourceChange(input: PrepareSourceInput): Promise<PrepareChangeResponse> {
  const { model, request, manifest, snapshot } = input;
  const rawRequestId = typeof request === "object" && request !== null && "requestId" in request ? request.requestId : null;
  const requestId = OpaqueIdSchema.safeParse(rawRequestId).success ? rawRequestId as string : model.requestId;
  if (!SourceModelSchema.safeParse(model).success || !ProjectManifestSchema.safeParse(manifest).success) return refusal(model, requestId, "INVALID_REQUEST");
  const checked = validatePrepareChange(request, { projectId: model.projectId, sessionId: model.sessionId, sourceRevision: model.projectRevision, previewGeneration: "engine", targets: model.targets }, manifest);
  if (!checked.ok) return refusal(model, requestId, checked.error.error.code);
  const intent = checked.value;
  try {
    const current = await createSourceModel({ snapshot, manifest, projectId: model.projectId, sessionId: model.sessionId, requestId: model.requestId, projectRevision: model.projectRevision, pageId: model.pageId });
    if (JSON.stringify(current.targets) !== JSON.stringify(model.targets)) return refusal(model, requestId, "STALE_REVISION");
    const target = current.targets.find((item) => item.targetId === intent.targetId);
    if (!target) return refusal(model, requestId, "UNKNOWN_TARGET");
    const files = parseCssFiles(snapshot, manifest);
    let ref: CssDeclarationRef;
    let replacement: string | null;
    let impact: { pageIds: string[]; anchors: string[]; coverage: "declared" };
    if (intent.command.type === "token.set") {
      if (target.kind !== "token-definition") return refusal(model, requestId, "UNSUPPORTED_TARGET");
      ref = target.source;
      replacement = formatValue(intent.command.value);
      impact = target.impact;
    } else {
      if (target.kind !== "element") return refusal(model, requestId, "UNSUPPORTED_TARGET");
      const command = intent.command;
      if (command.type === "style.set" && command.value.kind === "token" && !tokenState(files, manifest, ambiguousTokenNames(files, manifest)).get(command.value.name)) return refusal(model, requestId, "UNSUPPORTED_TARGET");
      const control = target.controls.find((item) => item.property === command.property && item.scopeId === command.scopeId);
      if (!control) return refusal(model, requestId, "UNSUPPORTED_TARGET");
      ref = control.override;
      replacement = command.type === "style.reset" ? null : formatValue(command.value);
      impact = { pageIds: [target.pageId], anchors: [target.anchor], coverage: "declared" };
    }
    const found = locate(files, ref);
    if (found.status !== "ok" || (intent.command.type === "token.set" && !found.declaration)) return refusal(model, requestId, "UNSUPPORTED_TARGET");
    const patch = patchForValue(ref, found, replacement);
    if (!patch) {
      if (replacement === null && !found.declaration || found.declaration && found.declaration.value.trim() === replacement) {
        return { protocolVersion: "stellar.editor.v1", projectId: model.projectId, sessionId: model.sessionId, requestId, status: "unchanged", reason: "The source already has that value." };
      }
      return refusal(model, requestId, "UNSUPPORTED_TARGET");
    }
    // The edited CSS must parse and still contain exactly the intended one
    // declaration (or none after reset). This rejects unsafe insertion shapes.
    const editedText = decoder.decode(applySourcePatch(snapshot[patch.file]!, patch));
    const edited = locate(new Map([[patch.file, { text: editedText, root: postcss.parse(editedText, { from: patch.file }) }]]), ref);
    if (edited.status !== "ok" || (replacement === null ? edited.declaration !== null : edited.declaration?.value.trim() !== replacement)) {
      return refusal(model, requestId, "UNSUPPORTED_TARGET");
    }
    const proposal = ChangeProposalSchema.parse({
      proposalId: `proposal-${sha(`${requestId}\0${target.targetId}\0${JSON.stringify(intent.command)}\0${patch.expectedFileSha256}`).slice(0, 32)}`,
      projectId: model.projectId, sessionId: model.sessionId, targetId: target.targetId,
      baseRevision: model.projectRevision, command: intent.command, impact, sourcePatch: patch,
    });
    return { protocolVersion: "stellar.editor.v1", projectId: model.projectId, sessionId: model.sessionId, requestId, status: "ready", proposal };
  } catch {
    return refusal(model, requestId, "UNSUPPORTED_TARGET");
  }
}

export class PatchConflictError extends Error {
  constructor() { super("Source bytes do not match the guarded patch"); this.name = "PatchConflictError"; }
}

export function applySourcePatch(bytes: Uint8Array, patch: SourcePatch): Uint8Array {
  SourcePatchSchema.parse(patch);
  if (sha(bytes) !== patch.expectedFileSha256 || patch.endByte > bytes.byteLength) throw new PatchConflictError();
  const oldBytes = encoder.encode(patch.expectedOldText);
  if (!Buffer.from(bytes.subarray(patch.startByte, patch.endByte)).equals(Buffer.from(oldBytes))) throw new PatchConflictError();
  const replacement = encoder.encode(patch.replacementText);
  const result = new Uint8Array(bytes.byteLength - oldBytes.byteLength + replacement.byteLength);
  result.set(bytes.subarray(0, patch.startByte));
  result.set(replacement, patch.startByte);
  result.set(bytes.subarray(patch.endByte), patch.startByte + replacement.byteLength);
  return result;
}

export function createInversePatch(patch: SourcePatch, appliedBytes: Uint8Array): SourcePatch {
  SourcePatchSchema.parse(patch);
  const replacementBytes = encoder.encode(patch.replacementText);
  if (patch.startByte + replacementBytes.length > appliedBytes.length ||
      !Buffer.from(appliedBytes.subarray(patch.startByte, patch.startByte + replacementBytes.length)).equals(Buffer.from(replacementBytes))) throw new PatchConflictError();
  const inverse = SourcePatchSchema.parse({ file: patch.file, startByte: patch.startByte, endByte: patch.startByte + replacementBytes.length,
    expectedOldText: patch.replacementText, replacementText: patch.expectedOldText, expectedFileSha256: sha(appliedBytes) });
  // The matching span alone is insufficient: another write could have changed
  // unrelated bytes after this patch. Reconstruct and verify the full preimage.
  if (sha(applySourcePatch(appliedBytes, inverse)) !== patch.expectedFileSha256) throw new PatchConflictError();
  return inverse;
}
