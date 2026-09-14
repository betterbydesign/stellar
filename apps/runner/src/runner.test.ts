import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { PROTOCOL_VERSION, type Session } from "@stellar/contracts";
import { freePort } from "./preview.js";
import { Registry } from "./registry.js";
import { Runner, createRunnerServer } from "./server.js";
import { WorkspaceRuntime } from "./workspace.js";

const root = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const seed = process.env.STELLAR_TEST_SEED ?? path.join(root, "fixtures/astro-style-lab");
const locations: string[] = [];
after(async () => { await Promise.all(locations.map((location) => rm(location, { recursive: true, force: true }))); });
async function dataDir(): Promise<string> { const location = await mkdtemp(path.join(os.tmpdir(), "stellar-runner-test-")); locations.push(location); return location; }
const request = (projectId: string, requestId: string) => ({ protocolVersion: PROTOCOL_VERSION, projectId, requestId });
async function waitReady(runtime: WorkspaceRuntime, session: Session): Promise<Session> {
  const deadline = Date.now() + 22_000;
  while (Date.now() < deadline) {
    const state = runtime.getSession({ projectId: session.projectId, sessionId: session.id, requestId: "poll" });
    if (!("error" in state) && state.state !== "starting") return state;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Preview did not settle");
}
async function workspace(data: string): Promise<{ registry: Registry; runtime: WorkspaceRuntime }> {
  const registry = new Registry(seed, data);
  await registry.initialize();
  await registry.validateExecutableFiles(registry.get("project-a")!);
  const runtime = new WorkspaceRuntime(registry.get("project-a")!, seed, data, "operator-stable");
  await runtime.initialize();
  return { registry, runtime };
}

test("two independent copies preserve seed and reject source symlink escape", async () => {
  const data = await dataDir();
  const registry = new Registry(seed, data);
  await registry.initialize();
  const a = registry.get("project-a")!;
  const b = registry.get("project-b")!;
  assert.notEqual(await realpath(a.root), await realpath(b.root));
  const seedCss = await readFile(path.join(seed, "src/styles/site.css"));
  const aCss = path.join(a.root, "src/styles/site.css");
  await rm(aCss);
  await symlink(path.join(b.root, "src/styles/site.css"), aCss);
  const runtime = new WorkspaceRuntime(a, seed, data, "operator-stable");
  await assert.rejects(runtime.initialize(), /Symlinked source/);
  assert.deepEqual(await readFile(path.join(seed, "src/styles/site.css")), seedCss);
});

test("manifest byte drift rotates revision but refuses cached edit rules", async () => {
  const data = await dataDir();
  const { registry, runtime } = await workspace(data);
  const before = runtime.currentRevision();
  const manifest = path.join(registry.get("project-a")!.root, ".stellar/project.json");
  const original = await readFile(manifest, "utf8");
  await writeFile(manifest, `${original}\n`);
  const whitespace = await runtime.open(request("project-a", "manifest-open"));
  assert.ok(!("error" in whitespace));
  assert.notEqual(runtime.currentRevision(), before);
  await writeFile(manifest, original.replace('"name": "Fieldnote Studio style lab"', '"name": "Changed fixture"'));
  await assert.rejects(runtime.open(request("project-a", "manifest-drift")), /Fixture manifest changed/);
  await writeFile(manifest, original);
  await runtime.shutdown();
});

test("real Astro readiness, duplicate open, locked-down /@fs/, close and generation rotation", async (t) => {
  const data = await dataDir();
  const { runtime } = await workspace(data);
  t.after(() => runtime.shutdown());
  const opened = await runtime.open(request("project-a", "open-1"));
  assert.ok(!("error" in opened));
  if ("error" in opened) return;
  const duplicate = await runtime.open(request("project-a", "open-1"));
  assert.ok(!("error" in duplicate));
  if ("error" in duplicate) return;
  assert.equal(duplicate.id, opened.id);
  const ready = await waitReady(runtime, opened);
  assert.equal(ready.state, "ready", `${ready.statusMessage ?? ""}\n${runtime.diagnosticTail()}`);
  assert.match(ready.previewUrl!, /^http:\/\/localhost:\d+\/$/);
  assert.equal((await fetch(ready.previewUrl!)).status, 200);
  const forbidden = await fetch(`${ready.previewUrl!}@fs/${root}/package.json`);
  assert.equal(forbidden.status, 403);
  const stopped = await runtime.close({ projectId: "project-a", sessionId: opened.id, requestId: "close-1" });
  assert.ok(!("error" in stopped));
  if ("error" in stopped) return;
  assert.equal(stopped.state, "stopped");
  const reopened = await runtime.open(request("project-a", "open-2"));
  assert.ok(!("error" in reopened));
  if ("error" in reopened) return;
  assert.notEqual(reopened.previewGeneration, opened.previewGeneration);
  assert.equal((await waitReady(runtime, reopened)).state, "ready");
  await runtime.shutdown();
});

test("occupied preview port cannot be mistaken for our ready worker and retry recovers", async (t) => {
  const data = await dataDir();
  const registry = new Registry(seed, data);
  await registry.initialize();
  const port = await freePort();
  const impostor = createServer((_request, response) => { response.writeHead(200, { "content-type": "text/html" }); response.end("<html>impostor</html>"); });
  await new Promise<void>((resolve) => impostor.listen(port, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve) => impostor.close(() => resolve())));
  const runtime = new WorkspaceRuntime(registry.get("project-a")!, seed, data, "operator-stable", port);
  t.after(() => runtime.shutdown());
  await runtime.initialize();
  // Exit and failure IPC can arrive in either order. The first observable failed
  // state must already contain the actionable startup reason on every retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const opened = await runtime.open(request("project-a", `busy-open-${attempt}`));
    assert.ok(!("error" in opened));
    if ("error" in opened) return;
    const failed = await waitReady(runtime, opened);
    assert.equal(failed.state, "failed");
    assert.equal(failed.statusMessage, "The preview port is occupied. Stop the other process, then retry.");
  }
  await new Promise<void>((resolve) => impostor.close(() => resolve()));
  const retry = await runtime.open(request("project-a", "busy-retry"));
  assert.ok(!("error" in retry));
  if ("error" in retry) return;
  assert.equal((await waitReady(runtime, retry)).state, "ready", runtime.diagnosticTail());
});

