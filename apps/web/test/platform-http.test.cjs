/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const test = require("node:test");
const { platformHttp } = require("../lib/platform/http.ts");
const { readLocalConfig } = require("../lib/server/local-config.ts");
const { discardIntent, parseIntent, intentStorageKey, newIntent } = require("../features/platform/create-intent.ts");
const origin = "https://stellar.example";
function setup(overrides = {}) {
  const calls = [];
  const backend = Object.fromEntries(["viewer", "bootstrap", "list", "create", "project", "runner"].map((key) => [key, async (...args) => { calls.push([key, ...args]); return { ok: true }; }]));
  const deps = { appOrigin: origin, session: async () => ({ accessToken: "test-private-token" }), backend, errorCode: (error) => error.code, ...overrides };
  return { calls, deps };
}
function request(path, body, requestOrigin = origin, extraHeaders = {}) {
  return new Request(origin + "/api/platform/" + path, { method: body === undefined ? "GET" : "POST", headers: { ...(requestOrigin === null ? {} : { origin: requestOrigin }), "content-type": "application/json", ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function expectCode(response, status, code) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: { code } });
  assert.equal(response.headers.get("cache-control"), "no-store");
}
test("disabled configuration never reads session or calls backend", async () => {
  const { deps, calls } = setup({ appOrigin: null, session: async () => { throw new Error("must not run"); } });
  await expectCode(await platformHttp(request("projects"), ["projects"], deps), 503, "PLATFORM_UNAVAILABLE");
  assert.deepEqual(calls, []);
});
test("anonymous sessions and auth service failures cannot reach platform data", async () => {
  for (const session of [async () => null, async () => { throw new Error("auth service test detail"); }]) {
    const { deps, calls } = setup({ session });
    const response = await platformHttp(request("projects"), ["projects"], deps);
    assert.ok([401, 503].includes(response.status));
    assert.deepEqual(await response.json(), { error: { code: response.status === 401 ? "UNAUTHENTICATED" : "PLATFORM_UNAVAILABLE" } });
    assert.deepEqual(calls, []);
  }
});
test("mutation origins are exact and never trust forwarded hosts or local cookies", async () => {
  for (const badOrigin of [null, "null", "https://evil.example", origin + ".evil.example", origin + "/"]) {
    const { deps, calls } = setup();
    await expectCode(await platformHttp(request("workspace", {}, badOrigin, { "x-forwarded-host": "stellar.example", cookie: "stellar.operator=test" }), ["workspace"], deps), 403, "FORBIDDEN");
    assert.deepEqual(calls, []);
  }
});
test("project create forwards only validated intent and private token", async () => {
  const { deps, calls } = setup();
  const body = { name: "A Website", requestId: "request-1" };
  const response = await platformHttp(request("projects", body), ["projects"], deps);
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [["create", "test-private-token", body]]);
  assert.ok(!(await response.text()).includes("test-private-token"));
  for (const input of [{ ...body, tenantId: "other" }, { ...body, actor: "other" }, { ...body, name: "../secret" }, { ...body, requestId: "x".repeat(129) }]) {
    await expectCode(await platformHttp(request("projects", input), ["projects"], deps), 400, "INVALID_REQUEST");
  }
  assert.equal(calls.length, 1);
});
test("bootstrap cannot accept client-selected organization or actor", async () => {
  const { deps, calls } = setup();
  await expectCode(await platformHttp(request("workspace", { org_id: "victim" }), ["workspace"], deps), 400, "INVALID_REQUEST");
  assert.deepEqual(calls, []);
});
test("authorization failures pass safe codes and backend outage redacts details", async () => {
  for (const [code, status] of [["TENANT_ACCESS_DENIED", 403], ["PROJECT_ACCESS_DENIED", 403], ["IDEMPOTENCY_CONFLICT", 409], ["sensitive backend detail", 503]]) {
    const { deps } = setup();
    deps.backend.project = async () => { throw { code, secret: "provider-secret" }; };
    await expectCode(await platformHttp(request("projects/abc"), ["projects", "abc"], deps), status, status === 503 ? "BACKEND_UNAVAILABLE" : code);
  }
});
test("runner attempt authorizes through backend and remains disconnected", async () => {
  const { deps, calls } = setup();
  await expectCode(await platformHttp(request("projects/abc/runner", {}), ["projects", "abc", "runner"], deps), 409, "RUNNER_DISCONNECTED");
  assert.deepEqual(calls, [["runner", "test-private-token", "abc"]]);
  deps.backend.runner = async () => { throw { code: "PROJECT_ACCESS_DENIED" }; };
  await expectCode(await platformHttp(request("projects/abc/runner", {}), ["projects", "abc", "runner"], deps), 403, "PROJECT_ACCESS_DENIED");
});
test("request identity survives serialization and is isolated by actor and tenant", () => {
  const intent = newIntent("  My Website  ", "request-1");
  assert.deepEqual(parseIntent(JSON.stringify(intent)), { name: "My Website", requestId: "request-1" });
  assert.notEqual(intentStorageKey("a", "tenant-a"), intentStorageKey("b", "tenant-a"));
  assert.notEqual(intentStorageKey("a", "tenant-a"), intentStorageKey("a", "tenant-b"));
  assert.equal(parseIntent('{"name":"../secret","requestId":"id"}'), null);
});
test("platform or unknown mode disables all local broker configuration", () => {
  const base = { STELLAR_LOCAL_MODE: "1", STELLAR_APP_ORIGIN: "http://127.0.0.1:43100", STELLAR_RUNNER_URL: "http://127.0.0.1:43101", STELLAR_PREVIEW_HOST: "localhost", STELLAR_RUNNER_SECRET: "x".repeat(32), STELLAR_BOOTSTRAP_NONCE: "y".repeat(32), STELLAR_OPERATOR_ID: "local-operator" };
  assert.ok(readLocalConfig(base));
  assert.equal(readLocalConfig({ ...base, STELLAR_PLATFORM_MODE: "0 " }), null);
  assert.equal(readLocalConfig({ ...base, STELLAR_PLATFORM_MODE: " " }), null);
  for (const value of ["1", "true", "unexpected"]) assert.equal(readLocalConfig({ ...base, STELLAR_PLATFORM_MODE: value }), null);
});

