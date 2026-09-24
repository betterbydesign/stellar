import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseProjectManifest, type SourceModel } from "@stellar/contracts";
import { applySourcePatch, createInversePatch, createSourceModel, prepareSourceChange } from "./index.js";

const root = new URL("../../../fixtures/astro-style-lab/", import.meta.url);
const manifest = parseProjectManifest(JSON.parse(readFileSync(new URL(".stellar/project.json", root), "utf8")));
const files = [...new Set([...manifest.allowedCssFiles, ...manifest.pages.map((page) => page.sourceFile),
  ...manifest.targets.flatMap((target) => [target.source.file, target.source.componentCallSiteFile].filter((file): file is string => file !== null))])];
const snapshotFor = (): Record<string, Uint8Array> => Object.fromEntries(files.map((file) => [file, readFileSync(new URL(file, root))]));
const modelFor = (snapshot: Record<string, Uint8Array>) => createSourceModel({ snapshot, manifest,
  projectId: "project-a", sessionId: "session-a", requestId: "read-preservation", projectRevision: "revision-0001", pageId: "home" });
const targetFor = (model: SourceModel, anchor: string) => {
  const target = model.targets.find((item) => item.kind === "element" && item.anchor === anchor);
  assert(target?.kind === "element");
  return target;
};
const requestFor = (model: SourceModel, targetId: string, command: unknown) => ({
  protocolVersion: "stellar.editor.v1", projectId: model.projectId, sessionId: model.sessionId,
  requestId: "prepare-preservation", expectedRevision: model.projectRevision, targetId, command,
});

test("standard property casing identifies the authored declaration and refuses duplicate owners", async () => {
  for (const declarations of ["color: #214d4c; COLOR: #abcdef;", "COLOR: #abcdef; color: #214d4c;", "CoLoR: #214d4c; COLOR: #abcdef;"]) {
    const snapshot = snapshotFor();
    const file = "src/styles/site.css";
    snapshot[file] = Buffer.from(Buffer.from(snapshot[file]!).toString().replace("color: #214d4c;", declarations));
    const before = Buffer.from(snapshot[file]!);
    const model = await modelFor(snapshot);
    const target = targetFor(model, "home-hero-title");
    assert.equal(target.editable, false, declarations);
    assert.equal(target.readOnlyReason, "ambiguous-owner", declarations);
    for (const command of [{ type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#123456" } },
      { type: "style.reset", property: "color", scopeId: "base" }]) {
      assert.equal((await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, target.targetId, command) })).status, "refused");
      assert.deepEqual(snapshot[file], before);
    }
  }
});