test("closing during startup never leaves a late Astro listener", async (t) => {
  const data = await dataDir();
  const registry = new Registry(seed, data);
  await registry.initialize();
  const port = await freePort();
  const runtime = new WorkspaceRuntime(registry.get("project-a")!, seed, data, "operator-stable", port);
  t.after(() => runtime.shutdown());
  await runtime.initialize();
  const opened = await runtime.open(request("project-a", "cancel-open"));
  assert.ok(!("error" in opened));
  if ("error" in opened) return;
  const closed = await runtime.close({ projectId: "project-a", sessionId: opened.id, requestId: "cancel-close" });
  assert.ok(!("error" in closed));
  if ("error" in closed) return;
  assert.equal(closed.state, "stopped");
  await new Promise((resolve) => setTimeout(resolve, 750));
  const probe = createServer();
  await new Promise<void>((resolve, reject) => probe.once("error", reject).listen(port, "127.0.0.1", resolve));
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  assert.equal(runtime.currentSession()?.state, "stopped");
});

test("compiler failure and missing pinned dependencies remain failed until repaired", async (t) => {
  const data = await dataDir();
  const registry = new Registry(seed, data);
  await registry.initialize();
  const rootCopy = registry.get("project-a")!.root;
  const page = path.join(rootCopy, "src/pages/index.astro");
  const original = await readFile(page);
  await writeFile(page, "---\nconst invalid = ;\n---\n<html><body>broken</body></html>\n");
  const runtime = new WorkspaceRuntime(registry.get("project-a")!, seed, data, "operator-stable");
  t.after(() => runtime.shutdown());
  await runtime.initialize();
  const opened = await runtime.open(request("project-a", "compile-open"));
  assert.ok(!("error" in opened));
  if ("error" in opened) return;
  const failed = await waitReady(runtime, opened);
  assert.equal(failed.state, "failed", runtime.diagnosticTail());
  assert.equal(failed.statusMessage, "The Astro preview did not compile. Fix the page source, then retry.");
  await writeFile(page, original);
  const retried = await runtime.open(request("project-a", "compile-retry"));
  assert.ok(!("error" in retried));
  if ("error" in retried) return;
  assert.equal((await waitReady(runtime, retried)).state, "ready", runtime.diagnosticTail());
  await runtime.shutdown();

  const seedCopy = path.join(await dataDir(), "seed");
  await cp(seed, seedCopy, { recursive: true, filter: (source) => !source.split(path.sep).includes("node_modules") });
  const missingData = await dataDir();
  const missingSeed = await realpath(seedCopy);
  const missingRegistry = new Registry(missingSeed, missingData);
  await missingRegistry.initialize();
  const missingRuntime = new WorkspaceRuntime(missingRegistry.get("project-a")!, missingSeed, missingData, "operator-stable");
  await missingRuntime.initialize();
  const missingOpened = await missingRuntime.open(request("project-a", "missing-open"));
  assert.ok(!("error" in missingOpened));
  if (!("error" in missingOpened)) {
    const missing = await waitReady(missingRuntime, missingOpened);
    assert.equal(missing.state, "failed");
    assert.equal(missing.statusMessage, "Project dependencies are missing. Install the pinned fixture packages, then retry.");
  }
  await missingRuntime.shutdown();
});

