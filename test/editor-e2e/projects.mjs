import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";
import { chromium } from "playwright";
import { editorApi } from "./api.mjs";
import { sourceIdentity, assertCleanOutput } from "./evidence.mjs";
import { root, startRuntime, fingerprint, serveStatic, waitFor } from "./runtime.mjs";

const output = join(root, "output/playwright/m1-projects");
await mkdir(output, { recursive: true });
const identity = await sourceIdentity();
const runtime = await startRuntime();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: output, size: { width: 1600, height: 1000 } } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
const api = editorApi(context, runtime.appOrigin);
const errors = [];
const timings = [];
const collectTimings = async () => {
  timings.push(...await page.evaluate(() => window.performance.getEntriesByType("measure").filter((item) => item.name.startsWith("stellar.")).map(({ name, duration }) => ({ name, durationMs: Math.round(duration) }))));
};
page.on("pageerror", (error) => errors.push(error.message));
const shot = (name) => page.screenshot({ path: join(output, name + ".png") });
const frame = () => page.frameLocator("iframe");
const preview = () => page.getByText("Preview current", { exact: true }).waitFor();
async function style(expected) {
  await waitFor(async () => {
    try { return await frame().locator("#home-primary-cta").evaluate((el) => getComputedStyle(el).backgroundColor) === expected; } catch { return false; }
  }, "Saved token rendered");
}
async function openHistory(projectId) {
  const opened = api.checked(await api.request("POST", `/api/projects/${projectId}/sessions`, { protocolVersion: "stellar.editor.v1", projectId, requestId: api.id() }));
  return api.session(projectId, opened.sessionId).history();
}
let site;
let passed = false;
try {
  await page.goto(runtime.appOrigin + "/platform/setup");
  await page.getByRole("heading", { name: "Account connection is not available yet" }).waitFor();
  await shot("account-setup-prerequisite");
  await page.goto(runtime.connectUrl);
  await page.getByRole("link", { name: "Open Stellar" }).click();
  await page.getByRole("link", { name: /Fieldnote Studio style lab A/ }).waitFor();
  const legacyBefore = { a: await fingerprint(join(runtime.data, "copies/a")), b: await fingerprint(join(runtime.data, "copies/b")) };
  const seedBefore = await fingerprint(runtime.seed);
  await shot("reviewed-blueprint-catalog");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("projects-narrow");
  assert.equal(await page.locator("html").evaluate((el) => el.scrollWidth <= window.innerWidth), true, "Projects must fit the narrow viewport");
  await page.setViewportSize({ width: 1600, height: 1000 });
  const create = async (name) => {
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill(name);
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/projects" && r.request().method() === "POST");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    const result = await (await response).json();
    assert.ok(result.workspace, JSON.stringify(result));
    await preview();
    return result.workspace.project.id;
  };
  // A denied recovery store must prevent sending any creation request.
  let creationRequests = 0;
  const countCreation = (request) => {
    if (new URL(request.url()).pathname === "/api/projects" && request.method() === "POST") creationRequests++;
  };
  page.on("request", countCreation);
  await page.evaluate(() => {
    const original = window.Storage.prototype.setItem;
    window.restoreCreationStorage = () => { window.Storage.prototype.setItem = original; };
    window.Storage.prototype.setItem = function(key, value) {
      if (key === "stellar.pending-project-create") throw new Error("Storage blocked for acceptance");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill("North garden");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await page.getByText("Allow browser session storage, then retry. No creation request was sent.").waitFor();
  assert.equal(creationRequests, 0);
  await page.evaluate(() => { window.restoreCreationStorage(); delete window.restoreCreationStorage; });
  await page.getByRole("button", { name: "Retry creation", exact: true }).click();
  await preview();
  const first = new URL(page.url()).pathname.split("/")[2];
  assert.equal(creationRequests, 1);
  page.off("request", countCreation);
  await shot("named-project-studio");
  await page.getByRole("button", { name: /home-primary-cta/ }).click();
  await page.getByRole("button", { name: /^--lab-color-action-base/ }).click();
  await page.getByRole("textbox", { name: "Concrete token color", exact: true }).fill("#235b6d");
  await page.getByRole("button", { name: "Review change", exact: true }).click();
  await page.getByRole("button", { name: "Apply to source", exact: true }).click();
  await preview();
  await style("rgb(35, 91, 109)");
  for (const width of [390, 768, 1440]) {
    const input = page.getByRole("spinbutton", { name: "Custom viewport width in pixels" });
    await input.fill(String(width)); await input.press("Enter");
    await waitFor(async () => await frame().locator("html").evaluate(() => window.innerWidth) === width, "Responsive preview width");
    await style("rgb(35, 91, 109)");
    await shot(`named-project-${width}`);
  }
  await collectTimings();
  await page.reload(); await preview(); await style("rgb(35, 91, 109)");
  const firstHistory = await openHistory(first);
  assert.equal(firstHistory.entries.length, 1);
  await page.goto(runtime.appOrigin + "/projects");
  const second = await create("South garden");
  assert.notEqual(first, second);
  await style("rgb(20, 109, 105)");
  await collectTimings();
  assert.equal((await openHistory(second)).entries.length, 0);
  await page.goto(runtime.appOrigin + "/projects");
  // Lose a successful response, then reload and retry the persisted request.
  let uncertain;
  const loseCreationResponse = async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); uncertain = await response.json(); await route.abort();
  };
  // Background catalog reads must not consume the lost-POST interception.
  await page.route("**/api/projects?*", loseCreationResponse);
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Retry garden");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await waitFor(async () => Boolean(uncertain), "Creation reached registry");
  await page.getByRole("button", { name: "Retry creation", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Project name", exact: true }).isDisabled(), true, "Unresolved creation must retain its original name");
  assert.equal(await page.getByRole("radio").first().isDisabled(), true, "Unresolved creation must retain its template");
  await page.evaluate(() => {
    const original = window.Storage.prototype.setItem;
    window.restoreCreationStorage = () => { window.Storage.prototype.setItem = original; };
    window.Storage.prototype.setItem = function(key, value) {
      if (key === "stellar.pending-project-create") throw new Error("Storage blocked for acceptance");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Retry creation", exact: true }).click();
  await page.getByText("Allow browser session storage, then retry. No creation request was sent.").waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Project name", exact: true }).isDisabled(), true, "Storage failure during recovery must not unlock an already-sent intent");
  await page.evaluate(() => { window.restoreCreationStorage(); delete window.restoreCreationStorage; });
  await page.unroute("**/api/projects?*", loseCreationResponse);
  await page.reload();
  await page.getByRole("button", { name: /Retry|Check creation/ }).click();
  await preview();
  assert.equal(new URL(page.url()).pathname, `/projects/${uncertain.workspace.project.id}/studio`);
  assert.equal((await api.list()).projects.length, 5);
  await collectTimings();
  assert.ok(timings.some((sample) => sample.name === "stellar.create-to-edit"));
  assert.ok(timings.some((sample) => sample.name === "stellar.acknowledged-save-to-preview"));
  assert.ok(timings.some((sample) => sample.name === "stellar.creation-recovery-to-edit"));
  await runtime.restartRunner();
  await page.goto(runtime.appOrigin + "/projects");
  await page.getByRole("link", { name: /North garden/ }).click();
  await preview(); await style("rgb(35, 91, 109)");
  assert.equal((await openHistory(first)).entries.length, 1);
  await shot("reopened-after-runner-restart");
  await page.goto(runtime.appOrigin + "/projects");
  await page.getByRole("link", { name: /Fieldnote Studio style lab A/ }).click();
  await preview(); await style("rgb(20, 109, 105)");
  await shot("legacy-project-retained");
  assert.equal(await fingerprint(join(runtime.data, "copies/a")), legacyBefore.a);
  assert.equal(await fingerprint(join(runtime.data, "copies/b")), legacyBefore.b);
  assert.equal(await fingerprint(runtime.seed), seedBefore);
  const registry = JSON.parse(await readFile(join(runtime.data, "registry.json"), "utf8"));
  const entry = registry.entries.find((item) => item.id === first);
  await runtime.stopServices();
  const built = await runtime.buildEdited(entry.directory);
  await assertCleanOutput(built);
  site = await serveStatic(built);
  await page.goto(site.origin);
  assert.equal(await page.locator("#home-primary-cta").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(35, 91, 109)");
  await shot("independent-named-project-build");
  assert.deepEqual(errors, []);
  await writeFile(join(output, "result.json"), JSON.stringify({ ...identity, completedAt: new Date().toISOString(), first, second,
    legacyPreserved: true, seedPreserved: true, independentHistory: true, restartPersistence: true, lostCreationResponseReconciled: true,
    timings, timingEvidence: "Single local samples, not p95 or live account proof", responsiveWidths: [390, 768, 1440], independentBuild: true, browserErrors: errors }, null, 2) + "\n");
  passed = true;
  console.log("Named project browser proof passed: create, edit, responsive preview, independent history, reload/restart, lost response retry, legacy preservation and independent build.");
} finally {
  if (!passed) {
    await shot("failure").catch(() => {});
    await writeFile(join(output, "failure.txt"), await page.locator("body").innerText().catch(String));
  }
  const video = page.video();
  await context.close();
  if (video) { await video.saveAs(join(output, passed ? "workflow.webm" : "failure.webm")); await video.delete(); }
  await browser.close(); await site?.close(); await runtime.close();
}