test("escaped declaration names cannot hide standard or custom property owners", async () => {
  for (const declaration of ["c\\6flor: #abcdef;", "\\63 olor: #abcdef;", "\\63olor: #abcdef;"]) {
    const snapshot = snapshotFor();
    const file = "src/styles/site.css";
    snapshot[file] = Buffer.from(Buffer.from(snapshot[file]!).toString().replace("color: #214d4c;", `color: #214d4c; ${declaration}`));
    const model = await modelFor(snapshot);
    const target = targetFor(model, "home-hero-title");
    assert.equal(target.editable, false, declaration);
    const result = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, target.targetId,
      { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#123456" } }) });
    assert.equal(result.status, "refused");
  }
  for (const selector of [":root", ".theme"]) {
    const snapshot = snapshotFor();
    const file = "src/styles/tokens.css";
    snapshot[file] = Buffer.from(Buffer.from(snapshot[file]!).toString() + `\n${selector} { --lab-color-action-\\62 ase: #abcdef; }\n`);
    const model = await modelFor(snapshot);
    assert.equal(model.targets.some((item) => item.kind === "token-definition" && item.tokenName === "--lab-color-action-base" && item.editable), false);
    assert.equal(targetFor(model, "home-primary-cta").editable, false);
  }
});

test("generated source variants preserve every byte outside the owned span and reverse exactly", async (t) => {
  // Bounded, deterministic inputs exercise source bytes rather than a serializer.
  // Each seed runs replacement, insertion, reset and token edits through the public API.
  for (let seed = 0; seed < 32; seed++) {
    await t.test(`seed ${seed}`, async () => {
      const newline = seed & 1 ? "\r\n" : "\n";
      const bom = seed & 2 ? "\uFEFF" : "";
      const spacing = seed & 4 ? "\t" : "  ";
      const property = seed & 8 ? "CoLoR" : "color";
      const prefix = seed & 16 ? "/* 🌠 café é 漢字 */" : "/* preserve these neighbors */";
      for (const mode of ["replace", "insert", "reset", "token"] as const) {
        const snapshot = snapshotFor();
        const file = mode === "token" ? "src/styles/tokens.css" : "src/styles/site.css";
        const originalText = Buffer.from(snapshot[file]!).toString().replace("color: #214d4c;", `${property}:${spacing}#214d4c;`);
        snapshot[file] = Buffer.from(bom + prefix + newline + originalText.replaceAll("\n", newline));
        const before = Object.fromEntries(Object.entries(snapshot).map(([name, bytes]) => [name, Buffer.from(bytes)]));
        const model = await modelFor(snapshot);
        const target = mode === "token" ? model.targets.find((item) => item.kind === "token-definition" && item.tokenName === "--lab-color-action-base") :
          targetFor(model, mode === "insert" ? "home-primary-cta" : "home-hero-title");
        assert(target?.editable);
        const command = mode === "token" ? { type: "token.set", value: { kind: "color", hex: "#123456" } } :
          mode === "reset" ? { type: "style.reset", property: "color", scopeId: "base" } :
            { type: "style.set", property: mode === "insert" ? "background-color" : "color", scopeId: "base", value: { kind: "color", hex: "#123456" } };
        const result = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, target.targetId, command) });
        assert.equal(result.status, "ready", `${mode}, seed ${seed}`);
        if (result.status !== "ready") return;
        const patch = result.proposal.sourcePatch;
        assert.equal(patch.file, file);
        const old = before[file]!;
        const applied = applySourcePatch(old, patch);
        assert.deepEqual(Buffer.from(applied.subarray(0, patch.startByte)), old.subarray(0, patch.startByte));
        assert.deepEqual(Buffer.from(applied.subarray(patch.startByte + Buffer.byteLength(patch.replacementText))), old.subarray(patch.endByte));
        const expected = mode === "replace" ? old.toString().replace(`${property}:${spacing}#214d4c;`, `${property}:${spacing}#123456;`) :
          mode === "reset" ? old.toString().replace(`${property}:${spacing}#214d4c;`, "") :
            mode === "token" ? old.toString().replace("--lab-color-action-base: #146d69;", "--lab-color-action-base: #123456;") :
              old.toString().replace("#home-primary-cta { }", "#home-primary-cta { background-color: #123456; }");
        assert.deepEqual(Buffer.from(applied), Buffer.from(expected), `${mode} changes only its authored declaration`);
        assert.deepEqual(Buffer.from(applySourcePatch(applied, createInversePatch(patch, applied))), old);
        for (const name of files) assert.deepEqual(Buffer.from(snapshot[name]!), before[name], `${name} input is immutable`);
        const updated = { ...snapshot, [file]: applied };
        const updatedModel = await modelFor(updated);
        const updatedTarget = mode === "token" ? updatedModel.targets.find((item) => item.kind === "token-definition" && item.tokenName === "--lab-color-action-base") :
          targetFor(updatedModel, mode === "insert" ? "home-primary-cta" : "home-hero-title");
        assert(updatedTarget?.editable);
        assert.equal((await prepareSourceChange({ snapshot: updated, manifest, model: updatedModel,
          request: requestFor(updatedModel, updatedTarget.targetId, command) })).status, "unchanged");
      }
    });
  }
});

test("a BOM-only source change invalidates the old target even if the revision is reused", async () => {
  const snapshot = snapshotFor();
  const model = await modelFor(snapshot);
  const target = targetFor(model, "home-hero-title");
  snapshot["src/styles/site.css"] = Buffer.concat([Buffer.from("\uFEFF"), snapshot["src/styles/site.css"]!]);
  const result = await prepareSourceChange({ snapshot, manifest, model,
    request: requestFor(model, target.targetId, { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#123456" } }) });
  assert.equal(result.status, "refused");
  if (result.status === "refused") assert.equal(result.error.code, "STALE_REVISION");
});

test("custom property names keep their case-sensitive ownership", async () => {
  const snapshot = snapshotFor();
  const file = "src/styles/tokens.css";
  snapshot[file] = Buffer.from(Buffer.from(snapshot[file]!).toString().replace(":root {", ":root { --LAB-color-action-base: #abcdef;"));
  const model = await modelFor(snapshot);
  const target = model.targets.find((item) => item.kind === "token-definition" && item.tokenName === "--lab-color-action-base");
  assert(target?.editable);
  const result = await prepareSourceChange({ snapshot, manifest, model, request: requestFor(model, target.targetId,
    { type: "token.set", value: { kind: "color", hex: "#123456" } }) });
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.match(Buffer.from(applySourcePatch(snapshot[file]!, result.proposal.sourcePatch)).toString(), /--LAB-color-action-base: #abcdef;/);
});