test("real engine writes once, stale external edit rejects, receipts reconcile after new session", async (t) => {
  const data = await dataDir();
  const { registry, runtime } = await workspace(data);
  t.after(() => runtime.shutdown());
  const opened = await runtime.open(request("project-a", "open-1"));
  assert.ok(!("error" in opened));
  if ("error" in opened) return;
  const ready = await waitReady(runtime, opened);
  assert.equal(ready.state, "ready", `${ready.statusMessage ?? ""}\n${runtime.diagnosticTail()}`);
  const model = await runtime.sourceModel({ ...request("project-a", "model-1"), sessionId: ready.id, pageId: "home" });
  assert.ok(!("error" in model));
  if ("error" in model) return;
  const target = model.targets.find((item) => item.kind === "element" && item.anchor === "home-primary-cta")!;
  const preparation = await runtime.prepare({ ...request("project-a", "prepare-1"), sessionId: ready.id,
    expectedRevision: model.projectRevision, targetId: target.targetId,
    command: { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "color", hex: "#123456" } } });
  assert.equal(preparation.status, "ready");
  if (preparation.status !== "ready") return;
  const proposal = preparation.proposal;
  const applied = await runtime.apply({ ...request("project-a", "apply-1"), sessionId: ready.id,
    expectedRevision: model.projectRevision, proposalId: proposal.proposalId });
  assert.equal(applied.status, "applied");
  if (applied.status !== "applied") return;
  const duplicateApply = await runtime.apply({ ...request("project-a", "apply-1"), sessionId: ready.id,
    expectedRevision: model.projectRevision, proposalId: proposal.proposalId });
  assert.deepEqual(duplicateApply, applied);
  const changedReuse = await runtime.apply({ ...request("project-a", "apply-1"), sessionId: ready.id,
    expectedRevision: model.projectRevision, proposalId: "other-proposal" });
  assert.ok("error" in changedReuse && changedReuse.error.code === "IDEMPOTENCY_CONFLICT");
  const changedCss = await readFile(path.join(registry.get("project-a")!.root, "src/styles/site.css"), "utf8");
  assert.match(changedCss, /#123456/);
  const otherCss = await readFile(path.join(registry.get("project-b")!.root, "src/styles/site.css"), "utf8");
  assert.doesNotMatch(otherCss, /#123456/);
  await runtime.close({ projectId: "project-a", sessionId: ready.id, requestId: "close-1" });
  const reopened = await runtime.open(request("project-a", "open-2"));
  assert.ok(!("error" in reopened));
  if ("error" in reopened) return;
  const outcome = await runtime.outcome({ ...request("project-a", "lookup-1"), sessionId: reopened.id,
    lookupRequestId: "apply-1" });
  assert.equal(outcome.status, "applied");
  const oldCapability = await runtime.apply({ ...request("project-a", "apply-2"), sessionId: reopened.id,
    expectedRevision: model.projectRevision, proposalId: proposal.proposalId });
  assert.ok("error" in oldCapability);
  await waitReady(runtime, reopened);
  const model2 = await runtime.sourceModel({ ...request("project-a", "model-2"), sessionId: reopened.id, pageId: "home" });
  assert.ok(!("error" in model2));
  if ("error" in model2) return;
  const target2 = model2.targets.find((item) => item.kind === "element" && item.anchor === "home-primary-cta")!;
  const preparation2 = await runtime.prepare({ ...request("project-a", "prepare-2"), sessionId: reopened.id,
    expectedRevision: model2.projectRevision, targetId: target2.targetId,
    command: { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "color", hex: "#654321" } } });
  assert.equal(preparation2.status, "ready");
  if (preparation2.status !== "ready") return;
  const cssFile = path.join(registry.get("project-a")!.root, "src/styles/site.css");
  await writeFile(cssFile, `${await readFile(cssFile, "utf8")}\n/* external change */\n`);
  const stale = await runtime.apply({ ...request("project-a", "apply-3"), sessionId: reopened.id,
    expectedRevision: model2.projectRevision, proposalId: preparation2.proposal.proposalId });
  assert.ok("error" in stale && stale.error.code === "STALE_REVISION");
  await runtime.shutdown();
});

