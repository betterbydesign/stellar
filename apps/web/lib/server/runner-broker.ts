import "server-only";
import {
  CreateProjectResponseSchema, ListBlueprintsResponseSchema, ApplyChangeResponseSchema, ErrorEnvelopeSchema, GetProjectResponseSchema,
  HistoryResponseSchema, ListPagesResponseSchema, ListProjectsResponseSchema,
  makeError, PrepareChangeResponseSchema, RequestOutcomeSchema,
  SessionResponseSchema, SourceModelSchema,
  type ErrorCode, type ErrorEnvelope,
} from "@stellar/contracts";
import { isSafePreviewUrl, type LocalConfig } from "./local-config";

export const RUNNER_METHODS = [
  "listBlueprints", "createProject", "listProjects", "getProject", "openSession", "getSession", "closeSession",
  "restartSession", "listPages", "sourceModel", "prepareChange", "applyChange",
  "requestOutcome", "history", "historyCommand",
] as const;
export type RunnerMethod = (typeof RUNNER_METHODS)[number];
type Scope = { projectId?: string; sessionId?: string; requestId?: string; pageId?: string };
type Parseable = { safeParse(input: unknown): { success: boolean; data?: unknown } };

const schemas: Record<RunnerMethod, Parseable> = {
  listBlueprints: ListBlueprintsResponseSchema,
  createProject: CreateProjectResponseSchema,
  listProjects: ListProjectsResponseSchema,
  getProject: GetProjectResponseSchema,
  openSession: SessionResponseSchema,
  getSession: SessionResponseSchema,
  closeSession: SessionResponseSchema,
  restartSession: SessionResponseSchema,
  listPages: ListPagesResponseSchema,
  sourceModel: SourceModelSchema,
  prepareChange: PrepareChangeResponseSchema,
  applyChange: ApplyChangeResponseSchema,
  requestOutcome: RequestOutcomeSchema,
  history: HistoryResponseSchema,
  historyCommand: ApplyChangeResponseSchema,
};

function safeResponse(value: unknown, method: RunnerMethod, config: LocalConfig, scope: Scope): unknown | null {
  const parsed = schemas[method].safeParse(value);
  if (!parsed.success || !parsed.data || typeof parsed.data !== "object") return null;
  const object = parsed.data as Record<string, unknown>;
  if (object.requestId !== scope.requestId ||
    (scope.projectId && object.projectId !== scope.projectId) ||
    (scope.sessionId && method !== "restartSession" && object.sessionId !== scope.sessionId) ||
    (scope.pageId && object.pageId !== scope.pageId)) return null;
  if (method === "listProjects") {
    // A browser is entitled only to the registry's safe project metadata.
    return parsed.data;
  }
  if (method === "getProject") return parsed.data;
  if (["openSession", "getSession", "closeSession", "restartSession"].includes(method)) {
    const session = object.session as Record<string, unknown>;
    if (!isSafePreviewUrl(session.previewUrl as string | null, config)) return null;
    if (session.state === "ready" && session.previewUrl === null) return null;
    const defaultStatusMessage: Record<string, string | null> = {
      registered: "Project is registered.", starting: "Starting the preview.",
      ready: null, failed: "Preview could not start. Retry the session.",
      stopped: "Preview is stopped.", reconnecting: "Reconnecting to the preview.",
    };
    const allowedStatusMessage: Record<string, readonly string[]> = {
      starting: ["Starting local preview…"],
      failed: [
        "Project dependencies are missing. Install the pinned fixture packages, then retry.",
        "The preview port is occupied. Stop the other process, then retry.",
        "The Astro preview did not compile. Fix the page source, then retry.",
        "The preview process stopped. Retry the session.",
        "The preview did not respond in time. Retry the session.",
        "The project source could not be read. Retry after checking the working copy.",
      ],
      stopped: ["Preview stopped. Source changes were kept."],
    };
    const state = session.state as string;
    const incomingMessage = session.statusMessage as string | null;
    const safeMessage = incomingMessage && allowedStatusMessage[state]?.includes(incomingMessage)
      ? incomingMessage : defaultStatusMessage[state] ?? null;
    return { ...object, session: {
      ...session,
      previewUrl: session.state === "ready" ? session.previewUrl : null,
      statusMessage: safeMessage,
    } };
  }
  if (method === "prepareChange") {
    if (object.status === "unchanged") return { ...object, reason: "No source change is needed." };
    if (object.status === "refused") return { ...object, error: makeError(scope, (object.error as { code: ErrorCode }).code).error };
  }
  if ((method === "applyChange" || method === "historyCommand") && object.status === "unchanged") {
    return { ...object, reason: "No source change is needed." };
  }
  if (method === "requestOutcome" && object.status === "conflicted") {
    return { ...object, error: makeError(scope, (object.error as { code: ErrorCode }).code).error };
  }
  return parsed.data;
}

/** Authenticated short call. Browser input never controls a runner URL or method. */
export async function callRunner(
  config: LocalConfig, operatorId: string, method: RunnerMethod,
  params: Record<string, unknown>, scope: Scope,
  transport: typeof fetch = fetch,
): Promise<unknown | ErrorEnvelope> {
  try {
    const response = await transport(`${config.runnerUrl}/rpc`, {
      method: "POST", redirect: "manual", cache: "no-store",
      headers: {
        authorization: `Bearer ${config.runnerSecret}`,
        "x-stellar-operator": operatorId,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400 ||
      !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return makeError(scope, "RUNNER_UNAVAILABLE");
    }
    const body = await response.text();
    if (body.length > 2_000_000) return makeError(scope, "RUNNER_UNAVAILABLE");
    const value: unknown = JSON.parse(body);
    const error = ErrorEnvelopeSchema.safeParse(value);
    if (error.success) {
      if (error.data.requestId !== scope.requestId ||
        (scope.projectId && error.data.projectId !== scope.projectId) ||
        (scope.sessionId && error.data.sessionId !== scope.sessionId)) return makeError(scope, "RUNNER_UNAVAILABLE");
      return makeError(scope, error.data.error.code);
    }
    if (response.status !== 200) return makeError(scope, "RUNNER_UNAVAILABLE");
    const safe = safeResponse(value, method, config, scope);
    if (method === "createProject" && safe && typeof safe === "object" && "workspace" in safe) {
      const created = safe.workspace as { project: { name: string; blueprint?: { id: string; version: number | string } } };
      if (created.project.name !== params.name || created.project.blueprint?.id !== params.blueprintId ||
        created.project.blueprint?.version !== params.blueprintVersion) return makeError(scope, "RUNNER_UNAVAILABLE");
    }
    if (safe && typeof safe === "object" && "status" in safe && safe.status === "applied" && "receipt" in safe) {
      const receipt = safe.receipt as { operation?: unknown };
      if (method === "applyChange" && receipt.operation !== "apply" ||
        method === "historyCommand" && receipt.operation !== params.operation) return makeError(scope, "RUNNER_UNAVAILABLE");
    }
    return safe ?? makeError(scope, "RUNNER_UNAVAILABLE");
  } catch {
    return makeError(scope, "RUNNER_UNAVAILABLE");
  }
}
