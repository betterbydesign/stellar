import type { GenericId } from "convex/values";

export type ProjectSummary = { _id: string; name: string; createdAt: number; sourceState: "unlinked" };
export type Workspace = {
  actor: { subject: string };
  tenant: { _id: string; kind: "personal" | "organization"; name: string; role: "owner" | "editor" | "viewer" };
};
export type ProjectPage = { page: ProjectSummary[]; isDone: boolean; continueCursor: string };
export type PlatformBackend = {
  viewer(token: string): Promise<Workspace>;
  bootstrap(token: string): Promise<unknown>;
  list(token: string, cursor: string | null): Promise<ProjectPage>;
  create(token: string, input: { name: string; requestId: string }): Promise<ProjectSummary>;
  project(token: string, projectId: GenericId<"projects">): Promise<ProjectSummary>;
  runner(token: string, projectId: GenericId<"projects">): Promise<unknown>;
  proposals(token: string, projectId: GenericId<"projects">, cursor: string | null): Promise<unknown>;
  proposal(token: string, projectId: GenericId<"projects">, proposalId: string): Promise<unknown>;
  decideProposal(token: string, input: { projectId: GenericId<"projects">; proposalId: string; requestId: string; action: "approve" | "reject" | "cancel"; expectedDigest: string; expectedRevision: string }): Promise<unknown>;
  submitProposal(token: string, projectId: GenericId<"projects">, requestId: string): Promise<unknown>;
};
export type HttpDependencies = {
  appOrigin: string | null;
  session(): Promise<{ accessToken: string } | null>;
  backend: PlatformBackend;
  errorCode(error: unknown): string | null;
};
const headers = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const statusCodes: Record<string, number> = {
  UNAUTHENTICATED: 401, WORKSPACE_NOT_PROVISIONED: 409, TENANT_ACCESS_DENIED: 403,
  PROJECT_ACCESS_DENIED: 403, READ_ONLY: 403, IDEMPOTENCY_CONFLICT: 409,
  INVALID_REQUEST: 400, FORBIDDEN: 403, PLATFORM_UNAVAILABLE: 503,
  BACKEND_UNAVAILABLE: 503, RUNNER_DISCONNECTED: 409, NOT_FOUND: 404,
  PROPOSAL_EXPIRED: 409, PROPOSAL_ALTERED: 409, STALE_REVISION: 409,
  PROPOSAL_NOT_FOUND: 404, PROPOSAL_CONFLICT: 409, PROPOSAL_CLOSED: 409,
};
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers }); }
function failure(code: string) { return json({ error: { code } }, statusCodes[code] ?? 503); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  try {
    const text = await request.text();
    if (text.length > 8192) return null;
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch { return null; }
}

/** Web checks protect the cookie boundary; each Convex function repeats scope authorization. */
export async function platformHttp(request: Request, segments: string[], deps: HttpDependencies): Promise<Response> {
  if (!deps.appOrigin) return failure("PLATFORM_UNAVAILABLE");
  if (!["GET", "POST"].includes(request.method)) return failure("NOT_FOUND");
  if (request.method === "POST" && request.headers.get("origin") !== deps.appOrigin) return failure("FORBIDDEN");
  let session: { accessToken: string } | null;
  try { session = await deps.session(); } catch { return failure("PLATFORM_UNAVAILABLE"); }
  if (!session) return failure("UNAUTHENTICATED");
  const token = session.accessToken;
  try {
    if (segments.length === 1 && segments[0] === "workspace") {
      if (request.method === "GET") return json(await deps.backend.viewer(token));
      const input = await readJson(request);
      if (!input || Object.keys(input).length !== 0) return failure("INVALID_REQUEST");
      return json(await deps.backend.bootstrap(token));
    }
    if (segments.length === 1 && segments[0] === "projects") {
      if (request.method === "GET") {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (cursor && cursor.length > 2048) return failure("INVALID_REQUEST");
        return json(await deps.backend.list(token, cursor));
      }
      const input = await readJson(request);
      if (!input || Object.keys(input).some((key) => !["name", "requestId"].includes(key)) ||
        typeof input.name !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9 .,'&()_-]{0,78}[A-Za-z0-9])?$/.test(input.name) ||
        typeof input.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.requestId)) return failure("INVALID_REQUEST");
      return json(await deps.backend.create(token, { name: input.name, requestId: input.requestId }));
    }
    if (segments[0] === "projects" && typeof segments[1] === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(segments[1])) {
      const projectId = segments[1] as GenericId<"projects">;
      if (segments.length === 2 && request.method === "GET") return json(await deps.backend.project(token, projectId));
      if (segments[2] === "proposals") {
        if (segments.length === 3 && request.method === "GET") {
          const cursor = new URL(request.url).searchParams.get("cursor");
          if (cursor && cursor.length > 2048) return failure("INVALID_REQUEST");
          return json(await deps.backend.proposals(token, projectId, cursor));
        }
        if (segments.length === 3 && request.method === "POST") {
          const input = await readJson(request);
          if (!input || Object.keys(input).length !== 1 || typeof input.requestId !== "string" ||
            !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.requestId)) return failure("INVALID_REQUEST");
          await deps.backend.submitProposal(token, projectId, input.requestId);
          return failure("RUNNER_DISCONNECTED");
        }
        const proposalId = segments[3];
        if (!proposalId || !/^[a-zA-Z0-9_-]{1,128}$/.test(proposalId)) return failure("INVALID_REQUEST");
        if (segments.length === 4 && request.method === "GET") return json(await deps.backend.proposal(token, projectId, proposalId));
        if (segments.length === 5 && segments[4] === "decisions" && request.method === "POST") {
          const input = await readJson(request);
          if (!input || Object.keys(input).some((key) => !["requestId", "action", "expectedDigest", "expectedRevision"].includes(key)) ||
            typeof input.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.requestId) ||
            typeof input.action !== "string" || !["approve", "reject", "cancel"].includes(input.action) ||
            typeof input.expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedDigest) ||
            typeof input.expectedRevision !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(input.expectedRevision)) return failure("INVALID_REQUEST");
          return json(await deps.backend.decideProposal(token, { projectId, proposalId, requestId: input.requestId,
            action: input.action as "approve" | "reject" | "cancel", expectedDigest: input.expectedDigest, expectedRevision: input.expectedRevision }));
        }
      }
      if (segments.length === 3 && segments[2] === "runner" && request.method === "POST") {
        const input = await readJson(request);
        if (!input || Object.keys(input).length !== 0) return failure("INVALID_REQUEST");
        await deps.backend.runner(token, projectId);
        return failure("RUNNER_DISCONNECTED");
      }
    }
    return failure("NOT_FOUND");
  } catch (error) {
    const code = deps.errorCode(error);
    return failure(code && Object.hasOwn(statusCodes, code) ? code : "BACKEND_UNAVAILABLE");
  }
}
