import type { HistoryResponse } from "@stellar/contracts";

export type HistoryAction = "undo" | "redo";
type Shortcut = {
  key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean;
  defaultPrevented: boolean; target: EventTarget | null;
};

/** Global source history never intercepts native text-field undo. */
export function historyShortcut(event: Shortcut): HistoryAction | null {
  if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey)) return null;
  const target = event.target;
  if (target && "closest" in target && typeof target.closest === "function" &&
    target.closest("input, textarea, select, [contenteditable], [role='textbox']")) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) return "redo";
  return null;
}

export function availableEntry(history: HistoryResponse | null, action: HistoryAction): string | null {
  if (!history) return null;
  const id = action === "undo" ? history.undoEntryId : history.redoEntryId;
  const enabled = action === "undo" ? history.canUndo : history.canRedo;
  const state = action === "undo" ? "applied" : "undone";
  return enabled && id && history.entries.some((entry) => entry.entryId === id && entry.state === state) ? id : null;
}

export function changeLabel(entry: HistoryResponse["entries"][number]): string {
  const command = entry.command;
  if (command.type === "token.set") return "Shared token";
  return `${command.property} · ${command.scopeId}`;
}
