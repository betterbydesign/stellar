import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";
import { chromium } from "playwright";
import { editorApi } from "./api.mjs";
import { evidenceDirectory, sourceIdentity, writeEvidence, assertCleanOutput } from "./evidence.mjs";
import { startRuntime, fingerprint, serveStatic, waitFor } from "./runtime.mjs";

const identity = await sourceIdentity();
const started = Date.now();
const runtime = await startRuntime();
const seedBefore = await fingerprint(runtime.seed);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: evidenceDirectory, size: { width: 1600, height: 1000 } } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("dialog", (dialog) => dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss());
const api = editorApi(context, runtime.appOrigin);
const receipts = [];
const screenshots = [];
const applyToPreviewMs = [];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let staticSite;
let video;
let success = false;
let duplicateClickChecked = false;

async function currentPreview() {
  await page.getByText("Preview current", { exact: true }).waitFor();
}
function frame() { return page.frameLocator("iframe"); }
async function select(anchor) {
  await currentPreview();
  await page.getByRole("button", { name: new RegExp(anchor) }).click();
  await page.getByRole("heading", { name: anchor, exact: true }).waitFor();
}
async function screenshot(name) {
  const file = name + ".png";
  await page.screenshot({ path: join(evidenceDirectory, file), fullPage: false });
  screenshots.push(file);
}
async function applyDraft() {
  await page.getByRole("button", { name: "Review change", exact: true }).click();
  const applyStarted = Date.now();
  const [response] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/changes/apply") && response.request().method() === "POST"),
    duplicateClickChecked
      ? page.getByRole("button", { name: "Apply to source", exact: true }).click()
      : page.getByRole("button", { name: "Apply to source", exact: true }).evaluate((element) => { element.click(); element.click(); }),
  ]);
  duplicateClickChecked = true;
  assert.equal(response.status(), 200);
  const result = await response.json();
  assert.equal(result.status, "applied");
  receipts.push(result.receipt);
  await currentPreview();
  applyToPreviewMs.push(Date.now() - applyStarted);
  return result.receipt;
}
async function expectStyle(anchor, property, expected) {
  await waitFor(async () => {
    try { return await frame().locator("#" + anchor).evaluate((element, key) => getComputedStyle(element).getPropertyValue(key), property) === expected; }
    catch { return false; }
  }, `${anchor} ${property} = ${expected}`);
}
async function matchingOutline(anchor) {
  await waitFor(async () => frame().locator("html").evaluate((html, id) => {
    const target = document.getElementById(id)?.getBoundingClientRect();
    const overlay = [...html.children].find((element) => element.getAttribute("aria-hidden") === "true" && element.style.border.includes("rgb(0, 113, 206)"));
    if (!target || !overlay || overlay.style.display === "none") return false;
    const bounds = overlay.getBoundingClientRect();
    return ["x", "y", "width", "height"].every((key) => Math.abs(bounds[key] - target[key]) < 1);
  }, anchor), "Selection outline matches rendered target");
}
async function width(value) {
  await page.getByRole("spinbutton", { name: "Custom viewport width in pixels" }).fill(String(value));
  await page.getByRole("spinbutton", { name: "Custom viewport width in pixels" }).press("Enter");
  await waitFor(async () => await frame().locator("html").evaluate(() => window.innerWidth) === value, "Exact iframe viewport");
}

