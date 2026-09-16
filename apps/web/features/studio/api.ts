import {
  CreateProjectRequestSchema, CreateProjectResponseSchema, ErrorEnvelopeSchema,
  GetProjectResponseSchema, ListBlueprintsResponseSchema, ListPagesResponseSchema,
  ListProjectsResponseSchema, PROTOCOL_VERSION, SessionResponseSchema, SourceModelSchema,
  type BlueprintCatalogEntry, type CreateProjectRequest, type CreateProjectResponse,
  type Page, type RegisteredWorkspace, type Session, type SourceModel,
} from "@stellar/contracts";

export class StudioApiError extends Error {
  constructor(message: string, readonly code: string, readonly recoverable: boolean) { super(message); }
}

export const requestId = () => `web-${crypto.randomUUID()}`;

async function responseData(response: Response): Promise<unknown> {
  let value: unknown;
  try { value = await response.json(); } catch { throw new StudioApiError("The local workspace returned an unreadable response.", "INVALID_RESPONSE", true); }
  const failure = ErrorEnvelopeSchema.safeParse(value);
  if (failure.success) throw new StudioApiError(failure.data.error.message, failure.data.error.code, failure.data.error.recoverable);
  if (!response.ok) throw new StudioApiError("The local workspace could not complete this request.", "HTTP_ERROR", true);
  return value;
}

const endpoint = (path: string, id = requestId()) => `/api/projects${path}${path.includes("?") ? "&" : "?"}requestId=${encodeURIComponent(id)}`;
async function csrf(): Promise<string> {
  const saved = window.sessionStorage.getItem("stellar.csrf");
  if (saved) return saved;
  const response = await fetch("/api/operator/session", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new StudioApiError("Connect to the local workspace before changing a session.", "UNAUTHORIZED", true);
  const value = await response.json() as { csrfToken?: unknown };
  if (typeof value.csrfToken !== "string" || !value.csrfToken) throw new StudioApiError("The local connection is unavailable.", "UNAUTHORIZED", true);
  window.sessionStorage.setItem("stellar.csrf", value.csrfToken);
  return value.csrfToken;
}
const mutation = async (path: string, method: "POST" | "DELETE", body?: Record<string, unknown>, id?: string) => responseData(await fetch(endpoint(path, id), {
  method, credentials: "same-origin", cache: "no-store",
  headers: { "content-type": "application/json", "x-stellar-csrf": await csrf() },
  ...(body ? { body: JSON.stringify(body) } : {}),
}));

export async function listProjects(signal?: AbortSignal): Promise<RegisteredWorkspace[]> {
  const value = await responseData(await fetch(endpoint(""), { credentials: "same-origin", cache: "no-store", signal }));
  return ListProjectsResponseSchema.parse(value).projects;
}

export async function listBlueprints(signal?: AbortSignal): Promise<BlueprintCatalogEntry[]> {
  const value = await responseData(await fetch(endpoint("/blueprints"), { credentials: "same-origin", cache: "no-store", signal }));
  return ListBlueprintsResponseSchema.parse(value).blueprints;
}

export async function createProject(input: CreateProjectRequest): Promise<CreateProjectResponse> {
  const request = CreateProjectRequestSchema.parse(input);
  try {
    const value = await mutation("", "POST", request, request.requestId);
    return CreateProjectResponseSchema.parse(value);
  } catch (cause) {
    if (cause instanceof StudioApiError) throw cause;
    throw new StudioApiError("The project may have been created, but Stellar could not confirm it. Retry to check the same request safely.", "UNCERTAIN_RESULT", true);
  }
}

export async function getProject(projectId: string, signal?: AbortSignal): Promise<RegisteredWorkspace> {
  const value = await responseData(await fetch(endpoint(`/${encodeURIComponent(projectId)}`), { credentials: "same-origin", cache: "no-store", signal }));
  return GetProjectResponseSchema.parse(value).workspace;
}

export async function openSession(projectId: string): Promise<Session> {
  const value = await mutation(`/${encodeURIComponent(projectId)}/sessions`, "POST", { protocolVersion: PROTOCOL_VERSION, projectId, requestId: requestId() });
  return SessionResponseSchema.parse(value).session;
}

export async function getSession(projectId: string, sessionId: string): Promise<Session> {
  const value = await responseData(await fetch(endpoint(`/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`), { credentials: "same-origin", cache: "no-store" }));
  return SessionResponseSchema.parse(value).session;
}

export async function restartSession(projectId: string, sessionId: string): Promise<Session> {
  const value = await mutation(`/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/restart`, "POST", {
    protocolVersion: PROTOCOL_VERSION, projectId, sessionId, requestId: requestId(),
  });
  return SessionResponseSchema.parse(value).session;
}

export async function closeSession(projectId: string, sessionId: string): Promise<Session> {
  const value = await mutation(`/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}`, "DELETE");
  return SessionResponseSchema.parse(value).session;
}

export async function listPages(projectId: string, sessionId: string): Promise<Page[]> {
  const value = await responseData(await fetch(endpoint(`/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/pages`), { credentials: "same-origin", cache: "no-store" }));
  return ListPagesResponseSchema.parse(value).pages;
}

export async function sourceModel(projectId: string, sessionId: string, pageId: string): Promise<SourceModel> {
  const value = await responseData(await fetch(endpoint(`/${encodeURIComponent(projectId)}/sessions/${encodeURIComponent(sessionId)}/source-model?pageId=${encodeURIComponent(pageId)}`), { credentials: "same-origin", cache: "no-store" }));
  return SourceModelSchema.parse(value);
}
