/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { PROTOCOL_VERSION, SourceModelSchema, exampleElementTarget, exampleTokenTarget } = require("@stellar/contracts");
const { acceptFrameMessage, isFrameHello, previewOrigin } = require("../features/studio/bridge.ts");
const { installStudioBackGuard } = require("../features/studio/history-guard.ts");

const frameWindow = {};
const model = SourceModelSchema.parse({
  protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a", requestId: "model-a",
  pageId: "home", projectRevision: "revision-0001", targets: [exampleElementTarget, exampleTokenTarget],
});
const expected = {
  origin: "http://localhost:4567", frameWindow, projectId: "project-a", sessionId: "session-a",
  previewGeneration: "generation-a", frameId: "frame-a", pageId: "home",
  sourceRevision: "revision-0001", route: "/", model,
};
const selection = {
  protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a",
  previewGeneration: "generation-a", frameId: "frame-a", pageId: "home", sourceRevision: "revision-0001",
  type: "selection", payload: {
    sourceKey: exampleElementTarget.targetId, anchor: exampleElementTarget.anchor, occurrenceId: `${exampleElementTarget.anchor}:1`,
    geometry: { x: 11, y: 12, width: 55, height: 22 },
  },
};
const event = (data = selection, origin = expected.origin, source = frameWindow) => ({ data, origin, source });

test("current exact frame selection resolves only against current source model", () => {
  const result = acceptFrameMessage(event(), expected);
  assert.equal(result?.target?.targetId, exampleElementTarget.targetId);
  assert.equal(result?.envelope.type, "selection");
});

test("wrong origin, window, scope, route and stale revision cannot select", () => {
  assert.equal(acceptFrameMessage(event(selection, "http://evil.localhost:4567"), expected), null);
  assert.equal(acceptFrameMessage(event(selection, expected.origin, {}), expected), null);
  for (const key of ["projectId", "sessionId", "previewGeneration", "frameId", "pageId", "sourceRevision"]) {
    assert.equal(acceptFrameMessage(event({ ...selection, [key]: `${selection[key]}-old` }), expected), null, key);
  }
  assert.equal(acceptFrameMessage(event({ ...selection, type: "ready", payload: { route: "/contact/" } }), expected), null);
  assert.equal(acceptFrameMessage(event(), { ...expected, model: { ...model, projectRevision: "revision-0002" } }), null);
});

test("malformed frame payload and spoofed target cannot select", () => {
  assert.equal(acceptFrameMessage(event({ ...selection, payload: { ...selection.payload, sourceKey: "source-spoofed" } }), expected), null);
  assert.equal(acceptFrameMessage(event({ ...selection, payload: { ...selection.payload, anchor: "other-anchor" } }), expected), null);
  assert.equal(acceptFrameMessage(event({ ...selection, payload: { ...selection.payload, occurrenceId: `${selection.payload.anchor}:abc` } }), expected), null);
  assert.equal(acceptFrameMessage(event({ ...selection, payload: { ...selection.payload, path: "/etc/passwd" } }), expected), null);
  assert.equal(acceptFrameMessage(event({ ...selection, type: "apply" }), expected), null);
  assert.equal(acceptFrameMessage(event(null), expected), null);
});

test("hello only reveals a route from the exact frame", () => {
  const hello = { type: "stellar:hello", route: "/contact/" };
  assert.equal(isFrameHello(event(hello), expected.origin, frameWindow), "/contact/");
  assert.equal(isFrameHello(event(hello, "http://localhost:1111"), expected.origin, frameWindow), null);
  assert.equal(isFrameHello(event({ ...hello, route: "//evil/" }), expected.origin, frameWindow), null);
  assert.equal(isFrameHello(event({ ...hello, route: "/contact/?foo" }), expected.origin, frameWindow), null);
});

test("preview origin accepts only exact local preview hostname", () => {
  assert.equal(previewOrigin("http://localhost:4321/"), "http://localhost:4321");
  assert.equal(previewOrigin("http://127.0.0.1:4321/"), null);
  assert.equal(previewOrigin("https://localhost:4321/"), null);
  assert.equal(previewOrigin("http://user@localhost:4321/"), null);
  assert.equal(previewOrigin("http://localhost/"), null);
  assert.equal(previewOrigin("http://localhost:4321/?token=bad"), null);
});