test("explicit resolution clears only the current actor and tenant intent", () => {
  const keys = [intentStorageKey("a", "one"), intentStorageKey("b", "one"), intentStorageKey("a", "two")];
  const store = new Map(keys.map((key) => [key, "pending"]));
  discardIntent({ removeItem: (key) => store.delete(key) }, "a", "one");
  assert.equal(store.has(keys[0]), false);
  assert.equal(store.has(keys[1]), true);
  assert.equal(store.has(keys[2]), true);
});

test("proposal reads forward exact project scope and bounded pagination", async () => {
  const { deps, calls } = setup();
  deps.backend.proposals = async (...args) => { calls.push(args); return { page: [], canReview: false }; };
  deps.backend.proposal = async (...args) => { calls.push(args); return { proposal: { status: "proposed" } }; };
  assert.equal((await platformHttp(request("projects/abc/proposals?cursor=next"), ["projects", "abc", "proposals"], deps)).status, 200);
  assert.deepEqual(calls[0], ["test-private-token", "abc", "next"]);
  assert.equal((await platformHttp(request("projects/abc/proposals/prop"), ["projects", "abc", "proposals", "prop"], deps)).status, 200);
  assert.deepEqual(calls[1], ["test-private-token", "abc", "prop"]);
  await expectCode(await platformHttp(request("projects/abc/proposals?cursor=" + "x".repeat(2049)), ["projects", "abc", "proposals"], deps), 400, "INVALID_REQUEST");
});

test("proposal decisions require exact reviewed bindings and reject identity injection", async () => {
  const { deps, calls } = setup();
  const path = ["projects", "abc", "proposals", "prop", "decisions"];
  deps.backend.decideProposal = async (...args) => { calls.push(args); return { status: "approved", application: "unavailable" }; };
  const input = { requestId: "review-1", action: "approve", expectedDigest: "a".repeat(64), expectedRevision: "revision_1" };
  assert.equal((await platformHttp(request(path.join("/"), input), path, deps)).status, 200);
  assert.deepEqual(calls[0], ["test-private-token", { projectId: "abc", proposalId: "prop", ...input }]);
  for (const invalid of [{ ...input, actor: "victim" }, { ...input, tenantId: "other" }, { ...input, expectedDigest: "bad" },
    { ...input, expectedRevision: "bad" }, { ...input, action: ["approve"] }, { ...input, command: {} }, { ...input, requestId: "" }]) {
    await expectCode(await platformHttp(request(path.join("/"), invalid), path, deps), 400, "INVALID_REQUEST");
  }
  await expectCode(await platformHttp(request(path.join("/"), input, "https://evil.example"), path, deps), 403, "FORBIDDEN");
  assert.equal(calls.length, 1);
});

test("proposal submission remains disconnected and no apply route exists", async () => {
  const { deps, calls } = setup();
  deps.backend.submitProposal = async (...args) => { calls.push(args); };
  await expectCode(await platformHttp(request("projects/abc/proposals", { requestId: "new-1" }), ["projects", "abc", "proposals"], deps), 409, "RUNNER_DISCONNECTED");
  assert.deepEqual(calls, [["test-private-token", "abc", "new-1"]]);
  await expectCode(await platformHttp(request("projects/abc/proposals", { requestId: "new-1", synthetic: true }), ["projects", "abc", "proposals"], deps), 400, "INVALID_REQUEST");
  await expectCode(await platformHttp(request("projects/abc/proposals/prop/apply", {}), ["projects", "abc", "proposals", "prop", "apply"], deps), 404, "NOT_FOUND");
});
