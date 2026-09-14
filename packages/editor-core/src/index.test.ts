import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parseProjectManifest, type ProjectManifest, type SourceModel } from "@stellar/contracts";
import { applySourcePatch, createInversePatch, createSourceModel, prepareSourceChange, resolveSourceSelection, type SourceSnapshot } from "./index.js";

const fixtureRoot = fileURLToPath(new URL("../../../fixtures/astro-style-lab/", import.meta.url));
const fixtureFile = (path: string): Uint8Array => readFileSync(`${fixtureRoot}${path}`);
const manifest = parseProjectManifest(JSON.parse(readFileSync(`${fixtureRoot}.stellar/project.json`, "utf8")));
const files = [...new Set([
  ...manifest.allowedCssFiles, ...manifest.pages.map((page) => page.sourceFile),
  ...manifest.targets.flatMap((target) => [target.source.file, target.source.componentCallSiteFile].filter((file): file is string => file !== null)),
])];
const baseSnapshot = (): Record<string, Uint8Array> => Object.fromEntries(files.map((file) => [file, fixtureFile(file)]));
const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const modelFor = (snapshot: SourceSnapshot, pageId = "home", projectRevision = "revision-0001", usedManifest: ProjectManifest = manifest) =>
  createSourceModel({ snapshot, manifest: usedManifest, projectId: "project-a", sessionId: "session-a", requestId: "read-a", projectRevision, pageId });
const requestFor = (model: SourceModel, targetId: string, command: unknown, requestId = "prepare-a") => ({
  protocolVersion: "stellar.editor.v1", projectId: model.projectId, sessionId: model.sessionId,
  requestId, expectedRevision: model.projectRevision, targetId, command,
});
const element = (model: SourceModel, anchor: string) => {
  const target = model.targets.find((item) => item.kind === "element" && item.anchor === anchor);
  assert(target?.kind === "element");
  return target;
};
const token = (model: SourceModel, name: string) => {
  const target = model.targets.find((item) => item.kind === "token-definition" && item.tokenName === name);
  assert(target?.kind === "token-definition");
  return target;
};