test("write-ahead recovery distinguishes before, after, and third-state bytes", async (t) => {
  for (const caseName of ["after-intent", "after-replace", "third-state", "restart-before-intent"] as const) {
    const faultPoint = caseName === "third-state" || caseName === "restart-before-intent" ? "after-intent" : caseName;
    const data = await dataDir();
    const registry = new Registry(seed, data);
    await registry.initialize();
    const project = registry.get("project-a")!;
    const runtime = new WorkspaceRuntime(project, seed, data, "operator-stable", undefined, faultPoint);
    t.after(() => runtime.shutdown());
    await runtime.initialize();
    const opened = await runtime.open(request("project-a", `open-${caseName}`));
    assert.ok(!("error" in opened));
    if ("error" in opened) continue;
    assert.equal((await waitReady(runtime, opened)).state, "ready", runtime.diagnosticTail());
    const model = await runtime.sourceModel({ ...request("project-a", `model-${caseName}`), sessionId: opened.id, pageId: "home" });
    assert.ok(!("error" in model));
    if ("error" in model) continue;
    const target = model.targets.find((item) => item.kind === "element" && item.anchor === "home-primary-cta")!;
    const preparation = await runtime.prepare({ ...request("project-a", `prepare-${caseName}`), sessionId: opened.id,
      expectedRevision: model.projectRevision, targetId: target.targetId,
      command: { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "color", hex: "#abc123" } } });
    assert.equal(preparation.status, "ready");
    if (preparation.status !== "ready") continue;
    const apply = { ...request("project-a", `apply-${caseName}`), sessionId: opened.id,
      expectedRevision: model.projectRevision, proposalId: preparation.proposal.proposalId };
    await assert.rejects(runtime.apply(apply), /Injected interruption/);
    const cssPath = path.join(project.root, "src/styles/site.css");
    if (caseName === "after-intent") {
      const blocked = await runtime.prepare({ ...request("project-a", "blocked-prepare"), sessionId: opened.id,
        expectedRevision: model.projectRevision, targetId: target.targetId,
        command: { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "color", hex: "#999999" } } });
      assert.ok("error" in blocked && blocked.error.code === "HISTORY_CONFLICT");
    }
    if (caseName === "after-replace") {
      const journal = JSON.parse(await readFile(path.join(project.metadata, "operations", "apply-after-replace.json"), "utf8")) as { receipt: { newRevision: string } };
      const current = await runtime.sourceModel({ ...request("project-a", "post-crash-model"), sessionId: opened.id, pageId: "home" });
      assert.ok(!("error" in current));
      if (!("error" in current)) assert.equal(current.projectRevision, journal.receipt.newRevision);
    }
    if (caseName === "third-state") await writeFile(cssPath, `${await readFile(cssPath, "utf8")}\n/* third state */\n`);
    if (caseName === "restart-before-intent") {
      const restart = await runtime.restart({ projectId: "project-a", sessionId: opened.id, requestId: "restart-pending" });
      assert.ok(!("error" in restart));
      if (!("error" in restart)) {
        const reconciled = await runtime.outcome({ ...request("project-a", "lookup-after-restart"),
          sessionId: restart.id, lookupRequestId: "apply-restart-before-intent" });
        assert.equal(reconciled.status, "unchanged");
      }
    }
    await runtime.shutdown();
    const recovered = new WorkspaceRuntime(project, seed, data, "operator-stable");
    t.after(() => recovered.shutdown());
    await recovered.initialize();
    const reopened = await recovered.open(request("project-a", `reopen-${caseName}`));
    assert.ok(!("error" in reopened));
    if ("error" in reopened) continue;
    const outcome = await recovered.outcome({ ...request("project-a", `lookup-${caseName}`), sessionId: reopened.id,
      lookupRequestId: `apply-${caseName}` });
    assert.equal(outcome.status, caseName === "after-replace" ? "applied" : caseName === "third-state" ? "conflicted" : "unchanged");
    const css = await readFile(path.join(project.root, "src/styles/site.css"), "utf8");
    assert.equal(css.includes("#abc123"), caseName === "after-replace");
    await recovered.shutdown();
  }
});

