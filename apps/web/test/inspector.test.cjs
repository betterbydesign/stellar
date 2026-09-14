/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  exampleApplyResponse, exampleElementTarget, examplePrepareChange,
  examplePrepareResponse, exampleProposal, exampleReceipt, exampleTokenTarget,
} = require("@stellar/contracts");
const { initialEditState, transitionEdit } = require("../features/inspector/edit-state.ts");
const { parseLocalValue, parseTokenValue, isLocalCommandAllowed } = require("../features/inspector/values.ts");
const { applyEdit, EditApiError } = require("../features/inspector/edit-client.ts");

function draft(command = examplePrepareChange.command) {
  return {
    contextKey: "project-a|session-a|home|target-a|revision-0001|base",
    projectId: "project-a", sessionId: "session-a", pageId: "home", anchor: "home-primary-cta",
    targetId: exampleProposal.targetId, expectedRevision: exampleProposal.baseRevision,
    command, validationError: null, description: "Local style", kind: "local",
  };
}

test("local and concrete token controls reject invalid values before API calls", () => {
  const color = exampleElementTarget.controls.find((item) => item.valueType === "color");
  assert.ok(color);
  assert.equal(parseLocalValue(color, { mode: "literal", hex: "red", amount: "0", unit: "px", token: "" }).error,
    "Enter a 6- or 8-digit hex color.");
  const length = { ...color, property: "padding-inline", valueType: "length", min: 0, max: 64, allowedUnits: ["px", "rem"] };
  assert.ok(parseLocalValue(length, { mode: "literal", hex: "", amount: "99999", unit: "px", token: "" }).error);
  assert.ok(parseLocalValue(length, { mode: "literal", hex: "", amount: "8", unit: "em", token: "" }).error);
  assert.equal(parseLocalValue(color, { mode: "token", hex: "", amount: "", unit: "", token: "--unlisted" }).value, null);
  assert.equal(isLocalCommandAllowed(color, { type: "style.reset", property: color.property, scopeId: color.scopeId }),
    color.provenance === "override" && color.authoredValue !== null);
  const invalidToken = parseTokenValue(exampleTokenTarget, { hex: "#XYZXYZ", amount: "-1000", unit: "em" });
  assert.equal(invalidToken.command, null);
});

test("late prepare response cannot replace a changed draft or authorize a stale proposal", () => {
  let state = transitionEdit(initialEditState, { type: "draft", draft: draft() });
  const oldVersion = state.version;
  state = transitionEdit(state, { type: "prepare-start", requestId: "prepare-1", version: oldVersion });
  state = transitionEdit(state, { type: "draft", draft: { ...draft(), description: "New intent" } });
  assert.equal(state.phase, "draft");
  state = transitionEdit(state, { type: "prepare-result", requestId: "prepare-1", version: oldVersion,
    result: { ...examplePrepareResponse, requestId: "prepare-1" } });
  assert.equal(state.phase, "draft");
  assert.equal(state.proposal, null);
  state = transitionEdit(state, { type: "context-changed", contextKey: "project-b|session-b|home|other|revision-0002|base", revision: "revision-0002" });
  assert.equal(state.phase, "conflict");
  assert.equal(state.draft.description, "New intent");
});

test("uncertain apply preserves request identity and blocks new drafts or discard until reconciliation", () => {
  let state = transitionEdit(initialEditState, { type: "draft", draft: draft() });
  const version = state.version;
  state = transitionEdit(state, { type: "prepare-start", requestId: "prepare-1", version });
  state = transitionEdit(state, { type: "prepare-result", requestId: "prepare-1", version,
    result: { ...examplePrepareResponse, requestId: "prepare-1" } });
  assert.equal(state.phase, "ready-to-apply");
  state = transitionEdit(state, { type: "apply-start", requestId: "apply-1", version });
  state = transitionEdit(state, { type: "apply-error", requestId: "apply-1", version,
    error: { code: "RUNNER_UNAVAILABLE", httpStatus: 503, recoverable: true, message: "Runner unavailable" }, uncertain: true });
  assert.equal(state.phase, "uncertain");
  assert.equal(state.applyRequestId, "apply-1");
  assert.equal(transitionEdit(state, { type: "discard" }), state);
  assert.equal(transitionEdit(state, { type: "draft", draft: { ...draft(), description: "Other intent" } }), state);
  assert.equal(transitionEdit(state, { type: "apply-start", requestId: "apply-2", version }), state);
  state = transitionEdit(state, { type: "context-changed", contextKey: "new-session", revision: "revision-0001" });
  assert.equal(state.phase, "uncertain");
  state = transitionEdit(state, { type: "reconcile-start", version });
  state = transitionEdit(state, { type: "reconcile-result", version, result: {
    protocolVersion: "stellar.editor.v1", projectId: "project-a", sessionId: "session-b", requestId: "lookup-1",
    originalRequestId: "apply-1", operation: "apply", status: "applied",
    receipt: { ...exampleReceipt, requestId: "apply-1" },
  } });
  assert.equal(state.phase, "saved");
  assert.equal(state.receipt.requestId, "apply-1");
  assert.equal(state.draft, null);
});

test("malformed or mismatched apply response is uncertain after request dispatch", async () => {
  const priorWindow = global.window;
  const priorFetch = global.fetch;
  global.window = { sessionStorage: { getItem: () => "csrf-token", setItem: () => {} } };
  const request = { protocolVersion: "stellar.editor.v1", projectId: "project-a", sessionId: "session-a",
    requestId: "apply-1", proposalId: exampleProposal.proposalId, expectedRevision: exampleProposal.baseRevision };
  const calls = [];
  try {
    global.fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } });
    };
    await assert.rejects(applyEdit(request), (error) => error instanceof EditApiError && error.uncertain);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/changes\/apply$/);
    assert.equal(calls[0].init.headers["x-stellar-csrf"], "csrf-token");
    global.fetch = async () => Response.json({ ...exampleApplyResponse, requestId: "another-request" });
    await assert.rejects(applyEdit(request), (error) => error instanceof EditApiError && error.uncertain);
  } finally {
    global.window = priorWindow;
    global.fetch = priorFetch;
  }
});
