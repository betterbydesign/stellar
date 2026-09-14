/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { exampleHistory, exampleReceipt, makeError, PROTOCOL_VERSION } = require("@stellar/contracts");
const { availableEntry, changeLabel, historyOutcome, historyShortcut } = require("../features/history/history-logic.ts");

const shortcut = (key, overrides = {}) => ({ key, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false,
  defaultPrevented: false, target: null, ...overrides });

test("history shortcuts respect native editing and map platform redo", () => {
  assert.equal(historyShortcut(shortcut("z")), "undo");
  assert.equal(historyShortcut(shortcut("Z", { shiftKey: true })), "redo");
  assert.equal(historyShortcut(shortcut("y", { metaKey: false, ctrlKey: true })), "redo");
  assert.equal(historyShortcut(shortcut("z", { target: { closest: () => ({}) } })), null);
  assert.equal(historyShortcut(shortcut("z", { defaultPrevented: true })), null);
  assert.equal(historyShortcut(shortcut("z", { altKey: true })), null);
});

test("history controls use only server-designated visible stack entries", () => {
  assert.equal(availableEntry(exampleHistory, "undo"), "entry-0001");
  assert.equal(availableEntry(exampleHistory, "redo"), null);
  assert.equal(availableEntry({ ...exampleHistory, undoEntryId: "missing" }, "undo"), null);
  assert.equal(availableEntry({ ...exampleHistory, entries: exampleHistory.entries.map((entry) => ({ ...entry, state: "undone" })) }, "undo"), null);
  assert.equal(changeLabel(exampleHistory.entries[0]), "background-color · base");
  assert.equal(changeLabel({ ...exampleHistory.entries[0], command: { type: "token.set", value: { kind: "color", hex: "#123456" } } }), "Shared token · base");
});

test("history lookup accepts a prior-session receipt but rejects mismatched scope and missing outcomes", () => {
  const scope = { projectId: "project-a", sessionId: "new-session", lookupRequestId: "lookup-1",
    originalRequestId: "history-undo-1", action: "undo" };
  const outcome = { protocolVersion: PROTOCOL_VERSION, projectId: scope.projectId, sessionId: scope.sessionId,
    requestId: scope.lookupRequestId, originalRequestId: scope.originalRequestId, operation: scope.action, status: "applied",
    receipt: { ...exampleReceipt, sessionId: "old-session", requestId: scope.originalRequestId, operation: "undo",
      proposalId: null, oldRevision: "revision-0002", newRevision: "revision-0003" } };
  assert.deepEqual(historyOutcome(outcome, scope), outcome.receipt);
  assert.equal(historyOutcome({ ...outcome, receipt: { ...outcome.receipt, projectId: "project-b" } }, scope), null);
  assert.equal(historyOutcome({ ...outcome, receipt: { ...outcome.receipt, operation: "redo" } }, scope), null);
  assert.equal(historyOutcome({ ...outcome, originalRequestId: "another-request" }, scope), null);
  assert.equal(historyOutcome({ ...outcome, sessionId: "another-session" }, scope), null);
  assert.equal(historyOutcome(makeError({ projectId: scope.projectId, sessionId: scope.sessionId,
    requestId: scope.lookupRequestId }, "UNKNOWN_TARGET"), scope), null);
});
