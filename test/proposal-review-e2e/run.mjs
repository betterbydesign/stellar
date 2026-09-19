import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const output = join(root, "output/playwright/proposal-review");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const tempData = await mkdtemp(join(tmpdir(), "stellar-proposal-review-"));

async function freePort() {
  const server = createServer();
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveReady);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No isolated test port");
  await new Promise((resolveClose) => server.close(resolveClose));
  return address.port;
}

async function start(optIn) {
  const port = await freePort();
  const log = [];
  const child = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: join(root, "apps/web"), detached: true,
    env: {
      PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", TMPDIR: process.env.TMPDIR ?? tmpdir(),
      LANG: process.env.LANG ?? "en_US.UTF-8", USER: process.env.USER ?? "",
      STELLAR_LOCAL_MODE: "1", STELLAR_PLATFORM_MODE: "0", STELLAR_DATA_DIR: tempData,
      STELLAR_PROPOSAL_REVIEW_DEV: optIn ? "1" : "0", NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => log.push(String(data)));
  child.stderr.on("data", (data) => log.push(String(data)));
  const origin = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Next exited early: ${log.join("").slice(-3000)}`);
      try {
        const response = await fetch(`${origin}/dev/proposal-review`);
        if (response.status === (optIn ? 200 : 404)) return { child, origin, log };
      } catch { /* Wait for only this child process. */ }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    }
    throw new Error(`Next did not serve the expected ${optIn ? 200 : 404} status: ${log.join("").slice(-3000)}`);
  } catch (error) { await stop(child); throw error; }
}

async function stop(child) {
  if (child.exitCode !== null || !child.pid) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch { return; }
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5000)),
  ]);
  if (child.exitCode === null) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already stopped. */ } }
}

let disabled;
let enabled;
let browser;
let context;
let page;
let passed = false;
const errors = [];
try {
  disabled = await start(false);
  assert.equal((await fetch(`${disabled.origin}/dev/proposal-review`)).status, 404, "Harness is hidden without explicit development opt-in");
  await stop(disabled.child);
  disabled = undefined;

  enabled = await start(true);
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: output, size: { width: 1440, height: 1000 } } });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const accountRequests = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/platform")) accountRequests.push(request.url()); });
  await page.goto(`${enabled.origin}/dev/proposal-review`);
  await page.getByRole("heading", { name: "Proposal review harness" }).waitFor();
  await page.getByText("Development only · synthetic data").waitFor();
  await page.getByText("RUNNER_DISCONNECTED", { exact: false }).first().waitFor();
  await page.getByText("Exact prepared command").waitFor();
  await page.getByText("Before", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "01-synthetic-proposal.png"), fullPage: true });

  await page.getByRole("button", { name: "Switch to synthetic viewer" }).click();
  await page.getByText("Your access is read only").waitFor();
  assert.equal(await page.getByRole("button", { name: "Record approval" }).count(), 0, "Viewer cannot decide");
  await page.screenshot({ path: join(output, "02-viewer-read-only.png"), fullPage: true });
  await page.getByRole("button", { name: "Switch to synthetic editor" }).click();
  await page.getByRole("button", { name: "Record approval" }).waitFor();

  await page.getByRole("button", { name: "Simulate one lost decision response" }).click();
  await page.getByRole("button", { name: "Record approval" }).click();
  await page.getByText("The original request is retained", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Retry approve request" }).click();
  await page.getByRole("heading", { name: "Approved for review only" }).waitFor();
  await page.getByRole("button", { name: "Show synthetic decision writes" }).click();
  await page.getByText("Synthetic decision writes: 1").waitFor();
  await page.screenshot({ path: join(output, "03-approval-retried-once.png"), fullPage: true });

  await page.getByRole("button", { name: /synthetic-job-2/ }).click();
  await page.getByRole("button", { name: "Simulate one lost decision response" }).click();
  await page.getByRole("button", { name: "Reject proposal" }).click();
  await page.getByText("The original request is retained", { exact: false }).waitFor();
  await page.reload();
  await page.getByText("Recovered the recorded reject decision", { exact: false }).waitFor();
  await page.getByRole("heading", { name: "Rejected" }).waitFor();
  await page.getByRole("button", { name: "Show synthetic decision writes" }).click();
  await page.getByText("Synthetic decision writes: 2").waitFor();
  await page.screenshot({ path: join(output, "04-rejection-recovered-after-reload.png"), fullPage: true });

  await page.getByRole("button", { name: /synthetic-job-1/ }).click();
  await page.getByRole("button", { name: "Withdraw approval" }).click();
  await page.getByRole("heading", { name: "Cancelled" }).waitFor();
  await page.getByRole("button", { name: /synthetic-job-3/ }).click();
  await page.getByRole("button", { name: "Cancel proposal" }).click();
  await page.getByRole("heading", { name: "Cancelled" }).waitFor();
  await page.getByRole("button", { name: "Show synthetic decision writes" }).click();
  await page.getByText("Synthetic decision writes: 4").waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Cancelled" }).waitFor();
  await page.getByRole("button", { name: "Show synthetic decision writes" }).click();
  await page.getByText("Synthetic decision writes: 4").waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator("html").evaluate((element) => element.scrollWidth <= window.innerWidth), true, "Review fits a narrow viewport");
  await page.screenshot({ path: join(output, "05-cancelled-narrow-reload.png"), fullPage: true });
  assert.deepEqual(errors, [], "No browser script errors");
  assert.deepEqual(accountRequests, [], "Synthetic harness never called account APIs");
  passed = true;
  await writeFile(join(output, "result.json"), JSON.stringify({ passed, labels: ["synthetic only", "no account/provider/source write"], checks: ["opt-in fence", "viewer", "exact review content", "approve duplicate retry", "reject reload recovery", "withdraw approval", "cancel", "narrow viewport"], accountRequests, errors }, null, 2) + "\n");
  console.log(`Synthetic proposal review browser checks passed. Evidence: ${output}`);
} finally {
  if (!passed && page) {
    try {
      await page.screenshot({ path: join(output, "failure.png"), fullPage: true });
      await writeFile(join(output, "failure-page.txt"), (await page.locator("body").innerText()).slice(0, 8000) + "\n");
    } catch { /* Browser may have closed during failure. */ }
  }
  if (context) await context.close();
  if (page?.video()) await rename(await page.video().path(), join(output, "workflow.webm"));
  if (browser) await browser.close();
  if (enabled) await stop(enabled.child);
  if (disabled) await stop(disabled.child);
  await rm(tempData, { recursive: true, force: true });
  if (!passed) await writeFile(join(output, "result.json"), JSON.stringify({ passed, errors }, null, 2) + "\n");
}
