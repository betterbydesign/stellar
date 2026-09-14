/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { exampleHistory } = require("@stellar/contracts");
const { availableEntry, changeLabel, historyShortcut } = require("../features/history/history-logic.ts");

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
});