test("queued apply rechecks session after close wins the project lock", async (t) => {
  const data = await dataDir();
  const { registry, runtime } = await workspace(data);
  t.after(() => runtime.shutdown());
  const opened = await runtime.open(request("project-a", "race-open"));
  assert.ok(!("error" in opened));
  if ("error" in opened) return;
  assert.equal((await waitReady(runtime, opened)).state, "ready");
  const model = await runtime.sourceModel({ ...request("project-a", "race-model"), sessionId: opened.id, pageId: "home" });
  assert.ok(!("error" in model));
  if ("error" in model) return;
  const target = model.targets.find((item) => item.kind === "element" && item.anchor === "home-primary-cta")!;
  const prepared = await runtime.prepare({ ...request("project-a", "race-prepare"), sessionId: opened.id,
    expectedRevision: model.projectRevision, targetId: target.targetId,
    command: { type: "style.set", property: "background-color", scopeId: "base", value: { kind: "color", hex: "#ababab" } } });
  assert.equal(prepared.status, "ready");
  if (prepared.status !== "ready") return;
  const before = await readFile(path.join(registry.get("project-a")!.root, "src/styles/site.css"));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  (runtime as unknown as { mutex: Promise<unknown> }).mutex = gate;
  const closing = runtime.close({ projectId: "project-a", sessionId: opened.id, requestId: "race-close" });
  const applying = runtime.apply({ ...request("project-a", "race-apply"), sessionId: opened.id,
    expectedRevision: model.projectRevision, proposalId: prepared.proposal.proposalId });
  release();
  await closing;
  const result = await applying;
  assert.ok("error" in result && result.error.code === "NOT_READY");
  assert.deepEqual(await readFile(path.join(registry.get("project-a")!.root, "src/styles/site.css")), before);
});

test("HTTP runner requires bearer and stable operator, rejects browser origin", async (t) => {
  const data = await dataDir();
  const port = await freePort();
  const runner = new Runner({ seed, data, url: new URL(`http://127.0.0.1:${port}/`), secret: "a".repeat(48),
    operatorId: "operator-stable", appOrigin: "http://127.0.0.1:3210", previewHost: "localhost" });
  await runner.initialize();
  const server = createRunnerServer(runner);
  t.after(async () => { await runner.shutdown(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  if (!address || typeof address === "string") return;
  const url = `http://127.0.0.1:${address.port}/rpc`;
  const body = JSON.stringify({ method: "listProjects", params: { requestId: "list-1" } });
  const noAuth = await fetch(url, { method: "POST", body });
  assert.equal(noAuth.status, 401);
  const wrongOrigin = await fetch(url, { method: "POST", body,
    headers: { origin: "http://evil.local", authorization: `Bearer ${"a".repeat(48)}`, "x-stellar-operator": "operator-stable" } });
  assert.equal(wrongOrigin.status, 403);
  const valid = await fetch(url, { method: "POST", body,
    headers: { authorization: `Bearer ${"a".repeat(48)}`, "x-stellar-operator": "operator-stable" } });
  assert.equal(valid.status, 200);
  assert.equal((await valid.json() as { projects: unknown[] }).projects.length, 2);
});

test("one runner owns a data directory and a dead owner's lease can be reclaimed", async () => {
  const data = await dataDir();
  const config = { seed, data, url: new URL("http://127.0.0.1:4310/"), secret: "b".repeat(48),
    operatorId: "operator-stable", appOrigin: "http://127.0.0.1:3210", previewHost: "localhost" as const };
  const first = new Runner(config);
  await first.initialize();
  const second = new Runner(config);
  await assert.rejects(second.initialize(), /Another local runner owns/);
  await first.shutdown();
  await second.initialize();
  await second.shutdown();
  const leaseDirectory = path.join(await realpath(data), ".runner-lease");
  await mkdir(leaseDirectory);
  await writeFile(path.join(leaseDirectory, "owner.json"), JSON.stringify({ version: 1, pid: 99999999, token: "old" }));
  const third = new Runner(config);
  await third.initialize();
  await third.shutdown();

  await mkdir(leaseDirectory);
  await writeFile(path.join(leaseDirectory, "owner.json"), JSON.stringify({ version: 1, pid: 99999999, token: "old-again" }));
  const contenders = [new Runner(config), new Runner(config)];
  const results = await Promise.allSettled(contenders.map((runner) => runner.initialize()));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  for (let index = 0; index < contenders.length; index++) {
    if (results[index]?.status === "fulfilled") await contenders[index]!.shutdown();
  }
});
