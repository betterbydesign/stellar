import { ApplyChangeSchema, type ApplyChange, type SourceModel } from "@stellar/contracts";

const MAX_AGE_MS = 8 * 60 * 60 * 1000;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160;

/** An operation identity, never a cached source model or a browser write authority. */
export type PendingApplyMarker = {
  version: 1;
  createdAt: number;
  request: ApplyChange;
  pageId: string;
  targetId: string;
  anchor: string;
  kind: "local" | "token";
};

export async function pendingApplyKey(csrfToken: string, projectId: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csrfToken));
  const fingerprint = Array.from(new Uint8Array(bytes).slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `stellar.pending.apply.${fingerprint}.${projectId}`;
}

export function parsePendingApply(value: string | null, projectId: string, now = Date.now()): PendingApplyMarker | null {
  if (!value || value.length > 2048) return null;
  let input: unknown;
  try { input = JSON.parse(value); } catch { return null; }
  if (typeof input !== "object" || input === null) return null;
  const record = input as Record<string, unknown>;
  if (record.version !== 1 || typeof record.createdAt !== "number" || !Number.isSafeInteger(record.createdAt) ||
    record.createdAt > now ||
    !text(record.pageId) || !text(record.targetId) || !text(record.anchor) ||
    (record.kind !== "local" && record.kind !== "token")) return null;
  const request = ApplyChangeSchema.safeParse(record.request);
  if (!request.success || request.data.projectId !== projectId) return null;
  return { version: 1, createdAt: record.createdAt, request: request.data,
    pageId: record.pageId, targetId: record.targetId, anchor: record.anchor, kind: record.kind };
}

export function pendingApplyAgeExpired(marker: PendingApplyMarker, now = Date.now()): boolean {
  return now - marker.createdAt > MAX_AGE_MS;
}

/** Retry reuses the exact request only when fresh server source still matches its original scope. */
export function canRetryPendingApply(marker: PendingApplyMarker, scope: {
  projectId: string; sessionId: string; pageId: string; sourceRevision: string; model: SourceModel | null;
}): boolean {
  const { projectId, sessionId, pageId, sourceRevision, model } = scope;
  if (marker.request.projectId !== projectId || marker.request.sessionId !== sessionId ||
    marker.pageId !== pageId || marker.request.expectedRevision !== sourceRevision ||
    model?.projectId !== projectId || model.sessionId !== sessionId || model.pageId !== pageId ||
    model.projectRevision !== sourceRevision) return false;
  const element = model.targets.find((target) => target.kind === "element" && target.anchor === marker.anchor);
  if (!element || !element.editable) return false;
  if (element.kind !== "element") return false;
  if (marker.kind === "local") return element.targetId === marker.targetId;
  return element.linkedTokenTargetIds.includes(marker.targetId) &&
    model.targets.some((target) => target.kind === "token-definition" && target.targetId === marker.targetId && target.editable);
}
