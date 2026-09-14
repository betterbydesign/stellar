import type {
  ApplyChangeResponse, ChangeProposal, ChangeReceipt, Command,
  ErrorEnvelope, PrepareChangeResponse, RequestOutcome,
} from "@stellar/contracts";

type ErrorDetail = ErrorEnvelope["error"];

export type EditPhase = "idle" | "draft" | "preparing" | "ready-to-apply" | "saving" |
  "saved" | "conflict" | "failed" | "uncertain" | "reconciling";

export type EditDraft = {
  contextKey: string;
  projectId: string;
  sessionId: string;
  pageId: string;
  anchor: string;
  targetId: string;
  expectedRevision: string;
  command: Command | null;
  validationError: string | null;
  description: string;
  kind: "local" | "token";
  tokenName?: string;
};

export type EditState = {
  phase: EditPhase;
  draft: EditDraft | null;
  prepareRequestId: string | null;
  proposal: ChangeProposal | null;
  applyRequestId: string | null;
  receipt: ChangeReceipt | null;
  receiptAnchor: string | null;
  issue: ErrorDetail | null;
  notice: string | null;
  version: number;
};

export const initialEditState: EditState = {
  phase: "idle", draft: null, prepareRequestId: null, proposal: null,
  applyRequestId: null, receipt: null, receiptAnchor: null, issue: null, notice: null, version: 0,
};

export type EditAction =
  | { type: "draft"; draft: EditDraft }
  | { type: "discard" }
  | { type: "prepare-start"; requestId: string; version: number }
  | { type: "prepare-result"; requestId: string; version: number; result: PrepareChangeResponse }
  | { type: "prepare-error"; requestId: string; version: number; error: ErrorDetail }
  | { type: "apply-start"; requestId: string; version: number }
  | { type: "apply-result"; requestId: string; version: number; result: ApplyChangeResponse }
  | { type: "apply-error"; requestId: string; version: number; error: ErrorDetail; uncertain: boolean }
  | { type: "reconcile-start"; version: number }
  | { type: "reconcile-result"; version: number; result: RequestOutcome }
  | { type: "reconcile-error"; version: number; error: ErrorDetail }
  | { type: "context-changed"; contextKey: string; revision: string };

export function hasPendingEdit(state: EditState): boolean {
  return state.draft !== null && state.phase !== "saved" && state.phase !== "idle";
}

/** State transitions ignore late prepare replies and retain an uncertain apply's request ID. */
export function transitionEdit(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "draft":
      if (["saving", "uncertain", "reconciling"].includes(state.phase)) return state;
      return { ...state, phase: "draft", draft: action.draft, prepareRequestId: null,
        proposal: null, applyRequestId: null, issue: null, notice: "Unsaved draft", version: state.version + 1 };
    case "discard":
      if (["saving", "uncertain", "reconciling"].includes(state.phase)) return state;
      return { ...state, phase: "idle", draft: null, prepareRequestId: null,
        proposal: null, applyRequestId: null, issue: null, notice: "Draft discarded.", version: state.version + 1 };
    case "prepare-start":
      if (!state.draft?.command || state.version !== action.version ||
        !["draft", "failed"].includes(state.phase)) return state;
      return { ...state, phase: "preparing", prepareRequestId: action.requestId,
        proposal: null, applyRequestId: null, issue: null, notice: "Checking source change…" };
    case "prepare-result":
      if (state.version !== action.version || state.phase !== "preparing" ||
        state.prepareRequestId !== action.requestId || !state.draft) return state;
      if (action.result.status === "ready") {
        if (action.result.proposal.targetId !== state.draft.targetId ||
          action.result.proposal.baseRevision !== state.draft.expectedRevision ||
          JSON.stringify(action.result.proposal.command) !== JSON.stringify(state.draft.command))
          return { ...state, phase: "conflict", proposal: null, notice: "Source changed. Review the current source before applying." };
        return { ...state, phase: "ready-to-apply", proposal: action.result.proposal,
          notice: "Ready to apply to source." };
      }
      if (action.result.status === "unchanged") {
        return { ...state, phase: "idle", draft: null, proposal: null, prepareRequestId: null,
          notice: "The source already has this value.", version: state.version + 1 };
      }
      return { ...state, phase: action.result.error.code === "STALE_REVISION" ? "conflict" : "failed",
        issue: action.result.error, proposal: null, notice: action.result.error.message };
    case "prepare-error":
      if (state.version !== action.version || state.phase !== "preparing" || state.prepareRequestId !== action.requestId) return state;
      return { ...state, phase: action.error.code === "STALE_REVISION" ? "conflict" : "failed",
        issue: action.error, notice: action.error.message };
    case "apply-start":
      if (state.version !== action.version || !state.proposal ||
        !(state.phase === "ready-to-apply" ||
          (state.phase === "uncertain" && state.applyRequestId === action.requestId))) return state;
      return { ...state, phase: "saving", applyRequestId: action.requestId, issue: null, notice: "Saving to source…" };
    case "apply-result":
      if (state.version !== action.version || state.applyRequestId !== action.requestId ||
        !["saving", "uncertain", "reconciling"].includes(state.phase)) return state;
      if (action.result.status === "applied") return { ...state, phase: "saved", draft: null,
        proposal: null, receipt: action.result.receipt, receiptAnchor: state.draft?.anchor ?? null, issue: null,
        notice: "Saved to source.", version: state.version + 1 };
      return { ...state, phase: "idle", draft: null, proposal: null, issue: null,
        notice: "The source already has this value.", version: state.version + 1 };
    case "apply-error":
      if (state.version !== action.version || state.applyRequestId !== action.requestId || state.phase !== "saving") return state;
      return { ...state, phase: action.uncertain ? "uncertain" :
        action.error.code === "STALE_REVISION" ? "conflict" : "failed", issue: action.error,
        notice: action.uncertain ? "Save outcome is unknown. Check the request before retrying." : action.error.message };
    case "reconcile-start":
      if (state.version !== action.version || state.phase !== "uncertain" || !state.applyRequestId) return state;
      return { ...state, phase: "reconciling", notice: "Checking saved result…" };
    case "reconcile-result":
      if (state.version !== action.version || state.phase !== "reconciling" ||
        state.applyRequestId !== action.result.originalRequestId) return state;
      if (action.result.status === "applied") return { ...state, phase: "saved", draft: null,
        proposal: null, receipt: action.result.receipt, receiptAnchor: state.draft?.anchor ?? null, issue: null,
        notice: "Saved to source. The original response was lost.", version: state.version + 1 };
      if (action.result.status === "unchanged") return { ...state, phase: "idle", draft: null,
        proposal: null, issue: null, notice: "No source change was needed.", version: state.version + 1 };
      if (action.result.status === "conflicted") return { ...state, phase: "conflict", issue: action.result.error,
        notice: action.result.error.message };
      return { ...state, phase: "uncertain", notice: "The save is still pending. Check again before retrying." };
    case "reconcile-error":
      if (state.version !== action.version || state.phase !== "reconciling") return state;
      return { ...state, phase: "uncertain", issue: action.error, notice: "Could not confirm the save yet. Check again." };
    case "context-changed":
      if (!state.draft || state.draft.contextKey === action.contextKey) return state;
      // A write may already have happened. Its receipt must still be observed
      // even if a reconnect changes the visible session while the call runs.
      if (["saving", "uncertain", "reconciling"].includes(state.phase)) return state;
      return { ...state, phase: "conflict", proposal: null,
        notice: state.draft.expectedRevision !== action.revision
          ? "Source changed. Review the current source before applying."
          : "Selection changed. Keep editing the original target or discard this draft." };
  }
}