test("read preserves bytes, resolves authored source keys and refuses repeated component instances", async () => {
  const snapshot = baseSnapshot();
  const before = Object.fromEntries(Object.entries(snapshot).map(([file, value]) => [file, text(value)]));
  const model = await modelFor(snapshot);
  const cta = element(model, "home-primary-cta");
  assert.equal(cta.readOnlyReason, null);
  const basePadding = cta.controls.find((control) => control.property === "padding-inline" && control.scopeId === "base");
  const mobilePadding = cta.controls.find((control) => control.property === "padding-inline" && control.scopeId === "mobile");
  assert.deepEqual(basePadding?.authoredValue, null);
  assert.deepEqual(basePadding?.fallbackValue, { kind: "token", name: "--lab-space-button" });
  assert.deepEqual(basePadding?.resolvedValue, { kind: "length", amount: 1.25, unit: "rem" });
  assert.deepEqual(mobilePadding?.fallbackValue, { kind: "token", name: "--lab-space-button" });
  assert.deepEqual(mobilePadding?.authoredValue, { kind: "length", amount: 1.5, unit: "rem" });
  assert.deepEqual(token(model, "--lab-space-action").aliases, ["--lab-space-button"]);
  assert.equal(element(model, "home-hero-title").controls[0]?.fallbackValue, null);
  assert.equal(resolveSourceSelection(model, { sourceKey: cta.targetId, anchor: cta.anchor, occurrenceId: "one" })?.targetId, cta.targetId);
  assert.equal(resolveSourceSelection(model, { sourceKey: cta.targetId, anchor: "wrong", occurrenceId: "one" }), null);
  assert.equal(element(model, "home-feature-clarity").readOnlyReason, "repeated-component");
  const repeated = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, element(model, "home-feature-clarity").targetId,
    { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#112233" } }) });
  assert.equal(repeated.status, "refused");
  assert.deepEqual(Object.fromEntries(Object.entries(snapshot).map(([file, value]) => [file, text(value)])), before);
});

test("base and mobile edits change one declaration, reset it and keep neighboring bytes", async () => {
  const snapshot = baseSnapshot();
  const model = await modelFor(snapshot);
  const cta = element(model, "home-primary-cta");
  const source = text(snapshot["src/styles/site.css"]!);
  const set = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, cta.targetId,
    { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "color", hex: "#123456" } }) });
  assert.equal(set.status, "ready");
  if (set.status !== "ready") return;
  assert.equal(set.proposal.sourcePatch.expectedOldText, "");
  assert.equal(set.proposal.impact.anchors.join(), "home-primary-cta");
  const changed = applySourcePatch(snapshot["src/styles/site.css"]!, set.proposal.sourcePatch);
  assert.equal(text(changed), source.replace("#home-primary-cta { }", "#home-primary-cta { background-color: #123456; }") );
  const inverse = createInversePatch(set.proposal.sourcePatch, changed);
  assert.deepEqual(Buffer.from(applySourcePatch(changed, inverse)), Buffer.from(snapshot["src/styles/site.css"]!));
  assert.throws(() => createInversePatch(set.proposal.sourcePatch, Buffer.concat([changed, Buffer.from("\n/* unrelated later change */")])));
  assert.throws(() => applySourcePatch(bytes("other"), set.proposal.sourcePatch));

  const changedSnapshot = { ...snapshot, "src/styles/site.css": changed };
  const stale = await prepareSourceChange({ snapshot: changedSnapshot, manifest, model, request: requestFor(model, cta.targetId,
    { type: "style.reset", property: "background-color", scopeId: "base" }, "prepare-stale") });
  assert.equal(stale.status, "refused");
  if (stale.status === "refused") assert.equal(stale.error.code, "STALE_REVISION");
  const changedModel = await modelFor(changedSnapshot, "home", "revision-0002");
  const reset = await prepareSourceChange({ snapshot: changedSnapshot, manifest, model: changedModel, request: requestFor(changedModel, element(changedModel, "home-primary-cta").targetId,
    { type: "style.reset", property: "background-color", scopeId: "base" }, "prepare-reset") });
  assert.equal(reset.status, "ready");
  if (reset.status === "ready") {
    const resetBytes = applySourcePatch(changed, reset.proposal.sourcePatch);
    assert.equal(text(resetBytes), source.replace("#home-primary-cta { }", "#home-primary-cta {  }"));
    assert.equal(reset.proposal.sourcePatch.replacementText, "");
    assert.deepEqual(Buffer.from(applySourcePatch(resetBytes, createInversePatch(reset.proposal.sourcePatch, resetBytes))), Buffer.from(changed));
    assert.throws(() => createInversePatch(reset.proposal.sourcePatch, Buffer.concat([resetBytes, Buffer.from("\n/* unrelated later change */")])));
  }

  const mobile = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, cta.targetId,
    { type: "style.set", property: "padding-inline", scopeId: "mobile", value: { kind: "length", amount: 2, unit: "rem" } }, "prepare-mobile") });
  assert.equal(mobile.status, "ready");
  if (mobile.status === "ready") {
    assert.equal(mobile.proposal.sourcePatch.expectedOldText, "1.5rem");
    assert.equal(text(applySourcePatch(snapshot["src/styles/site.css"]!, mobile.proposal.sourcePatch)), source.replace("#home-primary-cta { padding-inline: 1.5rem; }", "#home-primary-cta { padding-inline: 2rem; }"));
  }
});

test("token leaf change leaves aliases intact, scoped duplicates separate, no-op unchanged", async () => {
  const snapshot = baseSnapshot();
  const model = await modelFor(snapshot);
  const action = token(model, "--lab-color-action-base");
  assert.deepEqual(action.aliases, ["--lab-color-action"]);
  assert.deepEqual(action.impact.pageIds, ["home", "contact"]);
  const same = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, action.targetId,
    { type: "token.set", value: { kind: "color", hex: "#146d69" } }, "prepare-same") });
  assert.equal(same.status, "unchanged");
  const proposed = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, action.targetId,
    { type: "token.set", value: { kind: "color", hex: "#345678" } }) });
  assert.equal(proposed.status, "ready");
  if (proposed.status !== "ready") return;
  const original = text(snapshot["src/styles/tokens.css"]!);
  const edited = text(applySourcePatch(snapshot["src/styles/tokens.css"]!, proposed.proposal.sourcePatch));
  assert.equal(edited, original.replace("--lab-color-action-base: #146d69;", "--lab-color-action-base: #345678;"));
  assert(edited.includes("--lab-color-action: var(--lab-color-action-base);"));

  const scoped = { ...snapshot, "src/styles/tokens.css": bytes(`${original}\n@media (max-width: 767px) { :root { --lab-color-action-base: #abcdef; } }\n`) };
  const scopedModel = await modelFor(scoped);
  assert.equal(token(scopedModel, "--lab-color-action-base").readOnlyReason, "scope-ambiguous");
  assert.equal(element(scopedModel, "home-primary-cta").readOnlyReason, "scope-ambiguous");
  const duplicate = { ...snapshot, "src/styles/tokens.css": bytes(original.replace("--lab-color-action-base: #146d69;", "--lab-color-action-base: #146d69;\n  --lab-color-action-base: #abcdef;")) };
  const duplicateModel = await modelFor(duplicate);
  assert.equal(duplicateModel.targets.some((item) => item.kind === "token-definition" && item.tokenName === "--lab-color-action-base"), false);
});

