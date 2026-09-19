import type { ReviewAction, ReviewDecision } from "./types";

export type PendingReview = ReviewDecision & { proposalId: string };

export function reviewStorageKey(tenantId: string, actorSubject: string, projectId: string): string {
  return `stellar.proposal-review.v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(actorSubject)}:${encodeURIComponent(projectId)}`;
}

export function parsePendingReview(value: string | null): PendingReview | null {
  if (!value) return null;
  try {
    const pending: unknown = JSON.parse(value);
    if (!pending || typeof pending !== "object") return null;
    const p = pending as Record<string, unknown>;
    const action = p.action as ReviewAction;
    if (action !== "approve" && action !== "reject" && action !== "cancel") return null;
    if (typeof p.proposalId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(p.proposalId)) return null;
    if (typeof p.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(p.requestId)) return null;
    if (typeof p.expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(p.expectedDigest)) return null;
    if (typeof p.expectedRevision !== "string" || p.expectedRevision.length > 128 || !p.expectedRevision) return null;
    return { proposalId: p.proposalId, action, requestId: p.requestId, expectedDigest: p.expectedDigest, expectedRevision: p.expectedRevision };
  } catch { return null; }
}

export function reconciledPending(
  pending: PendingReview,
  decisionHistory: ReadonlyArray<{ action: ReviewAction; actorSubject: string; requestId: string }>,
  actorSubject: string,
): boolean {
  return decisionHistory.some((receipt) => receipt.action === pending.action &&
    receipt.requestId === pending.requestId && receipt.actorSubject === actorSubject);
}
