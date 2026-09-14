/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { PROTOCOL_VERSION, SourceModelSchema, exampleElementTarget, exampleTokenTarget } = require("@stellar/contracts");
const { acceptFrameMessage, isFrameHello, previewOrigin } = require("../features/studio/bridge.ts");

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
