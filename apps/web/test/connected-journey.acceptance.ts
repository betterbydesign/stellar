import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { build } from "esbuild";
import { chromium } from "playwright";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { connectedHttp } from "../lib/connected/http";
import type { ConnectedConfig } from "../lib/connected/config";
import { platformHttp, type PlatformBackend } from "../lib/platform/http";
import { Runner, type RunnerConfig } from "../../runner/src/server";

const repo = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const modules = import.meta.glob("../convex/**/*.*s");
const clientId = "client_connected_journey";
const actorSubject = "user_connected_journey";
const signingSecret = "connected-journey-proof-secret-32-bytes";
const operatorId = "operator-connected-journey";
const syntheticSession = { identity: { subject: actorSubject, organizationId: null, email: "offline@example.invalid",
  firstName: "Offline", lastName: "Proof" }, accessToken: "synthetic-offline-token" };

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function requestFromNode(request: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else if (value !== undefined) headers.set(key, value);
  }
  const method = request.method ?? "GET";
  return new Request(`${origin}${request.url ?? "/"}`, { method, headers,
    ...(["GET", "HEAD"].includes(method) ? {} : { body: Buffer.concat(chunks) }) });
}

async function sendResponse(reply: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  reply.writeHead(response.status, headers);
  reply.end(Buffer.from(await response.arrayBuffer()));
}

