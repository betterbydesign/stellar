import "server-only";
import {
  CreateProjectRequestSchema, ApplyChangeSchema, ErrorEnvelopeSchema, HistoryCommandSchema, IdentifierSchema, makeError,
  OpenSessionRequestSchema, PrepareChangeSchema, PROTOCOL_VERSION,
  ReconcileRequestSchema, RequestScopeSchema,
  type ErrorCode,
} from "@stellar/contracts";
import { callRunner, type RunnerMethod } from "./runner-broker";
import { readLocalConfig } from "./local-config";
import { hasValidCsrf, isAllowedOrigin, isAppRequest, readOperator } from "./operator-auth";

type Scope = { projectId?: string; sessionId?: string; requestId?: string; pageId?: string };
const commonHeaders = {
  "cache-control": "no-store", "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: commonHeaders });
}
function error(scope: Scope, code: ErrorCode): Response {
  const envelope = makeError(scope, code);
  return json(envelope, envelope.error.httpStatus);
}
function result(value: unknown): Response {
  const failure = ErrorEnvelopeSchema.safeParse(value);
  return json(value, failure.success ? failure.data.error.httpStatus : 200);
}
function id(value: string | null | undefined): string | null {
  const parsed = IdentifierSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
async function body(request: Request): Promise<unknown | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  try {
    const raw = await request.text();
    return raw.length <= 65_536 ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Shared handler for the project route tree; every branch passes the same auth gate. */
export async function handleProjectApi(request: Request, segments: string[]): Promise<Response> {
  const config = readLocalConfig();
  if (!config) return error({}, "RUNNER_UNAVAILABLE");
  if (!isAppRequest(request, config)) return error({}, "FORBIDDEN");
  const mutation = request.method !== "GET";
  if (!isAllowedOrigin(request, config, mutation)) return error({}, "FORBIDDEN");
  const operator = readOperator(request, config);
  if (!operator) return error({}, "UNAUTHORIZED");
  if (mutation && !hasValidCsrf(request, operator)) return error({}, "FORBIDDEN");

  const url = new URL(request.url);
  const projectId = id(segments[0]);
  const sessionId = id(segments[2]);
  const requestId = id(url.searchParams.get("requestId"));
  const scope: Scope = { projectId: projectId ?? undefined, sessionId: sessionId ?? undefined, requestId: requestId ?? undefined };

  const invoke = async (method: RunnerMethod, params: Record<string, unknown>, callScope: Scope = scope) =>
    result(await callRunner(config, operator.id, method, params, callScope));
  const scopedQuery = () => {
    const parsed = RequestScopeSchema.safeParse({ protocolVersion: PROTOCOL_VERSION, projectId, sessionId, requestId });
    return parsed.success ? parsed.data : null;
  };

  if (segments.length === 0 && request.method === "GET") {
    if (!requestId) return error(scope, "INVALID_REQUEST");
    return invoke("listProjects", { requestId }, { requestId });
  }
  if (segments.length === 0 && request.method === "POST") {
    const parsed = CreateProjectRequestSchema.safeParse(await body(request));
    if (!parsed.success) return error(scope, "INVALID_REQUEST");
    return invoke("createProject", parsed.data, { requestId: parsed.data.requestId });
  }
  if (segments.length === 1 && segments[0] === "blueprints" && request.method === "GET") {
    if (!requestId) return error({ requestId: undefined }, "INVALID_REQUEST");
    return invoke("listBlueprints", { requestId }, { requestId });
  }
  if (!projectId) return error(scope, "INVALID_REQUEST");

  if (segments.length === 1 && request.method === "GET") {
    if (!requestId) return error(scope, "INVALID_REQUEST");
    return invoke("getProject", { projectId, requestId });
  }

  if (segments.length === 2 && segments[1] === "sessions" && request.method === "POST") {
    const parsed = OpenSessionRequestSchema.safeParse(await body(request));
    if (!parsed.success) return error(scope, "INVALID_REQUEST");
    if (parsed.data.projectId !== projectId) return error({ ...scope, requestId: parsed.data.requestId }, "INVALID_SCOPE");
    return invoke("openSession", parsed.data, { projectId, requestId: parsed.data.requestId });
  }

  if (!sessionId || segments[1] !== "sessions") return error(scope, "INVALID_REQUEST");

  if (segments.length === 3 && (request.method === "GET" || request.method === "DELETE")) {
    const parsed = scopedQuery();
    if (!parsed) return error(scope, "INVALID_REQUEST");
    return invoke(request.method === "GET" ? "getSession" : "closeSession", parsed);
  }
  if (segments.length === 4 && segments[3] === "restart" && request.method === "POST") {
    const parsed = RequestScopeSchema.safeParse(await body(request));
    if (!parsed.success) return error(scope, "INVALID_REQUEST");
    if (parsed.data.projectId !== projectId || parsed.data.sessionId !== sessionId)
      return error(parsed.data, "INVALID_SCOPE");
    return invoke("restartSession", parsed.data, parsed.data);
  }
  if (segments.length === 4 && request.method === "GET") {
    const parsed = scopedQuery();
    if (!parsed) return error(scope, "INVALID_REQUEST");
    if (segments[3] === "pages") return invoke("listPages", parsed);
    if (segments[3] === "history") return invoke("history", parsed);
    if (segments[3] === "source-model") {
      const pageId = id(url.searchParams.get("pageId"));
      if (!pageId) return error(scope, "INVALID_REQUEST");
      return invoke("sourceModel", { ...parsed, pageId }, { ...scope, pageId });
    }
  }
  if (segments.length === 4 && segments[3] === "history" && request.method === "POST") {
    const parsed = HistoryCommandSchema.safeParse(await body(request));
    if (!parsed.success) return error(scope, "INVALID_REQUEST");
    if (parsed.data.projectId !== projectId || parsed.data.sessionId !== sessionId) return error(parsed.data, "INVALID_SCOPE");
    return invoke("historyCommand", parsed.data, parsed.data);
  }
  if (segments.length === 5 && segments[3] === "changes" && request.method === "POST") {
    const method = segments[4] === "prepare" ? "prepareChange" : segments[4] === "apply" ? "applyChange" : null;
    if (!method) return error(scope, "INVALID_REQUEST");
    const parsed = (method === "prepareChange" ? PrepareChangeSchema : ApplyChangeSchema).safeParse(await body(request));
    if (!parsed.success) return error(scope, "INVALID_REQUEST");
    if (parsed.data.projectId !== projectId || parsed.data.sessionId !== sessionId)
      return error(parsed.data, "INVALID_SCOPE");
    return invoke(method, parsed.data, parsed.data);
  }
  if (segments.length === 6 && segments[3] === "changes" && segments[4] === "requests" && request.method === "GET") {
    const lookupRequestId = id(segments[5]);
    const parsed = ReconcileRequestSchema.safeParse({ ...scopedQuery(), lookupRequestId });
    if (!parsed.success) return error(scope, "INVALID_REQUEST");
    return invoke("requestOutcome", parsed.data);
  }
  return error(scope, "INVALID_REQUEST");
}
