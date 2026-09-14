import { PreviewEnvelopeSchema, type ElementSourceTarget, type PreviewEnvelope, type SourceModel } from "@stellar/contracts";

export type BridgeContext = {
  origin: string;
  frameWindow: Window | null;
  projectId: string;
  sessionId: string;
  previewGeneration: string;
  frameId: string;
  pageId: string;
  sourceRevision: string;
  route: string;
  model: SourceModel | null;
};

export type AcceptedFrameMessage = { envelope: PreviewEnvelope; target: ElementSourceTarget | null };

/** A frame reports DOM observations; only this current server model can supply a target. */
export function acceptFrameMessage(event: Pick<MessageEvent, "origin" | "source" | "data">, expected: BridgeContext): AcceptedFrameMessage | null {
  if (event.origin !== expected.origin || event.source !== expected.frameWindow || !expected.frameWindow) return null;
  const parsed = PreviewEnvelopeSchema.safeParse(event.data);
  if (!parsed.success) return null;
  const envelope = parsed.data;
  if (envelope.projectId !== expected.projectId || envelope.sessionId !== expected.sessionId ||
    envelope.previewGeneration !== expected.previewGeneration || envelope.frameId !== expected.frameId ||
    envelope.pageId !== expected.pageId || envelope.sourceRevision !== expected.sourceRevision) return null;
  if (envelope.type === "ready" && envelope.payload.route !== expected.route) return null;
  if (envelope.type === "selection") {
    const model = expected.model;
    if (!model || model.projectId !== expected.projectId || model.sessionId !== expected.sessionId ||
      model.pageId !== expected.pageId || model.projectRevision !== expected.sourceRevision) return null;
    const target = model.targets.find((item): item is ElementSourceTarget =>
      item.kind === "element" && item.targetId === envelope.payload.sourceKey && item.anchor === envelope.payload.anchor && item.pageId === expected.pageId);
    if (!target || !new RegExp(`^${target.anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:([1-9][0-9]{0,3})$`).test(envelope.payload.occurrenceId)) return null;
    return { envelope, target };
  }
  return { envelope, target: null };
}

export function previewOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && parsed.hostname === "localhost" && parsed.port !== "" &&
      parsed.username === "" && parsed.password === "" && parsed.pathname === "/" && !parsed.search && !parsed.hash
      ? parsed.origin : null;
  } catch { return null; }
}

export function isFrameHello(event: Pick<MessageEvent, "origin" | "source" | "data">, origin: string, frameWindow: Window | null): string | null {
  if (!frameWindow || event.source !== frameWindow || event.origin !== origin ||
    !event.data || typeof event.data !== "object" || event.data.type !== "stellar:hello") return null;
  const route = event.data.route;
  return typeof route === "string" && /^\/(?:[a-z0-9-]+\/)*$/.test(route) ? route : null;
}