test("invalid values, alias corruption, unsupported Astro and malformed CSS refuse edits", async () => {
  const snapshot = baseSnapshot();
  const model = await modelFor(snapshot);
  const cta = element(model, "home-primary-cta");
  const invalid = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, cta.targetId,
    { type: "style.set", property: "padding-inline", scopeId: "base", value: { kind: "length", amount: 20, unit: "rem" } }) });
  assert.equal(invalid.status, "refused");
  if (invalid.status === "refused") assert.equal(invalid.error.code, "INVALID_VALUE");
  const invalidId = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, cta.targetId,
    { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "color", hex: "#123456" } }, "/bad/path") });
  assert.equal(invalidId.status, "refused");
  if (invalidId.status === "refused") {
    assert.equal(invalidId.error.code, "INVALID_REQUEST");
    assert.equal(invalidId.requestId, model.requestId);
  }
  const badAlias = { ...snapshot, "src/styles/tokens.css": bytes(text(snapshot["src/styles/tokens.css"]!).replace("var(--lab-color-action-base)", "var(--missing)")) };
  const aliasModel = await modelFor(badAlias);
  assert.equal(element(aliasModel, "home-primary-cta").readOnlyReason, "unknown-token");
  assert.equal(token(aliasModel, "--lab-color-action-base").readOnlyReason, "unknown-token");
  const wrongAstro = { ...snapshot, "src/pages/index.astro": bytes(text(snapshot["src/pages/index.astro"]!).replace('id="home-primary-cta"', 'id={"home-primary-cta"}')) };
  const astroModel = await modelFor(wrongAstro);
  assert.equal(element(astroModel, "home-primary-cta").readOnlyReason, "unsupported-source");
  const wrongClass = { ...snapshot, "src/pages/index.astro": bytes(text(snapshot["src/pages/index.astro"]!).replace('class="button button--primary" id="home-primary-cta"', 'class="button" id="home-primary-cta"')) };
  const classModel = await modelFor(wrongClass);
  assert.equal(element(classModel, "home-primary-cta").readOnlyReason, "unsupported-source");
  const duplicateRule = { ...snapshot, "src/styles/site.css": bytes(`${text(snapshot["src/styles/site.css"]!)}\n#home-primary-cta { color: #123456; }\n`) };
  const ruleModel = await modelFor(duplicateRule);
  assert.equal(element(ruleModel, "home-primary-cta").readOnlyReason, "ambiguous-owner");
  const unterminated = { ...snapshot, "src/styles/site.css": bytes(text(snapshot["src/styles/site.css"]!).replace("#home-primary-cta { }", "#home-primary-cta { color: red }")) };
  const unterminatedModel = await modelFor(unterminated);
  const unsafeInsertion = await prepareSourceChange({ snapshot: unterminated, manifest, model: unterminatedModel,
    request: requestFor(unterminatedModel, element(unterminatedModel, "home-primary-cta").targetId,
      { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "color", hex: "#123456" } }, "prepare-unterminated") });
  assert.equal(unsafeInsertion.status, "refused");
  const brokenCss = { ...snapshot, "src/styles/site.css": bytes(`${text(snapshot["src/styles/site.css"]!)}\n.broken {`) };
  const refused = await prepareSourceChange({ snapshot: brokenCss, manifest, model, request: requestFor(model, cta.targetId,
    { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "color", hex: "#123456" } }) });
  assert.equal(refused.status, "refused");
});

test("UTF-8 prefixes preserve exact byte offsets and inverse bytes", async () => {
  const snapshot = baseSnapshot();
  snapshot["src/styles/site.css"] = bytes(`/* 🌠 café */\n${text(snapshot["src/styles/site.css"]!)}`);
  const model = await modelFor(snapshot);
  const target = element(model, "home-hero-title");
  const result = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, target.targetId,
    { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#abcdef" } }) });
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.proposal.sourcePatch.expectedOldText, "#214d4c");
  const original = snapshot["src/styles/site.css"]!;
  const applied = applySourcePatch(original, result.proposal.sourcePatch);
  assert.equal(text(applied), text(original).replace("#home-hero-title { color: #214d4c; }", "#home-hero-title { color: #abcdef; }"));
  assert.deepEqual(Buffer.from(applySourcePatch(applied, createInversePatch(result.proposal.sourcePatch, applied))), Buffer.from(original));
});
