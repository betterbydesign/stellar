/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { createHmac, randomBytes } = require("node:crypto");
const { test } = require("node:test");
const { exampleSessionResponse, makeError, PROTOCOL_VERSION } = require("@stellar/contracts");
const { readLocalConfig, isSafePreviewUrl } = require("../lib/server/local-config.ts");
const { bootstrapOperator, readOperator } = require("../lib/server/operator-auth.ts");
const { callRunner } = require("../lib/server/runner-broker.ts");
const { handleProjectApi } = require("../lib/server/project-api.ts");

function env() {
  return {
    STELLAR_LOCAL_MODE: "1",
    STELLAR_APP_ORIGIN: "http://127.0.0.1:3210",
    STELLAR_RUNNER_URL: "http://127.0.0.1:4310",
    STELLAR_RUNNER_SECRET: randomBytes(32).toString("hex"),
    STELLAR_BOOTSTRAP_NONCE: randomBytes(32).toString("hex"),
    STELLAR_PREVIEW_HOST: "localhost",
    STELLAR_OPERATOR_ID: "operator-local",
  };
}
function request(path, method = "GET", headers = {}, body) {
  return new Request(`http://127.0.0.1:3210${path}`, {
    method,
    headers: { host: "127.0.0.1:3210", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function cookie(issued) { return `stellar_operator=${issued.cookie}`; }
function runnerJson(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("launcher config fails closed on unsafe host, mode, secret and preview URL", () => {
  const good = env();
  const config = readLocalConfig(good);
  assert.ok(config);
  assert.equal(readLocalConfig({ ...good, STELLAR_LOCAL_MODE: "0" }), null);
  assert.equal(readLocalConfig({ ...good, STELLAR_APP_ORIGIN: "http://localhost:3210" }), null);
  assert.equal(readLocalConfig({ ...good, STELLAR_RUNNER_URL: "http://0.0.0.0:4310" }), null);
  assert.equal(readLocalConfig({ ...good, STELLAR_PREVIEW_HOST: "127.0.0.1" }), null);
  assert.equal(readLocalConfig({ ...good, STELLAR_RUNNER_SECRET: "short" }), null);
  assert.equal(isSafePreviewUrl("http://localhost:4321/", config), true);
  assert.equal(isSafePreviewUrl("http://127.0.0.1:4321/", config), false);
  assert.equal(isSafePreviewUrl("http://localhost:4321/?secret=1", config), false);
});

test("bootstrap is one-use under concurrent requests and cookie is signed and expiring", async () => {
  const config = readLocalConfig(env());
  const [a, b] = await Promise.all([
    bootstrapOperator(config.bootstrapNonce, config),
    bootstrapOperator(config.bootstrapNonce, config),
  ]);
  assert.equal([a, b].filter(Boolean).length, 1);
  const issued = a ?? b;
  const operator = readOperator(request("/api/operator/session", "GET", { cookie: cookie(issued) }), config);
  assert.equal(operator.id, config.operatorId);
  assert.equal(operator.csrfToken, issued.operator.csrfToken);
  assert.equal(readOperator(request("/", "GET", { cookie: cookie(issued).replace(/.$/, "x") }), config), null);
  const oldExpiry = Date.now() - 1000;
  const id = randomBytes(32).toString("hex");
  const payload = `v1.${id}.${oldExpiry}`;
  const signature = createHmac("sha256", config.runnerSecret).update(`operator:${config.operatorId}:${payload}`).digest("base64url");
  assert.equal(readOperator(request("/", "GET", { cookie: `stellar_operator=${payload}.${signature}` }), config), null);
});

test("broker sends one authenticated loopback RPC and normalizes runner errors", async () => {
  const config = readLocalConfig(env());
  let calls = 0;
  const transport = async (url, init) => {
    calls++;
    assert.equal(url, "http://127.0.0.1:4310/rpc");
    assert.equal(init.headers.authorization, `Bearer ${config.runnerSecret}`);
    assert.equal(init.headers["x-stellar-operator"], config.operatorId);
    assert.deepEqual(JSON.parse(init.body), { method: "listProjects", params: { requestId: "req-1" } });
    return runnerJson({ protocolVersion: PROTOCOL_VERSION, requestId: "req-1", projects: [] });
  };
  const good = await callRunner(config, config.operatorId, "listProjects", { requestId: "req-1" }, { requestId: "req-1" }, transport);
  assert.equal(good.projects.length, 0);
  assert.equal(calls, 1);
  const unsafe = await callRunner(config, config.operatorId, "listProjects", { requestId: "req-1" }, { requestId: "req-1" },
    async () => runnerJson({ ...makeError({ requestId: "req-1" }, "RUNNER_UNAVAILABLE"), error: {
      code: "RUNNER_UNAVAILABLE", httpStatus: 503, recoverable: true, message: `/tmp/${config.runnerSecret}`,
    } }, 503));
  assert.equal(unsafe.error.code, "RUNNER_UNAVAILABLE");
  assert.equal(JSON.stringify(unsafe).includes(config.runnerSecret), false);
  const badPreview = await callRunner(config, config.operatorId, "getSession", {
    projectId: exampleSessionResponse.projectId, sessionId: exampleSessionResponse.sessionId, requestId: "req-2",
  }, { projectId: exampleSessionResponse.projectId, sessionId: exampleSessionResponse.sessionId, requestId: "req-2" },
  async () => runnerJson({ ...exampleSessionResponse, requestId: "req-2", session: {
    ...exampleSessionResponse.session, state: "ready", previewUrl: "http://127.0.0.1:4321/",
  } }));
  assert.equal(badPreview.error.code, "RUNNER_UNAVAILABLE");
  const failedScope = { projectId: exampleSessionResponse.projectId, sessionId: exampleSessionResponse.sessionId, requestId: "req-3" };
  const failed = await callRunner(config, config.operatorId, "getSession", failedScope, failedScope,
    async () => runnerJson({ ...exampleSessionResponse, requestId: "req-3", session: {
      ...exampleSessionResponse.session, state: "failed", previewUrl: null,
      statusMessage: "Project dependencies are missing. Install the pinned fixture packages, then retry.",
    } }));
  assert.equal(failed.session.statusMessage, "Project dependencies are missing. Install the pinned fixture packages, then retry.");
  const unsafeStatus = await callRunner(config, config.operatorId, "getSession", failedScope, failedScope,
    async () => runnerJson({ ...exampleSessionResponse, requestId: "req-3", session: {
      ...exampleSessionResponse.session, state: "failed", previewUrl: null, statusMessage: `/tmp/${config.runnerSecret}`,
    } }));
  assert.equal(unsafeStatus.session.statusMessage, "Preview could not start. Retry the session.");
});

test("restart accepts a new coherent session ID but other reads retain the requested session scope", async () => {
  const config = readLocalConfig(env());
  const oldScope = { projectId: "project-a", sessionId: "session-a", requestId: "restart-1" };
  const newSession = {
    ...exampleSessionResponse, requestId: "restart-1", sessionId: "session-b",
    session: { ...exampleSessionResponse.session, id: "session-b", state: "starting", previewUrl: null, statusMessage: "Starting local preview…" },
  };
  const restart = await callRunner(config, config.operatorId, "restartSession", oldScope, oldScope,
    async () => runnerJson(newSession));
  assert.equal(restart.sessionId, "session-b");
  assert.equal(restart.session.statusMessage, "Starting local preview…");
  const wrongRead = await callRunner(config, config.operatorId, "getSession", oldScope, oldScope,
    async () => runnerJson(newSession));
  assert.equal(wrongRead.error.code, "RUNNER_UNAVAILABLE");
  const incoherent = await callRunner(config, config.operatorId, "restartSession", oldScope, oldScope,
    async () => runnerJson({ ...newSession, session: { ...newSession.session, id: "session-c" } }));
  assert.equal(incoherent.error.code, "RUNNER_UNAVAILABLE");
});

test("all project reads require operator and mutations require exact Origin plus CSRF", async () => {
  const settings = env();
  Object.assign(process.env, settings);
  const config = readLocalConfig();
  const issued = await bootstrapOperator(config.bootstrapNonce, config);
  assert.ok(issued);
  const normal = await handleProjectApi(request("/api/projects?requestId=req-1"), []);
  assert.equal(normal.status, 401);
  const wrongHost = await handleProjectApi(new Request("http://127.0.0.1:3210/api/projects?requestId=req-1", {
    headers: { host: "evil.test", cookie: cookie(issued) },
  }), []);
  assert.equal(wrongHost.status, 403);
  const wrongOrigin = await handleProjectApi(request("/api/projects?requestId=req-1", "GET", {
    cookie: cookie(issued), origin: "http://localhost:3210",
  }), []);
  assert.equal(wrongOrigin.status, 403);
  const postPath = "/api/projects/project-a/sessions";
  const openBody = { protocolVersion: PROTOCOL_VERSION, projectId: "project-a", requestId: "req-open" };
  const withoutOrigin = await handleProjectApi(request(postPath, "POST", {
    cookie: cookie(issued), "x-stellar-csrf": issued.operator.csrfToken, "content-type": "application/json",
  }, openBody), ["project-a", "sessions"]);
  assert.equal(withoutOrigin.status, 403);
  const withoutCsrf = await handleProjectApi(request(postPath, "POST", {
    cookie: cookie(issued), origin: config.appOrigin, "content-type": "application/json",
  }, openBody), ["project-a", "sessions"]);
  assert.equal(withoutCsrf.status, 403);
  const previous = global.fetch;
  global.fetch = async (_url, init) => {
    assert.equal(init.headers["x-stellar-operator"], config.operatorId);
    return runnerJson({ protocolVersion: PROTOCOL_VERSION, requestId: "req-1", projects: [] });
  };
  try {
    const authorized = await handleProjectApi(request("/api/projects?requestId=req-1", "GET", { cookie: cookie(issued) }), []);
    assert.equal(authorized.status, 200);
    assert.equal((await authorized.json()).projects.length, 0);
  } finally {
    global.fetch = previous;
    for (const key of Object.keys(settings)) delete process.env[key];
  }
});


test("NextURL loopback normalization preserves exact incoming Host and Origin gates", () => {
  const { isAppRequest, isAllowedOrigin } = require("../lib/server/operator-auth.ts");
  const config = readLocalConfig(env());
  const normalized = new Request("http://localhost:3210/api/projects", {
    headers: { host: "127.0.0.1:3210", origin: "http://127.0.0.1:3210" },
  });
  assert.equal(isAppRequest(normalized, config), true);
  assert.equal(isAllowedOrigin(normalized, config, true), true);
  assert.equal(isAppRequest(new Request(normalized.url, { headers: { host: "localhost:3210" } }), config), false);
  assert.equal(isAppRequest(new Request("http://localhost:3211/api/projects", { headers: { host: "127.0.0.1:3210" } }), config), false);
  assert.equal(isAppRequest(new Request("http://evil.test:3210/api/projects", { headers: { host: "127.0.0.1:3210" } }), config), false);
  assert.equal(isAllowedOrigin(new Request(normalized.url, { headers: { origin: "http://localhost:3210" } }), config, true), false);
});
