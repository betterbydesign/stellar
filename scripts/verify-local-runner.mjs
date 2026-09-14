import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout } from "node:timers";
import { fileURLToPath, URL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = "stellar.editor.v1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = new Set();
let sequence = 0;
const requestId = () => "acceptance-" + (++sequence);
let cookie;
let csrf;
let appOrigin;

async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}

function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: "ignore" });
  child.failure = null;
  child.on("error", (error) => { child.failure = error; });
  child.on("exit", () => { children.delete(child); });
  children.add(child);
  return child;
}

async function stop(child) {
  if (!children.has(child)) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([exited, sleep(5000)]);
  if (children.has(child)) { child.kill("SIGKILL"); await exited; }
}

async function waitFor(check, description, child) {
  const until = Date.now() + 30000;
  while (Date.now() < until) {
    if (child && (child.failure || !children.has(child))) throw new Error(description + ": process exited");
    if (await check()) return;
    await sleep(150);
  }
  throw new Error(description + ": timed out");
}

async function api(method, path, body, overrides = {}) {
  const response = await fetch(appOrigin + path, {
    method, redirect: "manual", signal: AbortSignal.timeout(25000),
    headers: {
      ...(cookie ? { cookie } : {}), origin: appOrigin,
      ...(csrf ? { "x-stellar-csrf": csrf } : {}),
      ...(body ? { "content-type": "application/json" } : {}), ...overrides,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, data: await response.json() };
}

function ok(result) {
  assert.equal(result.response.status, 200, "Expected success; received " + result.data?.error?.code);
  return result.data;
}

async function seedFingerprint(seed) {
  const hash = createHash("sha256");
  async function visit(directory, prefix = "") {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (["node_modules", "dist", ".astro"].includes(entry.name)) continue;
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await visit(join(directory, entry.name), relative + "/");
      else if (entry.isFile()) hash.update(relative).update("\0").update(await readFile(join(directory, entry.name))).update("\0");
    }
  }
  await visit(seed);
  return hash.digest("hex");
}

const temporary = await realpath(await mkdtemp(join(tmpdir(), "stellar-local-acceptance-")));
const seed = join(root, "fixtures/astro-style-lab");
const originalSeed = await seedFingerprint(seed);
const runnerPort = await port();
let appPort = await port();
while (appPort === runnerPort) appPort = await port();
appOrigin = "http://127.0.0.1:" + appPort;
const runnerOrigin = "http://127.0.0.1:" + runnerPort;
const nonce = randomBytes(32).toString("hex");
const secret = randomBytes(32).toString("hex");
const env = {
  PATH: dirname(process.execPath), HOME: temporary, TMPDIR: tmpdir(),
  NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  STELLAR_LOCAL_MODE: "1", STELLAR_APP_ORIGIN: appOrigin,
  STELLAR_RUNNER_URL: runnerOrigin, STELLAR_RUNNER_SECRET: secret,
  STELLAR_BOOTSTRAP_NONCE: nonce, STELLAR_OPERATOR_ID: "operator-acceptance",
  STELLAR_PREVIEW_HOST: "localhost", STELLAR_FIXTURE_SEED: seed,
  STELLAR_DATA_DIR: join(temporary, "state"),
};

async function runnerReady(child) {
  await waitFor(async () => {
    try {
      const result = await fetch(runnerOrigin + "/rpc", {
        method: "POST", headers: { authorization: "Bearer " + secret, "x-stellar-operator": env.STELLAR_OPERATOR_ID, "content-type": "application/json" },
        body: JSON.stringify({ method: "listProjects", params: { requestId: requestId() } }),
        signal: AbortSignal.timeout(1000),
      });
      return result.status === 200;
    } catch { return false; }
  }, "Runner readiness", child);
}

async function openProject(projectId) {
  const body = { protocolVersion: version, projectId, requestId: requestId() };
  const opened = ok(await api("POST", "/api/projects/" + projectId + "/sessions", body));
  const retry = ok(await api("POST", "/api/projects/" + projectId + "/sessions", body));
  assert.equal(retry.sessionId, opened.sessionId, "Open retry created another session");
  const prefix = "/api/projects/" + projectId + "/sessions/" + opened.sessionId;
  let current;
  await waitFor(async () => {
    current = ok(await api("GET", prefix + "?requestId=" + requestId()));
    assert.notEqual(current.session.state, "failed", "Real Astro preview failed to start");
    return current.session.state === "ready";
  }, "Real Astro readiness");
  const preview = await fetch(current.session.previewUrl, { signal: AbortSignal.timeout(5000) });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Good ideas grow/);
  assert.equal(new URL(current.session.previewUrl).hostname, "localhost");
  return { ...current, prefix };
}

