import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GetProjectResponseSchema, IdentifierSchema, ListProjectsResponseSchema, PROTOCOL_VERSION, SessionResponseSchema, makeError, type ErrorEnvelope } from "@stellar/contracts";
import { Registry } from "./registry.js";
import { DataLease } from "./lease.js";
import { WorkspaceRuntime } from "./workspace.js";

export type RunnerConfig = {
  seed: string; data: string; url: URL; secret: string; operatorId: string;
  appOrigin: string; previewHost: "localhost"; previewPort?: number;
};

const repoRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
export function configFromEnvironment(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  if (env.STELLAR_LOCAL_MODE !== "1") throw new Error("Local runner mode is disabled");
  const url = new URL(env.STELLAR_RUNNER_URL ?? "http://127.0.0.1:4310");
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" || url.search || url.hash || !url.port) throw new Error("Runner must bind IPv4 loopback");
  if (!env.STELLAR_RUNNER_SECRET || env.STELLAR_RUNNER_SECRET.length < 32) throw new Error("Runner secret is missing");
  if (!IdentifierSchema.safeParse(env.STELLAR_OPERATOR_ID).success) throw new Error("Operator ID is missing");
  const appOrigin = env.STELLAR_APP_ORIGIN ?? "http://127.0.0.1:3210";
  const app = new URL(appOrigin);
  if (app.origin !== appOrigin || app.protocol !== "http:" || app.hostname !== "127.0.0.1") throw new Error("Invalid app origin");
  if (env.STELLAR_PREVIEW_HOST !== "localhost") throw new Error("Preview host must be localhost");
  const previewPort = env.STELLAR_PREVIEW_PORT ? Number(env.STELLAR_PREVIEW_PORT) : undefined;
  if (previewPort !== undefined && (!Number.isInteger(previewPort) || previewPort < 1024 || previewPort > 65535)) throw new Error("Invalid preview port");
  return { seed: path.resolve(env.STELLAR_FIXTURE_SEED ?? path.join(repoRoot, "fixtures/astro-style-lab")),
    data: path.resolve(env.STELLAR_DATA_DIR ?? path.join(repoRoot, ".stellar-local")), url,
    secret: env.STELLAR_RUNNER_SECRET, operatorId: env.STELLAR_OPERATOR_ID!, appOrigin,
    previewHost: "localhost", ...(previewPort === undefined ? {} : { previewPort }) };
}

export class Runner {
  readonly registry: Registry;
  readonly workspaces = new Map<string, WorkspaceRuntime>();
  private lease: DataLease | null = null;
  constructor(readonly config: RunnerConfig) { this.registry = new Registry(config.seed, config.data); }
  async initialize(): Promise<void> {
    this.lease = await DataLease.acquire(this.config.data);
    try {
      await this.registry.initialize();
      for (const project of this.registry.list()) {
        const workspace = new WorkspaceRuntime(project, this.config.seed, this.config.data,
          this.config.operatorId, this.config.previewPort, undefined, this.config.appOrigin);
        await workspace.initialize();
        this.workspaces.set(project.id, workspace);
      }
    } catch (failure) {
      await this.shutdown();
      throw failure;
    }
  }
  async shutdown(): Promise<void> {
    await Promise.all([...this.workspaces.values()].map((workspace) => workspace.shutdown()));
    if (this.lease) { await this.lease.release(); this.lease = null; }
  }
  async dispatch(method: unknown, params: unknown, operatorId: string): Promise<unknown> {
    if (operatorId !== this.config.operatorId) return makeError({}, "UNAUTHORIZED");
    if (!params || typeof params !== "object" || Array.isArray(params)) return makeError({}, "INVALID_REQUEST");
    const body = params as Record<string, unknown>;
    const requestId = IdentifierSchema.safeParse(body.requestId).success ? body.requestId as string : null;
    if (!requestId) return makeError({}, "INVALID_REQUEST");
    if (method === "listProjects") return ListProjectsResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION,
      requestId, projects: this.registry.list().map((project) => project.workspace) });
    const projectId = IdentifierSchema.safeParse(body.projectId).success ? body.projectId as string : null;
    if (!projectId) return makeError({ requestId }, "INVALID_REQUEST");
    const project = this.registry.get(projectId);
    if (!project) return makeError({ projectId, requestId }, "UNKNOWN_PROJECT");
    if (method === "getProject") return GetProjectResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION,
      projectId, requestId, workspace: project.workspace });
    const workspace = this.workspaces.get(projectId)!;
    if (method === "openSession") {
      const session = await workspace.open(body);
      if ("error" in session) return session;
      return SessionResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, projectId,
        sessionId: session.id, requestId, session });
    }
    const sessionId = IdentifierSchema.safeParse(body.sessionId).success ? body.sessionId as string : null;
    if (!sessionId) return makeError({ projectId, requestId }, "INVALID_SCOPE");
    if (method === "getSession" || method === "closeSession" || method === "restartSession") {
      const session = method === "getSession" ? workspace.getSession(body) :
        method === "closeSession" ? await workspace.close(body) : await workspace.restart(body);
      if ("error" in session) return session;
      return SessionResponseSchema.parse({ protocolVersion: PROTOCOL_VERSION, projectId,
        sessionId: session.id, requestId, session });
    }
    if (method === "listPages") return workspace.pages(body);
    if (method === "sourceModel") return workspace.sourceModel(body);
    if (method === "prepareChange") return workspace.prepare(body);
    if (method === "applyChange") return workspace.apply(body);
    if (method === "requestOutcome") return workspace.outcome(body);
    if (method === "history") return workspace.history(body);
    if (method === "historyCommand") return workspace.historyCommand(body);
    return makeError({ projectId, sessionId, requestId }, "INVALID_REQUEST");
  }
}