try {
  await page.goto(runtime.connectUrl);
  await page.getByRole("link", { name: "Open Stellar" }).waitFor();
  await page.getByRole("link", { name: "Open Stellar" }).click();
  await page.getByRole("link", { name: /Fieldnote Studio style lab A/ }).waitFor();
  await screenshot("projects-dashboard");
  const bBefore = await fingerprint(join(runtime.data, "copies/b"));
  await page.getByRole("link", { name: /Fieldnote Studio style lab B/ }).click();
  await currentPreview();
  await page.getByRole("navigation", { name: "Pages", exact: true }).getByRole("button", { name: /Contact/ }).click();
  await currentPreview();
  await frame().locator("#contact-primary-cta").waitFor();
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  await page.getByRole("heading", { name: "Preview is stopped", exact: true }).waitFor();
  const bPage = join(runtime.data, "copies/b/src/pages/index.astro");
  const bPageSource = await readFile(bPage, "utf8");
  await writeFile(bPage, "---\nconst broken = ;\n---\n");
  await page.getByRole("button", { name: "Retry preview", exact: true }).click();
  await page.getByRole("heading", { name: "Preview needs attention", exact: true }).waitFor();
  await writeFile(bPage, bPageSource);
  await page.getByRole("button", { name: "Retry preview", exact: true }).click();
  await currentPreview();
  await page.getByRole("link", { name: "All projects ↗", exact: true }).click();

  await page.getByRole("link", { name: /Fieldnote Studio style lab A/ }).click();
  await currentPreview();
  const startupMs = Date.now() - started;
  const aOpened = api.checked(await api.request("POST", "/api/projects/project-a/sessions", { protocolVersion: "stellar.editor.v1", projectId: "project-a", requestId: api.id() }));
  let a = api.session("project-a", aOpened.sessionId);
  const sourceBefore = await readFile(join(runtime.data, "copies/a/src/styles/site.css"), "utf8");
  const tokensBefore = await readFile(join(runtime.data, "copies/a/src/styles/tokens.css"), "utf8");
  // Real pointer selection includes the nested source target.
  await frame().locator("#home-hero-accent").click();
  await page.getByRole("heading", { name: "home-hero-accent", exact: true }).waitFor();
  for (const value of [390, 768, 1024, 1440]) {
    await width(value);
    await select("home-primary-cta");
    await matchingOutline("home-primary-cta");
    if (value === 768) {
      await frame().locator("html").evaluate(() => window.scrollTo(0, 180));
      await matchingOutline("home-primary-cta");
      await frame().locator("html").evaluate(() => window.scrollTo(0, 0));
      const targetButton = page.getByRole("button", { name: /home-hero-title/ });
      await targetButton.focus();
      await targetButton.press("Enter");
      await page.getByRole("heading", { name: "home-hero-title", exact: true }).waitFor();
      await select("home-primary-cta");
    }
    await screenshot(`studio-${value}`);
  }
  await page.getByRole("button", { name: "100%", exact: true }).click();
  await select("home-primary-cta");
  await matchingOutline("home-primary-cta");
  await screenshot("studio-100-percent");
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.getByRole("button", { name: /^Inline padding/ }).click();
  await page.getByRole("combobox", { name: /^Value type/ }).selectOption("literal");
  await page.getByRole("spinbutton", { name: "Length", exact: true }).fill("-1");
  const invalidReview = page.getByRole("button", { name: "Review change", exact: true });
  assert.equal(await invalidReview.count() === 0 || !await invalidReview.isEnabled(), true);
  await page.getByRole("spinbutton", { name: "Length", exact: true }).fill("2.25");
  const baseReceipt = await applyDraft();
  await expectStyle("home-primary-cta", "padding-inline-start", "36px");
  await page.getByRole("button", { name: "Mobile ≤767px", exact: true }).click();
  await page.getByRole("button", { name: /^Inline padding/ }).click();
  await page.getByRole("combobox", { name: /^Value type/ }).selectOption("literal");
  await page.getByRole("spinbutton", { name: "Length", exact: true }).fill("1.75");
  await applyDraft();
  await expectStyle("home-primary-cta", "padding-inline-start", "36px");
  await width(390);
  await expectStyle("home-primary-cta", "padding-inline-start", "28px");
  await screenshot("mobile-override-applied");
  await page.getByRole("button", { name: "Reset owned override", exact: true }).click();
  await applyDraft();
  const resetModel = await a.model();
  const resetControl = resetModel.targets.find((target) => target.anchor === "home-primary-cta").controls.find((control) => control.property === "padding-inline" && control.scopeId === "mobile");
  assert.notEqual(resetControl.provenance, "override");
  await page.getByRole("button", { name: "Base", exact: true }).click();
  await page.getByRole("button", { name: /^--lab-color-action-base/ }).click();
  await page.getByText("Routes: home, contact", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Concrete token color", exact: true }).fill("#235b6d");
  const tokenReceipt = await applyDraft();
  await expectStyle("home-primary-cta", "background-color", "rgb(35, 91, 109)");
  // A history POST can reach disk before a 5xx reaches the browser. Keep its
  // original identity through a reload, then reconcile instead of issuing Undo again.
  let undone;
  let undoPosts = 0;
  const lookupRoute = "**/changes/requests/**";
  await page.route(lookupRoute, (route) => route.abort());
  await page.route("**/history", async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    undoPosts++;
    const response = await route.fetch();
    undone = await response.json();
    const command = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { protocolVersion: command.protocolVersion,
      projectId: command.projectId, sessionId: command.sessionId, requestId: command.requestId,
      status: "error", error: { code: "NOT_READY", httpStatus: 503, recoverable: true, message: "The preview is not ready yet." } } });
  });
  await page.getByRole("button", { name: "Undo source change", exact: true }).click();
  await page.getByRole("button", { name: "Check save", exact: true }).waitFor();
  await page.unroute(lookupRoute);
  await page.reload();
  await currentPreview();
  await expectStyle("home-primary-cta", "background-color", "rgb(20, 109, 105)");
  await page.getByRole("button", { name: "Redo source change", exact: true }).waitFor();
  assert.equal(undoPosts, 1, "Reload repeated the original undo");
  await page.unroute("**/history");
  assert.equal(undone.status, "applied");
  assert.equal(undone.receipt.operation, "undo");
  receipts.push(undone.receipt);
  await currentPreview();
  const redoResponse = page.waitForResponse((response) => /\/history(?:\?|$)/.test(response.url()) && response.request().method() === "POST");
  await page.getByRole("button", { name: "Redo source change", exact: true }).click();
  const redone = await (await redoResponse).json();
  assert.equal(redone.status, "applied");
  assert.equal(redone.receipt.operation, "redo");
  receipts.push(redone.receipt);
  await currentPreview();
  await expectStyle("home-primary-cta", "background-color", "rgb(35, 91, 109)");
  await page.getByRole("button", { name: /Contact/ }).click();
  await currentPreview();
  await expectStyle("contact-primary-cta", "background-color", "rgb(35, 91, 109)");
  await screenshot("contact-shared-token");
  for (const value of [390, 768, 1024, 1440]) {
    await width(value);
    await expectStyle("contact-primary-cta", "background-color", "rgb(35, 91, 109)");
  }
  await width(390);
  await page.reload();
  await currentPreview();
  await expectStyle("contact-primary-cta", "background-color", "rgb(35, 91, 109)");
  await runtime.restartRunner();
  await page.reload();
  await currentPreview();
  const reopened = api.checked(await api.request("POST", "/api/projects/project-a/sessions", { protocolVersion: "stellar.editor.v1", projectId: "project-a", requestId: api.id() }));
  a = api.session("project-a", reopened.sessionId);
  assert.notEqual(reopened.sessionId, aOpened.sessionId);
  const history = await a.history();
  assert.equal(history.projectRevision, redone.receipt.newRevision);
  assert.equal(history.canUndo, true);
  assert.equal(history.entries.length, 4);
  await expectStyle("contact-primary-cta", "background-color", "rgb(35, 91, 109)");
  // Draft navigation is explicit, including keyboard focus in the decision dialog.
  const pagesNav = page.getByRole("navigation", { name: "Pages", exact: true });
  await pagesNav.getByRole("button", { name: /Home/ }).click();
  await currentPreview();
  await select("home-primary-cta");
  await page.getByRole("button", { name: /^Inline padding/ }).click();
  await page.getByRole("combobox", { name: /^Value type/ }).selectOption("literal");
  await page.getByRole("spinbutton", { name: "Length", exact: true }).fill("2");
  await pagesNav.getByRole("button", { name: /Contact/ }).click();
  const dialog = page.getByRole("dialog", { name: "Finish this source change?" });
  await dialog.waitFor();
  assert.equal(await dialog.getByRole("button", { name: "Keep editing" }).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press("Tab");
  assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true);
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  assert.equal(await page.getByRole("spinbutton", { name: "Length", exact: true }).inputValue(), "2");
  await page.evaluate(() => window.history.back());
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  assert.equal(new URL(page.url()).pathname, "/projects/project-a/studio");
  assert.equal(await page.getByRole("spinbutton", { name: "Length", exact: true }).inputValue(), "2");
  await page.evaluate(() => window.history.back());
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await page.getByRole("link", { name: /Fieldnote Studio style lab A/ }).waitFor();
  await page.getByRole("link", { name: /Fieldnote Studio style lab A/ }).click();
  await currentPreview();
  await pagesNav.getByRole("button", { name: /Contact/ }).click();
  await currentPreview();
  await pagesNav.getByRole("button", { name: /Home/ }).click();
  await currentPreview();
  await select("home-feature-clarity");
  await page.getByText("This component appears more than once; a single instance has no safe source owner.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Apply to source", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Interact", exact: true }).click();
  await frame().getByRole("link", { name: "Contact", exact: true }).click();
  await frame().locator("#contact-primary-cta").waitFor();
  await currentPreview();
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  await select("contact-primary-cta");
  await frame().locator("#contact-primary-cta").click({ position: { x: 8, y: 8 } });
  await page.getByRole("heading", { name: "contact-primary-cta", exact: true }).waitFor();
  await frame().locator("#contact-primary-cta").press("Escape");
  await page.getByRole("heading", { name: "Select an element", exact: true }).waitFor();
  await pagesNav.getByRole("button", { name: /Home/ }).click();
  await currentPreview();
  // The request reaches disk, but its response and the next iframe load are lost.
  await select("home-hero-title");
  await page.getByRole("button", { name: /^Text color/ }).click();
  await page.getByRole("combobox", { name: /^Value type/ }).selectOption("literal");
  await page.getByRole("textbox", { name: "Hex color", exact: true }).fill("#334455");
  await page.getByRole("button", { name: "Review change", exact: true }).click();
  let lostReceipt;
  const frameRoute = (url) => url.hostname === "localhost";
  await page.route(frameRoute, async (route) => {
    if (route.request().resourceType() === "document") await route.abort();
    else await route.continue();
  });
  await page.route("**/changes/apply", async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    assert.equal(result.status, "applied");
    lostReceipt = result.receipt;
    await route.abort();
  }, { times: 1 });
  await page.getByRole("button", { name: "Apply to source", exact: true }).click();
  await page.getByRole("button", { name: "Check saved result", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Check previous save", exact: true }).click();
  await page.getByText(new RegExp(lostReceipt.receiptId)).waitFor();
  await page.getByText("Preview refresh is pending or unavailable. The source save is retained.", { exact: true }).waitFor();
  await screenshot("saved-source-preview-unavailable");
  assert.equal((await a.history()).entries.length, 5, "Lost response duplicated a write");
  receipts.push(lostReceipt);
  await page.unroute(frameRoute);
  await page.getByRole("button", { name: "Refresh preview", exact: true }).click();
  await currentPreview();
  await expectStyle("home-hero-title", "color", "rgb(51, 68, 85)");
  const [undoLostResponse] = await Promise.all([
    page.waitForResponse((response) => /\/history(?:\?|$)/.test(response.url()) && response.request().method() === "POST"),
    page.getByRole("button", { name: "Undo source change", exact: true }).click(),
  ]);
  const undoLost = await undoLostResponse.json();
  assert.equal(undoLost.status, "applied");
  receipts.push(undoLost.receipt);
  await currentPreview();
  await select("home-primary-cta");
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("studio-narrow-inspector");
  await page.getByRole("button", { name: "Close inspector", exact: true }).click();
  await screenshot("studio-narrow-canvas");
  await page.setViewportSize({ width: 1600, height: 1000 });
  // An observed external source change blocks both a prepared edit and stale undo.
  const staleModel = await a.model();
  const staleTarget = staleModel.targets.find((target) => target.anchor === "home-hero-title");
  const stalePrepared = await a.prepare(staleTarget, { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#667788" } });
  assert.equal(stalePrepared.status, "ready");
  const staleHistory = await a.history();
  const siteFile = join(runtime.data, "copies/a/src/styles/site.css");
  const externalSource = await readFile(siteFile, "utf8") + "\n/* External acceptance edit must be preserved. */\n";
  await writeFile(siteFile, externalSource);
  await waitFor(async () => (await a.model()).projectRevision !== staleModel.projectRevision, "Observe external source change");
  const staleApply = await api.request("POST", a.prefix + "/changes/apply", { ...a.scope(), proposalId: stalePrepared.proposal.proposalId, expectedRevision: staleModel.projectRevision });
  assert.equal(staleApply.status, 409);
  const staleUndo = await api.request("POST", a.prefix + "/history", { ...a.scope(), operation: "undo", entryId: staleHistory.undoEntryId, expectedRevision: staleHistory.projectRevision });
  assert.equal(staleUndo.status, 409);
  assert.equal(await readFile(siteFile, "utf8"), externalSource);
  const finalHistory = await a.history();
  assert.equal(finalHistory.canUndo, false);
  await currentPreview();
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot("studio-narrow-window");
  await page.setViewportSize({ width: 1600, height: 1000 });
  assert.equal(await fingerprint(join(runtime.data, "copies/b")), bBefore, "Project B changed");
  assert.equal(await fingerprint(runtime.seed), seedBefore, "Fixture seed changed");
  const sourceAfter = await readFile(join(runtime.data, "copies/a/src/styles/site.css"), "utf8");
  const tokensAfter = await readFile(join(runtime.data, "copies/a/src/styles/tokens.css"), "utf8");
  await writeEvidence("source-changes.json", { site: { before: sourceBefore, after: sourceAfter }, tokens: { before: tokensBefore, after: tokensAfter }, receipts });
  await runtime.stopServices();
  const output = await runtime.buildEdited();
  await assertCleanOutput(output);
  staticSite = await serveStatic(output);
  await page.goto(staticSite.origin);
  assert.equal(await page.locator("#home-primary-cta").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(35, 91, 109)");
  await screenshot("independent-site-build");
  assert.equal(errors.length, 0, "Browser exceptions: " + errors.join("; "));
  await writeEvidence("result.json", { ...identity, completedAt: new Date().toISOString(), startupMs, applyToPreviewMs, browser: await browser.version(), websiteWidths: [390, 768, 1024, 1440], studioWidths: [1600, 390], screenshots, baseReceipt: baseReceipt.receiptId, tokenReceipt: tokenReceipt.receiptId, finalRevision: finalHistory.projectRevision, historyEntries: finalHistory.entries.length, recoveryChecks: ["invalid input and rapid duplicate Apply", "draft navigation, browser Back and keyboard", "failed compilation and retry", "read-only shared target", "inspect/interact and Escape", "lost apply response across reload", "5xx undo response across reload", "saved source with failed preview", "stale apply and undo"], independentBuild: true, sourceIsolation: true, browserErrors: errors });
  success = true;
  console.log("Editor browser proof passed: responsive canvas, pointer selection, base/mobile/reset/token writes, undo/redo, reopen, isolation and independent build.");
} finally {
  if (!success) {
    await page.screenshot({ path: join(evidenceDirectory, "failure.png") }).catch(() => {});
    await writeEvidence("failure.txt", await page.locator("body").innerText().catch(() => "Page unavailable"));
    await writeEvidence("failure-state.json", {
      receipts,
      tokens: await readFile(join(runtime.data, "copies/a/src/styles/tokens.css"), "utf8").catch(String),
      site: await readFile(join(runtime.data, "copies/a/src/styles/site.css"), "utf8").catch(String),
      frame: await frame().locator("html").evaluate(() => ({ url: window.location.href, action: getComputedStyle(document.documentElement).getPropertyValue("--lab-color-action-base"), sheets: [...document.styleSheets].map((sheet) => ({ href: sheet.href, css: [...sheet.cssRules].map((rule) => rule.cssText).join("\n") })) })).catch(String),
      browserErrors: errors,
    });
  }
  video = page.video();
  await context.close();
  if (video) {
    await video.saveAs(join(evidenceDirectory, success ? "workflow.webm" : "failure.webm"));
    await video.delete();
  }
  await browser.close();
  await staticSite?.close();
  await runtime.close();
}
