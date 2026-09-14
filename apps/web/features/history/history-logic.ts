import { ErrorEnvelopeSchema, HistoryCommandSchema, RequestOutcomeSchema, type ChangeReceipt, type HistoryCommand, type HistoryResponse } from "@stellar/contracts";

export type HistoryAction = "undo" | "redo";
export type PendingHistory = { command: HistoryCommand; status: "unknown" | "missing" };
export type HistoryOutcome = ChangeReceipt | "unchanged" | "pending" | "conflicted";
export type HistoryLookupScope = { projectId: string; sessionId: string; lookupRequestId: string; originalRequestId: string; action: HistoryAction };

/** The lookup envelope is scoped to this session; its receipt may predate a restart. */
export function historyOutcome(value: unknown, scope: HistoryLookupScope): HistoryOutcome | null {
  const parsed = RequestOutcomeSchema.safeParse(value);
  if (!parsed.success) return null;
  const result = parsed.data;
  if (result.projectId !== scope.projectId || result.sessionId !== scope.sessionId ||
    result.requestId !== scope.lookupRequestId || result.originalRequestId !== scope.originalRequestId ||
    result.operation !== scope.action) return null;
  if (result.status === "applied") {
    if (result.receipt.projectId !== scope.projectId || result.receipt.requestId !== scope.originalRequestId ||
      result.receipt.operation !== scope.action) return null;
    return result.receipt;
  }
  return result.status;
}

export function historyMissing(value: unknown, scope: HistoryLookupScope): boolean {
  const parsed = ErrorEnvelopeSchema.safeParse(value);
  return parsed.success && parsed.data.error.code === "UNKNOWN_TARGET" && parsed.data.projectId === scope.projectId &&
    parsed.data.sessionId === scope.sessionId && parsed.data.requestId === scope.lookupRequestId;
}

/** Return the exact original command or no retry capability. */
export function historyRetryCommand(pending: PendingHistory | null, context: {
  projectId: string; sessionId: string; sourceRevision: string; history: HistoryResponse | null; sessionReady: boolean;
}): HistoryCommand | null {
  if (!pending || pending.status !== "missing" || !context.sessionReady || !context.history) return null;
  const command = pending.command;
  return HistoryCommandSchema.safeParse(command).success && command.projectId === context.projectId && command.sessionId === context.sessionId &&
    command.expectedRevision === context.sourceRevision && command.expectedRevision === context.history.projectRevision &&
    context.history.projectId === context.projectId && context.history.sessionId === context.sessionId &&
    availableEntry(context.history, command.operation) === command.entryId ? command : null;
}
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
  if (command.type === "token.set") return "Shared token · base";
  return `${command.property} · ${command.scopeId}`;
}
