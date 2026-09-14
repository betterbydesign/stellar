"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApplyChangeResponseSchema, ErrorEnvelopeSchema, HistoryResponseSchema, PROTOCOL_VERSION, RequestOutcomeSchema,
  type ChangeReceipt, type HistoryResponse,
} from "@stellar/contracts";
import { availableEntry, changeLabel, historyShortcut, type HistoryAction } from "./history-logic";
import styles from "./history.module.css";

export type HistoryControlsProps = {
  projectId: string; sessionId: string; sourceRevision: string; previewGeneration: string; sessionReady: boolean;
  onMutationStart?: () => boolean | Promise<boolean>;
  onOperationStateChange?: (blocked: boolean) => void;
  onReceipt: (receipt: ChangeReceipt) => void;
};

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const summary = (value: string | undefined) => value || "Value unavailable";

export function HistoryControls({ projectId, sessionId, sourceRevision, previewGeneration, sessionReady, onMutationStart, onOperationStateChange, onReceipt }: HistoryControlsProps) {
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ requestId: string; action: HistoryAction } | null>(null);
  const inFlight = useRef(false);
  const refreshSequence = useRef(0);
  const [operationBlocked, setOperationBlocked] = useState(false);
  const base = `/api/projects/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++refreshSequence.current;
    const requestId = newId("history-read");
    const response = await fetch(`${base}/history?requestId=${requestId}`, {
      credentials: "same-origin", cache: "no-store", signal,
    });
    const value: unknown = await response.json();
    const parsed = HistoryResponseSchema.safeParse(value);
    if (!response.ok || !parsed.success || parsed.data.projectId !== projectId || parsed.data.sessionId !== sessionId || parsed.data.requestId !== requestId)
      throw new Error("Recent changes could not be loaded. Reload and review the project.");
    if (signal?.aborted || sequence !== refreshSequence.current) return parsed.data;
    setHistory(parsed.data);
    setNotice("");
    return parsed.data;
  }, [base, projectId, sessionId]);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = refreshSequence;
    void refresh(controller.signal).catch((failure: unknown) => {
      if (!controller.signal.aborted) setNotice(failure instanceof Error ? failure.message : "Recent changes could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const onFocus = () => { void refresh().catch(() => setNotice("Recent changes could not be refreshed. Reload and review the project.")); };
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); sequence.current++; window.removeEventListener("focus", onFocus); };
  }, [refresh, sourceRevision, previewGeneration]);

  useEffect(() => { onOperationStateChange?.(operationBlocked || !!pending); }, [onOperationStateChange, operationBlocked, pending]);

  const reconcile = useCallback(async (requestId: string, action: HistoryAction): Promise<ChangeReceipt | "unchanged" | "pending" | "conflicted"> => {
    const lookup = newId("history-lookup");
    const response = await fetch(`${base}/changes/requests/${encodeURIComponent(requestId)}?requestId=${lookup}`, {
      credentials: "same-origin", cache: "no-store",
    });
    const value: unknown = await response.json();
    const failure = ErrorEnvelopeSchema.safeParse(value);
    if (failure.success && failure.data.error.code === "UNKNOWN_TARGET" && failure.data.projectId === projectId &&
      failure.data.sessionId === sessionId && failure.data.requestId === lookup) return "unchanged";
    const parsed = RequestOutcomeSchema.safeParse(value);
    if (!response.ok || !parsed.success || parsed.data.projectId !== projectId || parsed.data.sessionId !== sessionId ||
      parsed.data.requestId !== lookup || parsed.data.originalRequestId !== requestId || parsed.data.operation !== action)
      throw new Error("The save result is unknown. Check it again before editing.");
    if (parsed.data.status === "applied" && (parsed.data.receipt.sessionId !== sessionId || parsed.data.receipt.operation !== action))
      throw new Error("The save result is unknown. Check it again before editing.");
    if (parsed.data.status === "applied") return parsed.data.receipt;
    if (parsed.data.status === "unchanged") return "unchanged";
    if (parsed.data.status === "conflicted") return "conflicted";
    return "pending";
  }, [base, projectId, sessionId]);

  const acceptReceipt = useCallback(async (receipt: ChangeReceipt) => {
    setPending(null);
    try { onReceipt(receipt); }
    catch { setNotice("The source was saved. Reload the preview to see the latest result."); }
    try { await refresh(); }
    catch { setNotice("The source was saved. Recent changes could not be refreshed."); }
  }, [onReceipt, refresh]);

  const run = useCallback(async (action: HistoryAction) => {
    if (inFlight.current || !history || pending || !sessionReady || history.projectRevision !== sourceRevision) return;
    const entryId = availableEntry(history, action);
    if (!entryId) return;
    inFlight.current = true;
    setBusy(true);
    setNotice("");
    let requestId: string | null = null;
    let unresolved = false;
    try {
      if (onMutationStart && await onMutationStart() === false) return;
      setOperationBlocked(true);
      onOperationStateChange?.(true);
      const csrf = window.sessionStorage.getItem("stellar.csrf");
      if (!csrf) { setNotice("Reconnect the local operator before changing source."); return; }
      requestId = newId(`history-${action}`);
      const response = await fetch(`${base}/history`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json", "x-stellar-csrf": csrf },
        body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, projectId, sessionId, requestId,
          operation: action, entryId, expectedRevision: history.projectRevision }),
      });
      const value: unknown = await response.json();
      const failure = ErrorEnvelopeSchema.safeParse(value);
      if (failure.success && failure.data.error.code !== "RUNNER_UNAVAILABLE") {
        setNotice(failure.data.error.code === "STALE_REVISION" || failure.data.error.code === "HISTORY_CONFLICT"
          ? "The project changed. Reload and review recent changes before retrying."
          : failure.data.error.message);
        void refresh().catch(() => setNotice("The project changed. Reload and review recent changes before retrying."));
        return;
      }
      const result = ApplyChangeResponseSchema.safeParse(value);
      if (!response.ok || !result.success || result.data.projectId !== projectId || result.data.sessionId !== sessionId ||
        result.data.requestId !== requestId || result.data.status === "applied" &&
        (result.data.receipt.operation !== action || result.data.receipt.oldRevision !== history.projectRevision))
        throw new Error("The save result is unknown. Check it before editing again.");
      if (result.data.status === "applied") await acceptReceipt(result.data.receipt);
      else { setNotice("No source change was needed."); void refresh().catch(() => {}); }
    } catch {
      // A lost response can follow a durable write. Reconcile the operation ID
      // before offering another source mutation.
      if (requestId) {
        unresolved = true;
        setPending({ requestId, action });
        try {
          const result = await reconcile(requestId, action);
          if (typeof result === "object") { await acceptReceipt(result); unresolved = false; }
          else if (result === "unchanged" || result === "conflicted") {
            unresolved = false;
            setPending(null);
            setNotice(result === "conflicted" ? "The source changed. Reload and review recent changes." : "No source change was made.");
            void refresh().catch(() => {});
          } else setNotice("The change is still pending. Check again before editing.");
        } catch { setNotice("The save result is unknown. Check again before editing."); }
      } else setNotice("The save result is unknown. Reload recent changes before editing again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setOperationBlocked(false);
      if (!unresolved) onOperationStateChange?.(false);
    }
  }, [history, pending, sessionReady, sourceRevision, onMutationStart, onOperationStateChange, base, projectId, sessionId, acceptReceipt, refresh, reconcile]);

  const checkPending = useCallback(async () => {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await reconcile(pending.requestId, pending.action);
      if (typeof result === "object") await acceptReceipt(result);
      else if (result === "pending") setNotice("The change is still pending. Check again before editing.");
      else {
        setPending(null);
        setNotice(result === "conflicted" ? "The source changed. Reload and review recent changes." : "No source change was made.");
        await refresh();
      }
    } catch { setNotice("The save result is unknown. Check again before editing."); }
    finally { inFlight.current = false; setBusy(false); }
  }, [pending, reconcile, acceptReceipt, refresh]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = historyShortcut(event);
      if (action && !busy && !pending && sessionReady && history?.projectRevision === sourceRevision && availableEntry(history, action)) {
        event.preventDefault();
        void run(action);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [history, busy, pending, sessionReady, sourceRevision, run]);

  const undoId = history?.projectRevision === sourceRevision ? availableEntry(history, "undo") : null;
  const redoId = history?.projectRevision === sourceRevision ? availableEntry(history, "redo") : null;
  const disabledReason = loading ? "Loading recent changes" : pending ? "Check the pending save first" :
    !history ? "Recent changes unavailable" : "No available change";
  return <div className={styles.root} aria-label="Source history">
    <div className={styles.actions}>
      <button type="button" onClick={() => void run("undo")} disabled={busy || !undoId || !!pending || !sessionReady}
        title={undoId ? "Undo source change" : disabledReason} aria-label="Undo source change">Undo</button>
      <button type="button" onClick={() => void run("redo")} disabled={busy || !redoId || !!pending || !sessionReady}
        title={redoId ? "Redo source change" : disabledReason} aria-label="Redo source change">Redo</button>
      <details className={styles.details}>
        <summary>Recent changes</summary>
        <div className={styles.panel}>
          <p className={styles.revision}>Revision {history?.projectRevision.slice(0, 12) ?? "loading"}</p>
          {history?.entries.length ? <ol className={styles.list}>{history.entries.slice(-6).reverse().map((entry) => <li key={entry.entryId}>
            <strong>{changeLabel(entry)}</strong><span>{entry.state}</span>
            <small>{entry.receipt.changedFile} · {entry.impact.anchors.join(", ")}</small>
            <small>{summary(entry.display?.before)} → {summary(entry.display?.after)}</small>
            <time dateTime={entry.display?.timestamp}>{entry.display?.timestamp ? new Date(entry.display.timestamp).toLocaleString() : "Time unavailable"}</time>
          </li>)}</ol> : <p>No saved source changes yet.</p>}
        </div>
      </details>
      {pending && <button type="button" disabled={busy} onClick={() => void checkPending()}>Check save</button>}
    </div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </div>;
}