async function buildStaticSite(projectRoot: string, temporary: string): Promise<string> {
  const astro = path.join(repo, "fixtures/astro-style-lab/node_modules/astro/bin/astro.mjs");
  const child = spawn(process.execPath, [astro, "build"], {
    cwd: projectRoot,
    env: { PATH: path.dirname(process.execPath), HOME: temporary, TMPDIR: os.tmpdir(), NODE_ENV: "production", ASTRO_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = (output + String(chunk)).slice(-12_000); });
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  if (code !== 0) throw new Error(`Independent edited build failed: ${output}`);
  return path.join(projectRoot, "dist");
}

async function serveStatic(directory: string): Promise<{ origin: string; close(): Promise<void> }> {
  const canonical = await realpath(directory);
  const server = createHttpServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      const candidate = path.resolve(canonical, `.${pathname}${pathname.endsWith("/") ? "index.html" : ""}`);
      const file = await realpath(candidate);
      if (!file.startsWith(`${canonical}${path.sep}`)) { response.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      const type = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream";
      response.writeHead(200, { "content-type": type }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

beforeEach(() => {
  process.env.WORKOS_CLIENT_ID = clientId;
  process.env.STELLAR_CONNECTION_SECRET = signingSecret;
});
afterEach(() => {
  delete process.env.WORKOS_CLIENT_ID;
  delete process.env.STELLAR_CONNECTION_SECRET;
});

test("offline browser proves first-use connect, provision, edit, reconnect, reopen, build and metadata recovery", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "stellar-connected-journey-"));
  const output = path.join(repo, "output/playwright/connected-journey");
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  const bundle = path.join(temporary, "bundle");
  await build({ entryPoints: [path.join(repo, "test/connected-e2e/app.tsx")], outdir: bundle, bundle: true,
    format: "esm", platform: "browser", jsx: "automatic", sourcemap: false, loader: { ".css": "local-css" },
    plugins: [{ name: "next-test-alias", setup(buildApi) {
      buildApi.onLoad({ filter: /\/app\/globals\.css$/ }, async (args) => ({ contents: await readFile(args.path, "utf8"), loader: "css" }));
      buildApi.onResolve({ filter: /^next\/link$/ }, () => ({ path: path.join(repo, "test/connected-e2e/next-link.tsx") }));
      buildApi.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: path.join(repo, "test/connected-e2e/next-navigation.ts") }));
    } }] });

  const convex = convexTest(schema, modules);
  const identity = { subject: actorSubject, issuer: "https://api.workos.com/" };
  const actor = convex.withIdentity(identity);
  assert.equal(await convex.run(async (ctx) => (await ctx.db.query("tenants").collect()).length), 0,
    "Acceptance actor unexpectedly started with a workspace");

  const appPort = await freePort(); const runnerPort = await freePort();
  const appOrigin = `http://127.0.0.1:${appPort}`;
  const nonce = randomBytes(32).toString("base64url");
  const runnerSecret = randomBytes(48).toString("base64url");
  const data = path.join(temporary, "state");
  const runnerConfig: RunnerConfig = { seed: path.join(repo, "fixtures/astro-style-lab"), data,
    url: new URL(`http://127.0.0.1:${runnerPort}/`), secret: runnerSecret, operatorId,
    appOrigin, previewHost: "localhost" };
  let runner = new Runner(runnerConfig); await runner.initialize();
  let runnerStarted = true;
  const connectedConfig: ConnectedConfig = { appOrigin, appHost: `127.0.0.1:${appPort}`,
    runnerUrl: `http://127.0.0.1:${runnerPort}`, runnerSecret, bootstrapNonce: nonce, operatorId,
    previewHost: "localhost", convexUrl: "https://offline.invalid", identityNamespace: clientId, signingSecret };

  const rawActor = actor as unknown as {
    query(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
    mutation(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
    action(reference: unknown, args: Record<string, unknown>): Promise<unknown>;
  };
  const backendCall = async (kind: "query" | "mutation" | "action", name: string, args: Record<string, unknown>) => {
    const references: Record<string, unknown> = {
      "connected:connectionContext": api.connected.connectionContext,
      "connected:connectionStatus": api.connected.connectionStatus,
      "connected:beginPairing": api.connected.beginPairing,
      "connected:revokeConnection": api.connected.revokeConnection,
      "connected:getProjectConnection": api.connected.getProjectConnection,
      "connected:beginProvisioning": api.connected.beginProvisioning,
      "connected:authorizeRegistry": api.connected.authorizeRegistry,
      "platform:createProject": api.platform.createProject,
      "platform:getProject": api.platform.getProject,
      "connectionProof:confirmPairing": api.connectionProof.confirmPairing,
      "connectionProof:acknowledgeProvisioning": api.connectionProof.acknowledgeProvisioning,
    };
    const reference = references[name]; if (!reference) throw new Error(`Unknown offline backend call ${name}`);
    return kind === "query" ? rawActor.query(reference, args) : kind === "mutation" ? rawActor.mutation(reference, args) : rawActor.action(reference, args);
  };
  const platformBackend: PlatformBackend = {
    viewer: async () => actor.query(api.platform.viewer, {}),
    bootstrap: async () => actor.mutation(api.platform.bootstrapWorkspace, {}),
    list: async (_token, cursor) => actor.query(api.platform.listProjects, { paginationOpts: { numItems: 20, cursor } }),
    create: async (_token, input) => actor.mutation(api.platform.createProject, input),
    project: async (_token, projectId) => actor.query(api.platform.getProject, { projectId: projectId as Id<"projects"> }),
    runner: async (_token, projectId) => actor.mutation(api.platform.requestRunnerCommand, { projectId: projectId as Id<"projects"> }),
    proposals: async (_token, projectId, cursor) => actor.query(api.proposals.list, { projectId: projectId as Id<"projects">, paginationOpts: { numItems: 20, cursor } }),
    proposal: async () => { throw new Error("Unused proposal detail"); },
    decideProposal: async () => { throw new Error("Unused proposal decision"); },
    submitProposal: async () => { throw new Error("Unused proposal submission"); },
  };
  const runnerCall = async (method: string, params: Record<string, unknown>) => {
    const value = await runner.dispatch(method, params, operatorId);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RUNNER_DISCONNECTED");
    const result = value as Record<string, unknown>;
    if (result.error) throw new Error((result.error as { code?: string }).code ?? "RUNNER_DISCONNECTED");
    return result;
  };
  const appJs = await readFile(path.join(bundle, "app.js"));
  const appCss = await readFile(path.join(bundle, "app.css"));
  const html = Buffer.from("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><link rel=stylesheet href=/app.css><title>Stellar offline acceptance</title></head><body><div id=root></div><script type=module src=/app.js></script></body></html>");
  const server = createHttpServer(async (incoming, reply) => {
    try {
      const pathname = new URL(incoming.url ?? "/", appOrigin).pathname;
      if (pathname === "/app.js") { reply.writeHead(200, { "content-type": "text/javascript" }).end(appJs); return; }
      if (pathname === "/app.css") { reply.writeHead(200, { "content-type": "text/css" }).end(appCss); return; }
      if (pathname.startsWith("/api/platform")) {
        const request = await requestFromNode(incoming, appOrigin);
        const segments = pathname.slice("/api/platform".length).split("/").filter(Boolean);
        await sendResponse(reply, await platformHttp(request, segments, { appOrigin, session: async () => ({ accessToken: syntheticSession.accessToken }),
          backend: platformBackend, errorCode: (error) => error && typeof error === "object" && "data" in error &&
            (error as { data?: { code?: unknown } }).data && typeof (error as { data: { code?: unknown } }).data.code === "string"
            ? (error as { data: { code: string } }).data.code : null })); return;
      }
      if (pathname.startsWith("/api/connected")) {
        const request = await requestFromNode(incoming, appOrigin);
        const segments = pathname.slice("/api/connected".length).split("/").filter(Boolean);
        await sendResponse(reply, await connectedHttp(request, segments, { config: connectedConfig,
          session: async () => syntheticSession, backend: () => backendCall, runner: runnerCall })); return;
      }
      reply.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html);
    } catch (failure) { reply.writeHead(500, { "content-type": "text/plain" }).end(failure instanceof Error ? failure.message : "failure"); }
  });
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(appPort, "127.0.0.1", resolve));

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage(); page.setDefaultTimeout(25_000);
  const browserErrors: string[] = []; page.on("pageerror", (error) => browserErrors.push(error.message));
  const screenshots: string[] = [];
  const shot = async (name: string) => { const file = `${name}.png`; await page.screenshot({ path: path.join(output, file), fullPage: false }); screenshots.push(file); };
  let createdAccountProjectId = ""; let registryProjectId = ""; let sourceFile = "";
  let staticSite: Awaited<ReturnType<typeof serveStatic>> | null = null;
  const startedAt = Date.now();
  try {
    await page.goto(`${appOrigin}/platform/setup#${nonce}`);
    await page.waitForTimeout(1_000);
    if (!await page.getByRole("button", { name: "Connect this computer" }).count()) {
      throw new Error(`Connection setup did not render: ${await page.locator("body").innerText()} | ${browserErrors.join("; ")}`);
    }
    await page.getByRole("button", { name: "Connect this computer" }).click();
    await page.getByRole("heading", { name: "Connect these two" }).waitFor();
    await page.getByRole("button", { name: "Confirm connection" }).click();
    await page.getByText("This computer is connected. You can prepare a website from your account.").waitFor();
    assert.equal(await convex.run(async (ctx) => (await ctx.db.query("tenants").collect()).length), 1,
      "ConnectionSetup did not bootstrap the brand-new personal workspace");
    await shot("01-connected-computer");
    const metadataOnly = await actor.mutation(api.platform.createProject, { name: "Test", requestId: "create-existing-test" });

    await page.goto(`${appOrigin}/platform#new-website`);
    await page.getByLabel("Website name").fill("Browser Journey");
    const preparationStarted = Date.now();
    await page.getByRole("button", { name: "Prepare website" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/\/platform\/projects\/[A-Za-z0-9_-]+\/studio$/);
    createdAccountProjectId = new URL(page.url()).pathname.split("/")[3]!;
    await page.getByText("Preview current", { exact: true }).waitFor();
    const createToEditMs = Date.now() - preparationStarted;
    const bindingState = await actor.query(api.connected.getProjectConnection, { projectId: createdAccountProjectId as Id<"projects"> });
    assert.ok(bindingState.binding); registryProjectId = bindingState.binding.registryProjectId;
    sourceFile = path.join(runner.registry.get(registryProjectId)!.root, "src/styles/site.css");
    const sourceBefore = await readFile(sourceFile, "utf8");
    await shot("02-created-in-studio");

    await page.getByRole("button", { name: /home-primary-cta/ }).click();
    await page.getByRole("button", { name: /^Inline padding/ }).click();
    await page.getByRole("combobox", { name: /^Value type/ }).selectOption("literal");
    await page.getByRole("spinbutton", { name: "Length", exact: true }).fill("2.25");
    await page.getByRole("button", { name: "Review change" }).click();
    const saveStarted = Date.now();
    const applyResponse = page.waitForResponse((response) => response.url().includes("/changes/apply") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Apply to source" }).click();
    const applied = await applyResponse; assert.equal(applied.status(), 200);
    assert.equal((await applied.json() as { status?: string }).status, "applied");
    await expect.poll(async () => await readFile(sourceFile, "utf8")).toMatch(/2\.25rem/);
    await page.getByText("Preview current", { exact: true }).waitFor();
    const saveToPreviewMs = Date.now() - saveStarted;
    const sourceAfter = await readFile(sourceFile, "utf8");
    assert.notEqual(sourceAfter, sourceBefore); assert.match(sourceAfter, /2\.25rem/);
    await shot("03-guarded-edit-saved");

    await runner.shutdown(); runnerStarted = false; runner = new Runner(runnerConfig); await runner.initialize(); runnerStarted = true;
    await page.reload(); await page.getByText("Preview current", { exact: true }).waitFor();
    assert.equal(await readFile(sourceFile, "utf8"), sourceAfter);
    await page.getByRole("link", { name: "All projects ↗", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/platform");
    await page.getByRole("link", { name: /Browser Journey/ }).click();
    await page.getByRole("link", { name: "Open Studio" }).click();
    await page.getByText("Preview current", { exact: true }).waitFor();
    await shot("04-reopened-after-runner-restart");

    await page.goto(`${appOrigin}/platform/setup`);
    await page.getByText("Connected", { exact: true }).waitFor();
    const operatorCookie = (await context.cookies(appOrigin)).find((cookie) => cookie.name === "stellar_operator");
    assert.ok(operatorCookie?.value, "Connected journey did not retain the signed local operator cookie");
    await page.getByRole("button", { name: "Disconnect this computer" }).click();
    await page.getByText("This account is disconnected from the computer. Website files remain on the computer, and this verified setup tab can reconnect them.").waitFor();
    await page.getByRole("button", { name: "Connect this computer" }).click();
    await page.getByRole("heading", { name: "Connect these two" }).waitFor();
    await page.getByRole("button", { name: "Confirm connection" }).click();
    await page.getByText("This computer is connected. You can prepare a website from your account.").waitFor();
    assert.equal((await context.cookies(appOrigin)).find((cookie) => cookie.name === "stellar_operator")?.value, operatorCookie.value,
      "Reconnect unexpectedly replaced the still-valid operator cookie");
    await page.getByRole("link", { name: "Prepare a website" }).click();
    await page.getByRole("link", { name: /Browser Journey/ }).click();
    await page.getByRole("link", { name: "Open Studio" }).click();
    await page.getByText("Preview current", { exact: true }).waitFor();
    assert.equal(await readFile(sourceFile, "utf8"), sourceAfter);
    await shot("05-reconnected-and-reopened-same-source");

    await page.goto(`${appOrigin}/platform/projects/${metadataOnly._id}`);
    await page.getByRole("heading", { name: "Prepare Test" }).waitFor();
    await page.route("**/api/connected/websites", async (route) => { await route.fetch(); await route.abort(); }, { times: 1 });
    await page.getByRole("button", { name: "Finish website setup" }).click();
    await page.getByRole("button", { name: "Retry website preparation" }).waitFor();
    await page.getByRole("button", { name: "Retry website preparation" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/platform/projects/${metadataOnly._id}/studio`);
    await page.getByText("Preview current", { exact: true }).waitFor();
    const recovered = await actor.query(api.connected.getProjectConnection, { projectId: metadataOnly._id });
    assert.equal(recovered.context.projectId, metadataOnly._id); assert.equal(recovered.context.sourceState, "ready");
    assert.notEqual(recovered.binding?.registryProjectId, registryProjectId);
    await shot("06-existing-test-finished-after-lost-response");

    await runner.shutdown(); runnerStarted = false;
    const dist = await buildStaticSite(runner.registry.get(registryProjectId)!.root, temporary);
    staticSite = await serveStatic(dist);
    await page.goto(staticSite.origin);
    await page.locator("#home-primary-cta").waitFor();
    assert.equal(await page.locator("#home-primary-cta").evaluate((element) => getComputedStyle(element).paddingInlineStart), "36px");
    await shot("07-independent-edited-site-build");

    assert.deepEqual(browserErrors, []);
    await writeFile(path.join(output, "result.json"), JSON.stringify({ evidence: "offline synthetic WorkOS identity with real convex-test functions, connected HTTP handlers, runner source and Chromium",
      completedAt: new Date().toISOString(), totalMs: Date.now() - startedAt, createToEditMs, saveToPreviewMs,
      accountProjectId: createdAccountProjectId, registryProjectId, existingProjectId: String(metadataOnly._id),
      workspaceBootstrappedByConnectionSetup: true, sourcePersistedAcrossRunnerRestart: true,
      reconnectedWithSameOperatorCookie: true, sourceReopenedAfterReconnect: true,
      independentEditedBuild: true, lostProvisioningResponseRecovered: true, screenshots }, null, 2));
  } finally {
    await context.close(); await browser.close(); await staticSite?.close();
    if (runnerStarted) await runner.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(temporary, { recursive: true, force: true });
  }
});
