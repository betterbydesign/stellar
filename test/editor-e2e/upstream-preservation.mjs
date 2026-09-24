import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { editorApi } from "./api.mjs";
import { assertCleanOutput, sourceIdentity } from "./evidence.mjs";
import { startRuntime, fingerprint, root, waitFor } from "./runtime.mjs";

const evidence = join(root, "docs/evidence/stacki-upstream");
await mkdir(evidence, { recursive: true });
const identity = await sourceIdentity();
const runtime = await startRuntime();
const seedBefore = await fingerprint(runtime.seed);
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(runtime.connectUrl);
  await page.getByRole("link", { name: "Open Stellar" }).click();
  await page.getByRole("link", { name: /Fieldnote Studio style lab A/ }).waitFor();
  const otherBefore = await fingerprint(join(runtime.data, "copies/b"));
  const cssFile = join(runtime.data, "copies/a/src/styles/site.css");
  const initial = await readFile(cssFile, "utf8");
  const authored = "\uFEFF/* 🌠 café source preservation */\r\n" + initial
    .replace("#home-hero-title { color: #214d4c; }", "#home-hero-title { CoLoR:\t#214d4c; }").replaceAll("\n", "\r\n");
  await writeFile(cssFile, authored);
  await page.getByRole("link", { name: /Fieldnote Studio style lab A/ }).click();
  const current = () => page.getByText("Preview current", { exact: true }).waitFor();
  await current();
  await page.getByRole("button", { name: /home-hero-title/ }).click();
  await page.getByRole("heading", { name: "home-hero-title", exact: true }).waitFor();
  await page.getByRole("button", { name: /^Text color/ }).click();
  await page.getByRole("textbox", { name: "Hex color", exact: true }).fill("#123456");
  await page.getByRole("button", { name: "Review change", exact: true }).click();
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/changes/apply") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Apply to source", exact: true }).click(),
  ]);
  assert.equal(response.status(), 200);
  const applied = await response.json();
  assert.equal(applied.status, "applied");
  await current();
  const renderedColor = () => page.frameLocator("iframe").locator("#home-hero-title").evaluate((element) => getComputedStyle(element).color);
  await waitFor(async () => await renderedColor() === "rgb(18, 52, 86)", "Saved mixed-case declaration reaches preview");
  const saved = await readFile(cssFile);
  assert.deepEqual(saved, Buffer.from(authored.replace("CoLoR:\t#214d4c;", "CoLoR:\t#123456;")));
  // Computed inspector values are observations from selection; collect one
  // from the new frame before capturing the saved state.
  await page.getByRole("button", { name: /home-hero-title/ }).click();
  await page.getByText("rgb(18, 52, 86)", { exact: true }).waitFor();
  await page.screenshot({ path: join(evidence, "source-preservation.png") });
  await page.getByRole("button", { name: "Undo source change", exact: true }).click();
  await current();
  await waitFor(async () => (await readFile(cssFile)).equals(Buffer.from(authored)), "Undo restores every original source byte");
  await waitFor(async () => await renderedColor() === "rgb(33, 77, 76)", "Undo reaches preview");
  await page.getByRole("button", { name: "Redo source change", exact: true }).click();
  await current();
  await waitFor(async () => (await readFile(cssFile)).equals(saved), "Redo restores saved source bytes");
  await waitFor(async () => await renderedColor() === "rgb(18, 52, 86)", "Redo reaches preview");

  // External source introduces a second casing of the same owned property.
  // Verify the authoritative source model and prepare boundary refuse it.
  await writeFile(cssFile, saved.toString().replace("CoLoR:\t#123456;", "CoLoR:\t#123456; COLOR: #abcdef;"));
  const api = editorApi(context, runtime.appOrigin);
  const opened = api.checked(await api.request("POST", "/api/projects/project-a/sessions", {
    protocolVersion: "stellar.editor.v1", projectId: "project-a", requestId: api.id(),
  }));
  const session = api.session("project-a", opened.sessionId);
  const model = await session.model();
  const duplicate = model.targets.find((target) => target.anchor === "home-hero-title");
  assert.equal(duplicate.editable, false);
  assert.equal(duplicate.readOnlyReason, "ambiguous-owner");
  const refused = await session.prepare(duplicate, { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#654321" } });
  assert.equal(refused.status, "refused");
  await writeFile(cssFile, saved);
  await runtime.stopServices();
  const built = await runtime.buildEdited();
  await assertCleanOutput(built);
  assert.equal(await fingerprint(runtime.seed), seedBefore);
  assert.equal(await fingerprint(join(runtime.data, "copies/b")), otherBefore);
  assert.deepEqual(errors, []);
  await writeFile(join(evidence, "browser-result.json"), JSON.stringify({ ...identity, status: "passed",
    checks: ["BOM and CRLF source with Unicode comment and mixed-case declaration saved through UI", "computed preview color matched source",
      "exact-byte undo and redo", "mixed-case duplicate owner refused", "independent edited-site build contains no editor instrumentation",
      "fixture seed and other project unchanged", "no page errors"],
  }, null, 2) + "\n");
  console.log("Source preservation browser acceptance passed: save, preview, undo/redo, duplicate refusal, independent build, isolated data.");
} finally {
  await browser?.close();
  await runtime.close();
}
