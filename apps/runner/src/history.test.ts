import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { PROTOCOL_VERSION, type ChangeReceipt, type Command, type Session } from "@stellar/contracts";
import { Registry } from "./registry.js";
import { WorkspaceRuntime } from "./workspace.js";

const root = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const seed = path.join(root, "fixtures/astro-style-lab");
const locations: string[] = [];
after(async () => { await Promise.all(locations.map((location) => rm(location, { recursive: true, force: true }))); });
const scope = (projectId: string, requestId: string) => ({ protocolVersion: PROTOCOL_VERSION, projectId, requestId });
async function setup(): Promise<{ registry: Registry; data: string }> {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-history-test-"));
  locations.push(data);
  const registry = new Registry(seed, data);
  await registry.initialize();
  await registry.validateExecutableFiles(registry.get("project-a")!);
  return { registry, data };
}
async function ready(runtime: WorkspaceRuntime, requestId: string): Promise<Session> {
  const opened = await runtime.open(scope("project-a", requestId));
  assert.ok(!("error" in opened));
  if ("error" in opened) throw new Error("Session did not open");
  const deadline = Date.now() + 22_000;
  while (Date.now() < deadline) {
    const session = runtime.getSession({ ...scope("project-a", "poll"), sessionId: opened.id });
    if (!("error" in session) && session.state === "ready") return session;
    if (!("error" in session) && session.state === "failed") throw new Error(`${session.statusMessage ?? "Preview failed"}\n${runtime.diagnosticTail()}`);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("Preview timeout");
}
async function apply(runtime: WorkspaceRuntime, session: Session, key: string, command: Command, targetName: string): Promise<ChangeReceipt> {
  const model = await runtime.sourceModel({ ...scope("project-a", `model-${key}`), sessionId: session.id, pageId: "home" });
  assert.ok(!("error" in model));
  if ("error" in model) throw new Error("Source model unavailable");
  const target = model.targets.find((item) => item.kind === (command.type === "token.set" ? "token-definition" : "element") &&
    (item.kind === "token-definition" ? item.tokenName : item.anchor) === targetName);
  assert(target);
  const prepared = await runtime.prepare({ ...scope("project-a", `prepare-${key}`), sessionId: session.id,
    expectedRevision: model.projectRevision, targetId: target.targetId, command });
  assert.equal(prepared.status, "ready");
  if (prepared.status !== "ready") throw new Error("Edit not prepared");
  const result = await runtime.apply({ ...scope("project-a", `apply-${key}`), sessionId: session.id,
    expectedRevision: model.projectRevision, proposalId: prepared.proposal.proposalId });
  assert.equal(result.status, "applied");
  if (result.status !== "applied") throw new Error("Edit not applied");
  return result.receipt;
}
async function history(runtime: WorkspaceRuntime, session: Session, requestId: string) {
  const result = await runtime.history({ ...scope("project-a", requestId), sessionId: session.id });
  assert.ok(!("error" in result));
  if ("error" in result) throw new Error("History unavailable");
  return result;
}
async function change(runtime: WorkspaceRuntime, session: Session, operation: "undo" | "redo", entryId: string, requestId: string, expectedRevision = runtime.currentRevision()) {
  return runtime.historyCommand({ ...scope("project-a", requestId), sessionId: session.id, operation, entryId, expectedRevision });
}

test("multi-file history is LIFO, durable, idempotent and keeps token impact shared", async (t) => {
  const { registry, data } = await setup();
  const runtime = new WorkspaceRuntime(registry.get("project-a")!, seed, data, "operator-stable");
  t.after(() => runtime.shutdown());
  await runtime.initialize();
  const session = await ready(runtime, "open-history");
  const siteFile = path.join(registry.get("project-a")!.root, "src/styles/site.css");
  const tokenFile = path.join(registry.get("project-a")!.root, "src/styles/tokens.css");
  const siteBefore = await readFile(siteFile);
  const tokenBefore = await readFile(tokenFile);
  const style = await apply(runtime, session, "style", { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#123456" } }, "home-hero-title");
  const token = await apply(runtime, session, "token", { type: "token.set", value: { kind: "color", hex: "#345678" } }, "--lab-color-action-base");
  const listed = await history(runtime, session, "list-1");
  assert.deepEqual(listed.entries.map((entry) => entry.entryId), [style.receiptId, token.receiptId]);
  assert.deepEqual(listed.entries[1]?.impact.pageIds, ["home", "contact"]);
  assert.match(listed.entries[0]?.display?.timestamp ?? "", /^\d{4}-/);
  assert.equal(listed.canUndo, true);
  assert.equal(listed.canRedo, false);

  const tokenUndo = await change(runtime, session, "undo", token.receiptId, "undo-token");
  assert.equal(tokenUndo.status, "applied");
  if (tokenUndo.status !== "applied") return;
  assert.equal(tokenUndo.receipt.operation, "undo");
  assert.notEqual(tokenUndo.receipt.newRevision, token.oldRevision);
  assert.deepEqual(await readFile(tokenFile), tokenBefore);
  assert.deepEqual(await change(runtime, session, "undo", token.receiptId, "undo-token", token.newRevision), tokenUndo);
  const reused = await change(runtime, session, "redo", token.receiptId, "undo-token", token.newRevision);
  assert.ok("error" in reused && reused.error.code === "IDEMPOTENCY_CONFLICT");
  const afterOne = await history(runtime, session, "list-2");
  assert.equal(afterOne.entries[1]?.state, "undone");
  assert.equal(afterOne.canUndo, true);
  assert.equal(afterOne.canRedo, true);

  const styleUndo = await change(runtime, session, "undo", style.receiptId, "undo-style");
  assert.equal(styleUndo.status, "applied");
  assert.deepEqual(await readFile(siteFile), siteBefore);
  const afterTwo = await history(runtime, session, "list-3");
  assert.equal(afterTwo.canUndo, false);
  assert.equal(afterTwo.canRedo, true);
  const wrongOrder = await change(runtime, session, "redo", token.receiptId, "redo-wrong");
  assert.ok("error" in wrongOrder && wrongOrder.error.code === "HISTORY_CONFLICT");
  assert.equal((await change(runtime, session, "redo", style.receiptId, "redo-style")).status, "applied");
  assert.equal((await change(runtime, session, "redo", token.receiptId, "redo-token")).status, "applied");
  assert.match(await readFile(siteFile, "utf8"), /#123456/);
  assert.match(await readFile(tokenFile, "utf8"), /#345678/);
  assert.deepEqual(await readFile(path.join(registry.get("project-b")!.root, "src/styles/tokens.css")), tokenBefore);

  await runtime.shutdown();
  const restarted = new WorkspaceRuntime(registry.get("project-a")!, seed, data, "operator-stable");
  t.after(() => restarted.shutdown());
  await restarted.initialize();
  const newSession = await ready(restarted, "reopen-history");
  const restored = await history(restarted, newSession, "list-reopened");
  assert.equal(restored.entries.length, 2);
  assert.equal(restored.canUndo, true);
  const outcome = await restarted.outcome({ ...scope("project-a", "lookup-undo"), sessionId: newSession.id, lookupRequestId: "undo-token" });
  assert.equal(outcome.status, "applied");
  if (outcome.status === "applied") assert.equal(outcome.operation, "undo");
});

test("new apply cuts redo, external source drift blocks history, and 21 edits remain undoable", async (t) => {
  const { registry, data } = await setup();
  const runtime = new WorkspaceRuntime(registry.get("project-a")!, seed, data, "operator-stable");
  t.after(() => runtime.shutdown());
  await runtime.initialize();
  const session = await ready(runtime, "open-branch");
  const first = await apply(runtime, session, "branch-first", { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#111111" } }, "home-hero-title");
  const undone = await change(runtime, session, "undo", first.receiptId, "branch-undo");
  assert.equal(undone.status, "applied");
  assert.equal((await history(runtime, session, "list-redo")).canRedo, true);
  const branch = await apply(runtime, session, "branch-new", { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#222222" } }, "home-hero-title");
  assert.equal((await history(runtime, session, "list-branch")).canRedo, false);
  const refusedRedo = await change(runtime, session, "redo", first.receiptId, "branch-redo");
  assert.ok("error" in refusedRedo && refusedRedo.error.code === "HISTORY_CONFLICT");
  const cssFile = path.join(registry.get("project-a")!.root, "src/styles/site.css");
  const external = `${await readFile(cssFile, "utf8")}\n/* external change */\n`;
  await writeFile(cssFile, external);
  const drifted = await history(runtime, session, "list-drifted");
  assert.equal(drifted.canUndo, false);
  const stale = await change(runtime, session, "undo", branch.receiptId, "stale-undo", branch.newRevision);
  assert.ok("error" in stale && stale.error.code === "STALE_REVISION");
  const current = await change(runtime, session, "undo", branch.receiptId, "current-undo");
  assert.ok("error" in current && current.error.code === "HISTORY_CONFLICT");
  assert.equal(await readFile(cssFile, "utf8"), external);

  const receipts: ChangeReceipt[] = [];
  for (let i = 0; i < 21; i++) {
    const hex = `#${(0x303030 + i).toString(16).padStart(6, "0")}`;
    receipts.push(await apply(runtime, session, `many-${i}`, { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex } }, "home-hero-title"));
  }
  await runtime.shutdown();
  const restarted = new WorkspaceRuntime(registry.get("project-a")!, seed, data, "operator-stable");
  t.after(() => restarted.shutdown());
  await restarted.initialize();
  const newSession = await ready(restarted, "reopen-many");
  const available = await history(restarted, newSession, "list-many");
  assert.equal(available.canUndo, true);
  assert.equal(available.entries.length, 23);
  for (let i = receipts.length - 1; i >= 0; i--) {
    const result = await change(restarted, newSession, "undo", receipts[i]!.receiptId, `many-undo-${i}`);
    assert.equal(result.status, "applied");
  }
  const exhausted = await history(restarted, newSession, "list-exhausted");
  assert.equal(exhausted.canUndo, false);
  assert.equal(exhausted.canRedo, true);
  assert.match(await readFile(cssFile, "utf8"), /#222222/);
});

test("interrupted undo reconciles before and after source replacement", async (t) => {
  for (const faultPoint of ["after-intent", "after-replace"] as const) {
    const { registry, data } = await setup();
    const project = registry.get("project-a")!;
    const cssFile = path.join(project.root, "src/styles/site.css");
    const normal = new WorkspaceRuntime(project, seed, data, "operator-stable");
    t.after(() => normal.shutdown());
    await normal.initialize();
    const firstSession = await ready(normal, `open-${faultPoint}`);
    const original = await readFile(cssFile);
    const receipt = await apply(normal, firstSession, `fault-${faultPoint}`,
      { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#123456" } }, "home-hero-title");
    const edited = await readFile(cssFile);
    await normal.shutdown();

    const interrupted = new WorkspaceRuntime(project, seed, data, "operator-stable", undefined, faultPoint);
    t.after(() => interrupted.shutdown());
    await interrupted.initialize();
    const faultSession = await ready(interrupted, `fault-open-${faultPoint}`);
    await assert.rejects(change(interrupted, faultSession, "undo", receipt.receiptId, `undo-${faultPoint}`), /Injected interruption/);
    await interrupted.shutdown();

    const recovered = new WorkspaceRuntime(project, seed, data, "operator-stable");
    t.after(() => recovered.shutdown());
    await recovered.initialize();
    const recoveredSession = await ready(recovered, `recover-${faultPoint}`);
    const outcome = await recovered.outcome({ ...scope("project-a", `lookup-${faultPoint}`), sessionId: recoveredSession.id,
      lookupRequestId: `undo-${faultPoint}` });
    const listed = await history(recovered, recoveredSession, `list-${faultPoint}`);
    if (faultPoint === "after-intent") {
      assert.equal(outcome.status, "unchanged");
      assert.deepEqual(await readFile(cssFile), edited);
      assert.equal(listed.canUndo, true);
    } else {
      assert.equal(outcome.status, "applied");
      if (outcome.status === "applied") assert.equal(outcome.receipt.operation, "undo");
      assert.deepEqual(await readFile(cssFile), original);
      assert.equal(listed.canRedo, true);
    }
  }
});