function isError(value: unknown): value is ErrorEnvelope {
  return Boolean(value && typeof value === "object" && "status" in value && value.status === "error");
}
function sameSecret(expected: string, received: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}
function json(reply: ServerResponse, status: number, value: unknown): void {
  reply.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  reply.end(JSON.stringify(value));
}

export function createRunnerServer(runner: Runner): Server {
  const expectedHost = runner.config.url.host;
  return createServer(async (request: IncomingMessage, reply: ServerResponse) => {
    const remote = request.socket.remoteAddress;
    if (remote !== "127.0.0.1" && remote !== "::ffff:127.0.0.1") { json(reply, 403, makeError({}, "FORBIDDEN")); return; }
    if (request.headers.host !== expectedHost || request.headers.origin || request.method !== "POST" || request.url !== "/rpc") {
      json(reply, 403, makeError({}, "FORBIDDEN")); return;
    }
    const authorization = request.headers.authorization;
    const operatorId = request.headers["x-stellar-operator"];
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ") ||
      !sameSecret(runner.config.secret, authorization.slice("Bearer ".length)) ||
      typeof operatorId !== "string" || !IdentifierSchema.safeParse(operatorId).success) {
      json(reply, 401, makeError({}, "UNAUTHORIZED")); return;
    }
    let raw = "";
    let payload: unknown;
    try {
      for await (const chunk of request) {
        raw += chunk.toString("utf8");
        if (raw.length > 64_000) { json(reply, 400, makeError({}, "INVALID_REQUEST")); return; }
      }
      payload = JSON.parse(raw) as unknown;
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).sort().join(",") !== "method,params") {
        json(reply, 400, makeError({}, "INVALID_REQUEST")); return;
      }
    } catch { json(reply, 400, makeError({}, "INVALID_REQUEST")); return; }
    try {
      const { method, params } = payload as { method: unknown; params: unknown };
      const result = await runner.dispatch(method, params, operatorId);
      json(reply, isError(result) ? result.error.httpStatus : 200, result);
    } catch {
      const params = (payload as { params?: unknown }).params;
      const scope = params && typeof params === "object" ? params as Record<string, unknown> : {};
      json(reply, 503, makeError({
        ...(IdentifierSchema.safeParse(scope.projectId).success ? { projectId: scope.projectId as string } : {}),
        ...(IdentifierSchema.safeParse(scope.sessionId).success ? { sessionId: scope.sessionId as string } : {}),
        ...(IdentifierSchema.safeParse(scope.requestId).success ? { requestId: scope.requestId as string } : {}),
      }, "RUNNER_UNAVAILABLE"));
    }
  });
}

async function main(): Promise<void> {
  const config = configFromEnvironment();
  const runner = new Runner(config);
  await runner.initialize();
  const server = createRunnerServer(runner);
  try { await new Promise<void>((resolve, reject) => server.once("error", reject).listen(Number(config.url.port), "127.0.0.1", resolve)); }
  catch (failure) { await runner.shutdown(); throw failure; }
  process.stdout.write(`Stellar local runner ready at ${config.url.origin}\n`);
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    // Drain broker requests before releasing source/process ownership.
    server.close(() => {
      void runner.shutdown().then(() => process.exit(0), () => process.exit(1));
    });
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { process.stderr.write("Local runner could not initialize. Check the fixture and local data directory.\n"); process.exitCode = 1; });
}
