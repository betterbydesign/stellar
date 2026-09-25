import { editorApiBase, editorSessionEndpoint, editorCsrfKey, freshEditorCsrf } from "../studio/endpoints";
import {
  ApplyChangeResponseSchema, ErrorEnvelopeSchema, PrepareChangeResponseSchema,
  RequestOutcomeSchema, type ApplyChange, type ApplyChangeResponse,
  type ErrorEnvelope, type PrepareChange, type PrepareChangeResponse,
  type RequestOutcome,
} from "@stellar/contracts";

type Parser<T> = { safeParse(input: unknown): { success: boolean; data?: T } };
type ErrorDetail = ErrorEnvelope["error"];

export class EditApiError extends Error {
  constructor(public readonly detail: ErrorDetail, public readonly uncertain = false) {
    super(detail.message);
    this.name = "EditApiError";
  }
}

const unavailable: ErrorDetail = {
  code: "RUNNER_UNAVAILABLE", httpStatus: 503, recoverable: true,
  message: "The local runner is unavailable.",
};
const invalid: ErrorDetail = {
  code: "INVALID_REQUEST", httpStatus: 400, recoverable: false,
  message: "The editor received an invalid response.",
};

export function newRequestId(): string {
  return `req-${globalThis.crypto.randomUUID()}`;
}

function prefix(projectId: string, sessionId: string): string {
  return `${editorApiBase()}/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`;
}

async function csrfToken(): Promise<string> {
  const saved = await freshEditorCsrf();
  if (saved) return saved;
  const response = await fetch(editorSessionEndpoint(), { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new EditApiError(unavailable);
  const value = await response.json() as { csrfToken?: unknown };
  if (typeof value.csrfToken !== "string" || !value.csrfToken) throw new EditApiError(invalid);
  window.sessionStorage.setItem(editorCsrfKey(), value.csrfToken);
  return value.csrfToken;
}

async function requestJson<T>(url: string, parser: Parser<T>, options: RequestInit, ambiguous = false,
  expectedScope?: { projectId: string; sessionId: string; requestId: string }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
  } catch {
    throw new EditApiError(unavailable, true);
  }
  let input: unknown;
  try { input = await response.json(); }
  catch { throw new EditApiError(unavailable, true); }
  const error = ErrorEnvelopeSchema.safeParse(input);
  if (error.success) {
    if (response.status !== error.data.error.httpStatus) throw new EditApiError(invalid, ambiguous);
    if (expectedScope && (error.data.projectId !== expectedScope.projectId ||
      error.data.sessionId !== expectedScope.sessionId || error.data.requestId !== expectedScope.requestId))
      throw new EditApiError(invalid);
    throw new EditApiError(error.data.error,
      ambiguous && (response.status >= 500 || error.data.error.code === "RUNNER_UNAVAILABLE"));
  }
  const parsed = parser.safeParse(input);
  if (!response.ok || !parsed.success || !parsed.data) throw new EditApiError(invalid, ambiguous);
  return parsed.data;
}

async function post<T>(url: string, input: object, parser: Parser<T>, ambiguous = false): Promise<T> {
  const csrf = await csrfToken();
  return requestJson(url, parser, {
    method: "POST", headers: { "content-type": "application/json", "x-stellar-csrf": csrf },
    body: JSON.stringify(input),
  }, ambiguous);
}

export function prepareEdit(request: PrepareChange): Promise<PrepareChangeResponse> {
  return post(`${prefix(request.projectId, request.sessionId)}/changes/prepare`, request, PrepareChangeResponseSchema)
    .then((response) => {
      if (response.projectId !== request.projectId || response.sessionId !== request.sessionId ||
        response.requestId !== request.requestId) throw new EditApiError(invalid);
      return response;
    });
}

export function applyEdit(request: ApplyChange): Promise<ApplyChangeResponse> {
  return post(`${prefix(request.projectId, request.sessionId)}/changes/apply`, request, ApplyChangeResponseSchema, true)
    .then((response) => {
      if (response.projectId !== request.projectId || response.sessionId !== request.sessionId ||
        response.requestId !== request.requestId) throw new EditApiError(invalid, true);
      return response;
    });
}

export function lookupEdit(projectId: string, sessionId: string, originalRequestId: string): Promise<RequestOutcome> {
  const requestId = newRequestId();
  const url = `${prefix(projectId, sessionId)}/changes/requests/${encodeURIComponent(originalRequestId)}?requestId=${encodeURIComponent(requestId)}`;
  return requestJson(url, RequestOutcomeSchema, { method: "GET" }, false,
    { projectId, sessionId, requestId }).then((response) => {
    if (response.projectId !== projectId || response.sessionId !== sessionId ||
      response.requestId !== requestId || response.originalRequestId !== originalRequestId)
      throw new EditApiError(invalid);
    return response;
  });
}