try {
  let runner = start([join(root, "apps/runner/dist/server.js")], root, env);
  await runnerReady(runner);
  const app = start([join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(appPort)], join(root, "apps/web"), env);
  await waitFor(async () => {
    try { return (await fetch(appOrigin + "/connect", { signal: AbortSignal.timeout(1000) })).status === 200; } catch { return false; }
  }, "Application readiness", app);

  assert.equal((await api("GET", "/api/projects?requestId=" + requestId())).response.status, 401);
  assert.equal((await api("POST", "/api/operator/bootstrap", { nonce }, { origin: "http://localhost:" + appPort })).response.status, 403);
  const boot = await api("POST", "/api/operator/bootstrap", { nonce });
  const operator = ok(boot);
  const setCookie = boot.response.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.doesNotMatch(setCookie, /Domain=/i);
  cookie = setCookie.split(";")[0];
  csrf = operator.csrfToken;
  assert.equal((await api("POST", "/api/operator/bootstrap", { nonce })).response.status, 401);
  assert.equal((await api("GET", "/api/projects?requestId=" + requestId(), undefined, { origin: "http://localhost:" + appPort })).response.status, 403);
  const list = ok(await api("GET", "/api/projects?requestId=" + requestId()));
  assert.equal(list.projects.length, 2);
  const [projectA, projectB] = list.projects.map((entry) => entry.project.id);
  const badCsrf = await api("POST", "/api/projects/" + projectA + "/sessions", { protocolVersion: version, projectId: projectA, requestId: requestId() }, { "x-stellar-csrf": "invalid" });
  assert.equal(badCsrf.response.status, 403);

  const a = await openProject(projectA);
  const b = await openProject(projectB);
  assert.notEqual(a.sessionId, b.sessionId);
  const model = ok(await api("GET", a.prefix + "/source-model?pageId=home&requestId=" + requestId()));
  const bModel = ok(await api("GET", b.prefix + "/source-model?pageId=home&requestId=" + requestId()));
  const target = model.targets.find((item) => item.kind === "element" && item.anchor === "home-hero-title");
  assert.equal(target?.editable, true, "Expected a real editable engine target");
  const prepare = { protocolVersion: version, projectId: projectA, sessionId: a.sessionId, requestId: requestId(), expectedRevision: model.projectRevision, targetId: target.targetId, command: { type: "style.set", property: "color", scopeId: "base", value: { kind: "color", hex: "#112233" } } };
  const prepared = ok(await api("POST", a.prefix + "/changes/prepare", prepare));
  assert.equal(prepared.status, "ready");
  const apply = { protocolVersion: version, projectId: projectA, sessionId: a.sessionId, requestId: requestId(), expectedRevision: prepared.proposal.baseRevision, proposalId: prepared.proposal.proposalId };
  const applied = ok(await api("POST", a.prefix + "/changes/apply", apply));
  assert.equal(applied.status, "applied");
  assert.notEqual(applied.receipt.newRevision, applied.receipt.oldRevision);
  assert.deepEqual(ok(await api("POST", a.prefix + "/changes/apply", apply)), applied, "Apply retry did not return the durable result");
  const changedIntent = await api("POST", a.prefix + "/changes/apply", { ...apply, proposalId: "different-proposal" });
  assert.equal(changedIntent.data.error.code, "IDEMPOTENCY_CONFLICT");
  const stale = await api("POST", a.prefix + "/changes/prepare", { ...prepare, requestId: requestId() });
  assert.equal(stale.data.error.code, "STALE_REVISION");
  const bAfter = ok(await api("GET", b.prefix + "/source-model?pageId=home&requestId=" + requestId()));
  assert.equal(bAfter.projectRevision, bModel.projectRevision, "Project A changed project B");
  const after = ok(await api("GET", a.prefix + "/source-model?pageId=home&requestId=" + requestId()));
  assert.equal(after.targets.find((item) => item.targetId === target.targetId), undefined, "Old target survived a revision change");
  const edited = after.targets.find((item) => item.kind === "element" && item.anchor === "home-hero-title");
  assert.equal(edited.controls.find((item) => item.property === "color").authoredValue.hex, "#112233");
  const history = ok(await api("GET", a.prefix + "/history?requestId=" + requestId()));
  assert.equal(history.entries.length, 1);
  const restarted = ok(await api("POST", a.prefix + "/restart", {
    protocolVersion: version, projectId: projectA, sessionId: a.sessionId, requestId: requestId(),
  }));
  assert.notEqual(restarted.session.previewGeneration, a.session.previewGeneration);
  const restartedPrefix = "/api/projects/" + projectA + "/sessions/" + restarted.sessionId;
  const closed = ok(await api("DELETE", restartedPrefix + "?requestId=" + requestId()));
  assert.equal(closed.session.state, "stopped");
  await stop(runner);
  runner = start([join(root, "apps/runner/dist/server.js")], root, env);
  await runnerReady(runner);
  const reopened = await openProject(projectA);
  assert.notEqual(reopened.session.previewGeneration, a.session.previewGeneration);
  assert.equal(reopened.session.sourceRevision, applied.receipt.newRevision);
  const reconciled = ok(await api("GET", reopened.prefix + "/changes/requests/" + apply.requestId + "?requestId=" + requestId()));
  assert.equal(reconciled.status, "applied");
  assert.equal(reconciled.receipt.receiptId, applied.receipt.receiptId);
  assert.equal(await seedFingerprint(seed), originalSeed, "Runner modified the seed fixture");
  assert.doesNotMatch(JSON.stringify([list, model, applied, reconciled]), new RegExp(secret + "|" + nonce));
  console.log("Live acceptance passed: operator/Origin/CSRF gates, two real Astro copies, engine-backed edit, duplicate/stale checks, project isolation, durable restart/reconciliation and unchanged seed.");
} finally {
  for (const child of [...children]) await stop(child);
  await rm(temporary, { recursive: true, force: true });
  await rm(join(tmpdir(), "stellar-bootstrap-" + createHash("sha256").update(nonce).digest("hex") + ".used"), { force: true });
}
