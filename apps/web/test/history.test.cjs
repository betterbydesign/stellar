/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { exampleHistory, exampleReceipt, makeError, PROTOCOL_VERSION } = require("@stellar/contracts");
const { availableEntry, changeLabel, definiteHistoryRefusal, historyMissing, historyOutcome, historyPendingKey,
  historyRetryCommand, historyShortcut, parsePendingHistory, serializePendingHistory } = require("../features/history/history-logic.ts");

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
  assert.equal(historyMissing(makeError({ projectId: scope.projectId, sessionId: scope.sessionId,
    requestId: scope.lookupRequestId }, "UNKNOWN_TARGET"), scope), true);
  assert.equal(historyMissing(makeError({ projectId: "project-b", sessionId: scope.sessionId,
    requestId: scope.lookupRequestId }, "UNKNOWN_TARGET"), scope), false);
  assert.equal(historyMissing(makeError({ projectId: scope.projectId, sessionId: scope.sessionId,
    requestId: "other-lookup" }, "UNKNOWN_TARGET"), scope), false);
});

test("missing history may retry only the original command in the same session, revision, and stack position", () => {
  const command = { protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a",
    requestId: "history-undo-1", operation: "undo", entryId: "entry-0001", expectedRevision: "revision-0002" };
  const pending = { command, status: "missing", createdAt: Date.now() };
  const context = { projectId: "project-a", sessionId: "session-a", sourceRevision: "revision-0002",
    history: exampleHistory, sessionReady: true };
  assert.equal(historyRetryCommand(pending, context), command);
  assert.equal(historyRetryCommand({ ...pending, status: "unknown" }, context), null);
  assert.equal(historyRetryCommand(pending, { ...context, sessionId: "new-session" }), null);
  assert.equal(historyRetryCommand(pending, { ...context, sourceRevision: "revision-0003" }), null);
  assert.equal(historyRetryCommand(pending, { ...context, history: { ...exampleHistory, undoEntryId: null, canUndo: false } }), null);
  assert.equal(historyRetryCommand({ ...pending, command: { ...command, entryId: "another-entry" } }, context), null);
});

test("all 5xx history responses retain the original request for reconciliation", () => {
  const command = { protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a",
    requestId: "history-undo-1", operation: "undo", entryId: "entry-0001", expectedRevision: "revision-0002" };
  assert.equal(definiteHistoryRefusal(makeError(command, "NOT_READY"), 503, command), null);
  assert.equal(definiteHistoryRefusal(makeError(command, "RUNNER_UNAVAILABLE"), 503, command), null);
  assert.equal(definiteHistoryRefusal(makeError(command, "STALE_REVISION"), 503, command), null);
  assert.equal(definiteHistoryRefusal(makeError({ ...command, requestId: "other-request" }, "STALE_REVISION"), 409, command), null);
  assert.equal(definiteHistoryRefusal(makeError(command, "STALE_REVISION"), 409, command)?.code, "STALE_REVISION");
});

test("pending history marker persists only scoped command metadata and rejects stale or malformed state", async () => {
  const command = { protocolVersion: PROTOCOL_VERSION, projectId: "project-a", sessionId: "session-a",
    requestId: "history-undo-1", operation: "undo", entryId: "entry-0001", expectedRevision: "revision-0002" };
  const marker = { command, status: "unknown", createdAt: 1_000_000 };
  const encoded = serializePendingHistory(marker);
  assert.deepEqual(parsePendingHistory(JSON.parse(encoded), 1_000_001), marker);
  assert.equal(encoded.includes("sourcePatch"), false);
  assert.equal(encoded.includes("csrf"), false);
  assert.equal(parsePendingHistory(JSON.parse(encoded), 1_000_000 + 8 * 60 * 60 * 1000 + 1), null);
  assert.equal(parsePendingHistory({ ...JSON.parse(encoded), command: { ...command, entryId: "../bad" } }, 1_000_001), null);
  const key = await historyPendingKey("project-a", "operator-token-one");
  assert.notEqual(key, await historyPendingKey("project-a", "operator-token-two"));
  assert.notEqual(key, await historyPendingKey("project-b", "operator-token-one"));
  assert.equal(key.includes("operator-token-one"), false);
});