function fakeBrowser(initialEntries) {
  const listeners = new Set();
  const entries = initialEntries.map((url) => ({ url, state: {} }));
  let position = entries.length - 1;
  const browser = {
    location: { href: entries[position].url },
    history: {
      get length() { return entries.length; },
      get state() { return entries[position].state; },
      pushState(state, _title, url) {
        entries.splice(position + 1);
        entries.push({ state, url });
        position = entries.length - 1;
        browser.location.href = url;
      },
      go(delta) {
        const next = position + delta;
        if (next < 0 || next >= entries.length) return;
        position = next;
        browser.location.href = entries[position].url;
        for (const listener of listeners) listener();
      },
      back() { this.go(-1); },
    },
    addEventListener(type, listener) { if (type === "popstate") listeners.add(listener); },
    removeEventListener(type, listener) { if (type === "popstate") listeners.delete(listener); },
  };
  return browser;
}

test("browser Back waits for dirty draft resolution and repeated Back cannot skip it", async () => {
  const browser = fakeBrowser(["http://127.0.0.1:3210/projects", "http://127.0.0.1:3210/projects/project-a/studio"]);
  let resolveDraft;
  let calls = 0;
  const cleanup = installStudioBackGuard(browser, () => {
    calls++;
    return new Promise((resolve) => { resolveDraft = resolve; });
  }, () => assert.fail("prior dashboard exists"));
  browser.history.back();
  browser.history.back();
  assert.equal(calls, 1);
  assert.equal(browser.location.href, "http://127.0.0.1:3210/projects/project-a/studio");
  resolveDraft(false); // Keep editing.
  await Promise.resolve();
  assert.equal(browser.location.href, "http://127.0.0.1:3210/projects/project-a/studio");
  browser.history.back();
  assert.equal(calls, 2);
  resolveDraft(true); // Apply or Discard.
  await Promise.resolve();
  assert.equal(browser.location.href, "http://127.0.0.1:3210/projects");
  cleanup();
});

test("browser Back from a deep link falls back to Projects after guard approval", async () => {
  const browser = fakeBrowser(["http://127.0.0.1:3210/projects/project-a/studio"]);
  let fallback = 0;
  const cleanup = installStudioBackGuard(browser, async () => true, () => { fallback++; });
  browser.history.back();
  await Promise.resolve();
  assert.equal(fallback, 1);
  cleanup();
});

test("remount and reload reuse the existing Studio sentinel", async () => {
  const browser = fakeBrowser(["http://127.0.0.1:3210/projects", "http://127.0.0.1:3210/projects/project-a/studio"]);
  const first = installStudioBackGuard(browser, async () => false, () => assert.fail("dashboard exists"));
  const lengthAfterFirstMount = browser.history.length;
  first();
  const second = installStudioBackGuard(browser, async () => true, () => assert.fail("dashboard exists"));
  assert.equal(browser.history.length, lengthAfterFirstMount);
  browser.history.back();
  await Promise.resolve();
  assert.equal(browser.location.href, "http://127.0.0.1:3210/projects");
  second();
});

test("deep-link remount retains fallback behavior instead of navigating to an unknown prior entry", async () => {
  const browser = fakeBrowser(["http://127.0.0.1:3210/projects/project-a/studio"]);
  const first = installStudioBackGuard(browser, async () => false, () => {});
  first();
  let fallback = 0;
  const second = installStudioBackGuard(browser, async () => true, () => { fallback++; });
  browser.history.back();
  await Promise.resolve();
  assert.equal(fallback, 1);
  second();
});

test("Keep editing then reload preserves the dashboard as the Back destination", async () => {
  const browser = fakeBrowser(["http://127.0.0.1:3210/projects", "http://127.0.0.1:3210/projects/project-a/studio"]);
  const first = installStudioBackGuard(browser, async () => false, () => assert.fail("dashboard exists"));
  browser.history.back();
  await Promise.resolve();
  first();
  const second = installStudioBackGuard(browser, async () => true, () => assert.fail("dashboard exists"));
  browser.history.back();
  await Promise.resolve();
  assert.equal(browser.location.href, "http://127.0.0.1:3210/projects");
  second();
});
