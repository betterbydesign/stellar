import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ErrorEnvelopeSchema, ListBlueprintsResponseSchema, PROTOCOL_VERSION, ProjectNameSchema, SessionResponseSchema, makeError } from "@stellar/contracts";
import type { PlatformSession } from "../platform/session";
import { bootstrapOperator, isAllowedOrigin, isAppRequest, OPERATOR_COOKIE, readOperator } from "../server/operator-auth";
import { dispatchProjectApi } from "../server/project-api";
import { safeRunnerResponse } from "../server/runner-broker";
import type { ConnectedConfig } from "./config";
import type { BackendCall, RunnerCall } from "./transport";
import { connectionProof } from "./proof";

export type ConnectedDependencies = {
  config: ConnectedConfig | null;
  session(): Promise<PlatformSession | null>;
  backend(token: string): BackendCall;
  runner: RunnerCall;
};
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("BACKEND_UNAVAILABLE");
  return value as Record<string, unknown>;
};
const string = (value: unknown): string => { if (typeof value !== "string" || !value) throw new Error("INVALID_REQUEST"); return value; };
const identifier = (value: unknown): string => { const parsed = string(value); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(parsed)) throw new Error("INVALID_REQUEST"); return parsed; };
function exact(input: Record<string, unknown>, keys: string[]) { if (Object.keys(input).some((key) => !keys.includes(key))) throw new Error("INVALID_REQUEST"); }
async function body(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].toLowerCase() !== "application/json") throw new Error("INVALID_REQUEST");
  const raw = await request.text(); if (raw.length > 8192) throw new Error("INVALID_REQUEST");
  try { return record(JSON.parse(raw)); } catch { throw new Error("INVALID_REQUEST"); }
}
const errorCodes: Record<string, number> = { UNAUTHENTICATED: 401, UNAUTHORIZED: 401, FORBIDDEN: 403, READ_ONLY: 403, TENANT_ACCESS_DENIED: 403, PROJECT_ACCESS_DENIED: 403, INVALID_REQUEST: 400, INVALID_SCOPE: 403, IDEMPOTENCY_CONFLICT: 409, RUNNER_DISCONNECTED: 409, CONNECTION_REVOKED: 403, CONNECTION_EXPIRED: 409, PAIRING_EXPIRED: 409, PAIRING_MISMATCH: 403, PROVISIONING_MISMATCH: 403, PROJECT_BINDING_MISMATCH: 403, CONNECTION_SESSION_MISMATCH: 403, REGISTRY_PROJECT_ALREADY_BOUND: 409, CONNECTION_PROOF_INVALID: 403, CONNECTION_PROOF_CONFIG_MISSING: 503, BACKEND_UNAVAILABLE: 503, CONNECTION_UNAVAILABLE: 409, STALE_REVISION: 409 };
function failureCode(error: unknown) {
  if (error instanceof Error && errorCodes[error.message]) return error.message;
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "code" in data && typeof data.code === "string" && errorCodes[data.code]) return data.code;
  }
  return "BACKEND_UNAVAILABLE";
}
export function accountCsrf(operatorCsrf: string, scope: { identityNamespace: string; tenantId: string; actorSubject: string }) {
  return createHmac("sha256", operatorCsrf).update(JSON.stringify([scope.identityNamespace, scope.tenantId, scope.actorSubject])).digest("base64url");
}
function equal(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }

/** Separate connected-computer gate. This never enables the local-only broker. */
export async function connectedHttp(request: Request, segments: string[], deps: ConnectedDependencies): Promise<Response> {
  const editor = segments[0] === "websites" && segments[2] === "projects";
  try {
    const config = deps.config;
    if (!config) {
      if (segments.join("/") === "status" && request.method === "GET") return json({ available: false, connected: false });
      throw new Error("RUNNER_DISCONNECTED");
    }
    if (!isAppRequest(request, config) || !isAllowedOrigin(request, config, request.method !== "GET")) throw new Error("FORBIDDEN");
    const session = await deps.session(); if (!session) throw new Error("UNAUTHENTICATED");
    const backend = deps.backend(session.accessToken);
    const actor = record(await backend("query", "connected:connectionContext", {}));
    const scope = { identityNamespace: string(actor.identityNamespace), tenantId: string(actor.tenantId), actorSubject: string(actor.actorSubject) };
    if (scope.identityNamespace !== config.identityNamespace || scope.actorSubject !== session.identity.subject) throw new Error("FORBIDDEN");
    const route = segments.join("/");
    if (route === "bootstrap" && request.method === "POST") {
      const input = await body(request); exact(input, ["nonce"]);
      const issued = await bootstrapOperator(string(input.nonce), config); if (!issued) throw new Error("UNAUTHORIZED");
      const response = json({ csrfToken: accountCsrf(issued.operator.csrfToken, scope), expiresAt: issued.operator.expiresAt });
      response.headers.set("set-cookie", `${OPERATOR_COOKIE}=${issued.cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);
      return response;
    }
    const operator = readOperator(request, config);
    if (route === "status" && request.method === "GET" && !operator) return json({ available: true, connected: false, needsLocalConfirmation: true, accountLabel: session.identity.email });
    if (!operator) throw new Error("UNAUTHORIZED");
    const csrfToken = accountCsrf(operator.csrfToken, scope);
    if (request.method !== "GET" && !equal(request.headers.get("x-stellar-csrf") ?? "", csrfToken)) throw new Error("FORBIDDEN");
    if (route === "session" && request.method === "GET") return json({ csrfToken, expiresAt: operator.expiresAt });
    const requestId = `connected-${randomUUID()}`;
    const installation = await deps.runner("installationStatus", { requestId });
    const installationId = identifier(installation.installationId);
    const current = record(await backend("query", "connected:connectionStatus", { installationId }));
    const connection = current.connection ? record(current.connection) : null;
    let connectionId = connection ? identifier(connection.connectionId) : null;
    if (connectionId) {
      try {
        const checked = await deps.runner("checkInstallationConnection", { requestId, installationId, connectionId, identityNamespace: scope.identityNamespace, tenantId: scope.tenantId });
        if (checked.installationId !== installationId || checked.connectionId !== connectionId || checked.identityNamespace !== scope.identityNamespace || checked.tenantId !== scope.tenantId) connectionId = null;
      } catch { connectionId = null; }
    }
    if (route === "status" && request.method === "GET") return json({ available: true, connected: !!connectionId, installationId, label: "This computer", accountLabel: session.identity.email });
    if (route === "offer" && request.method === "POST") {
      const input = await body(request); exact(input, ["requestId"]); const id = identifier(input.requestId);
      const offer = await deps.runner("offerInstallationChallenge", { requestId: id, ...scope });
      if (offer.installationId !== installationId || offer.identityNamespace !== scope.identityNamespace || offer.tenantId !== scope.tenantId || offer.actorSubject !== scope.actorSubject) throw new Error("FORBIDDEN");
      const challenge = string(offer.challenge); const challengeId = identifier(offer.challengeId);
      const expiresAt = Date.parse(string(offer.expiresAt)); if (!Number.isFinite(expiresAt)) throw new Error("RUNNER_DISCONNECTED");
      const pairing = record(await backend("mutation", "connected:beginPairing", { requestId: id, installationId, installationLabel: "This computer", challengeId, challengeDigest: createHash("sha256").update(challenge).digest("hex"), expiresAt }));
      return json({ requestId: id, installationId, label: "This computer", challengeId, challenge, expiresAt, pairingId: string(pairing.pairingId) });
    }
    if (route === "confirm" && request.method === "POST") {
      const input = await body(request); exact(input, ["requestId", "installationId", "label", "challengeId", "challenge", "expiresAt", "pairingId"]);
      const id = identifier(input.requestId); const challengeId = identifier(input.challengeId); const challenge = string(input.challenge); const pairingId = identifier(input.pairingId);
      if (input.installationId !== installationId || typeof input.expiresAt !== "number") throw new Error("INVALID_SCOPE");
      const confirmed = await deps.runner("confirmInstallationChallenge", { requestId: id, challengeId, challenge, ...scope });
      if (confirmed.installationId !== installationId || confirmed.identityNamespace !== scope.identityNamespace || confirmed.tenantId !== scope.tenantId) throw new Error("FORBIDDEN");
      const confirmedConnectionId = identifier(confirmed.connectionId);
      const proof = connectionProof(config.signingSecret, "confirm-pairing", [scope.identityNamespace, scope.tenantId, scope.actorSubject, pairingId, id, installationId, challengeId, challenge, confirmedConnectionId, input.expiresAt]);
      await backend("action", "connectionProof:confirmPairing", { ...scope, pairingId, requestId: id, installationId, challengeId, challenge, connectionId: confirmedConnectionId, expiresAt: input.expiresAt, proof });
      return json({ connected: true, installationId });
    }
    if (route === "disconnect" && request.method === "POST") {
      const input = await body(request); exact(input, ["installationId"]);
      if (input.installationId !== installationId || !connectionId) throw new Error("RUNNER_DISCONNECTED");
      await backend("mutation", "connected:revokeConnection", { connectionId, requestId });
      // Backend revocation is authoritative even if this second acknowledgement is lost.
      await deps.runner("revokeInstallationConnection", { requestId, installationId, connectionId, identityNamespace: scope.identityNamespace, tenantId: scope.tenantId }).catch(() => {});
      return json({ connected: false });
    }
    if (route === "blueprints" && request.method === "GET") {
      if (!connectionId) throw new Error("RUNNER_DISCONNECTED");
      return json(ListBlueprintsResponseSchema.parse(await deps.runner("listBlueprints", { requestId })));
    }
    if (segments[0] === "websites" && segments.length === 2 && request.method === "GET") {
      const state = record(await backend("query", "connected:getProjectConnection", { projectId: identifier(segments[1]) }));
      const context = record(state.context);
      const binding = state.binding ? record(state.binding) : null;
      const operation = state.operation ? record(state.operation) : null;
      const storedInstallation = binding?.installationId ?? operation?.installationId;
      return json({ projectId: context.projectId, name: context.projectName, sourceState: context.sourceState === "provisioning" ? "preparing" : context.sourceState,
        connected: !!connectionId && (!storedInstallation || storedInstallation === installationId),
        ...(binding ? { registryProjectId: binding.registryProjectId } : {}),
        ...(operation ? { blueprintId: operation.blueprintId, blueprintVersion: operation.blueprintVersion, requestId: operation.requestId } : {}) });
    }
    if (route === "websites" && request.method === "POST") {
      if (!connectionId) throw new Error("RUNNER_DISCONNECTED");
      const input = await body(request); exact(input, ["requestId", "name", "blueprintId", "blueprintVersion", "projectId"]);
      const id = identifier(input.requestId); const parsedName = ProjectNameSchema.safeParse(input.name);
      if (!parsedName.success) throw new Error("INVALID_REQUEST");
      const name = parsedName.data;
      const blueprintId = identifier(input.blueprintId); const blueprintVersion = string(input.blueprintVersion);
      const catalog = ListBlueprintsResponseSchema.parse(await deps.runner("listBlueprints", { requestId }));
      if (!catalog.blueprints.some((entry) => entry.blueprint.id === blueprintId && entry.blueprint.version === blueprintVersion)) throw new Error("INVALID_REQUEST");
      const project = input.projectId ? record(await backend("query", "platform:getProject", { projectId: identifier(input.projectId) })) : record(await backend("mutation", "platform:createProject", { name, requestId: id }));
      const projectId = identifier(project._id); if (project.name !== name) throw new Error("IDEMPOTENCY_CONFLICT");
      const previous = record(await backend("query", "connected:getProjectConnection", { projectId }));
      const priorOperation = previous.operation ? record(previous.operation) : null;
      const operationRequestId = priorOperation ? identifier(priorOperation.requestId) : id;
      const started = record(await backend("mutation", "connected:beginProvisioning", { projectId, connectionId, requestId: operationRequestId, blueprintId, blueprintVersion }));
      const operation = record(started.operation);
      const operationId = identifier(operation.operationId);
      if (operation.status === "ready") {
        const registryProjectId = identifier(operation.registryProjectId);
        await backend("query", "connected:authorizeRegistry", { projectId, registryProjectId, connectionId, requestId: id, write: true });
        const binding = { installationId, connectionId, identityNamespace: scope.identityNamespace, tenantId: scope.tenantId, accountProjectId: projectId, registryProjectId };
        const found = await deps.runner("dispatchAccountProject", { requestId, binding, method: "getProject", params: { projectId: registryProjectId, requestId } });
        if (!safeRunnerResponse(found, "getProject", config, { projectId: registryProjectId, requestId })) throw new Error("RUNNER_DISCONNECTED");
        return json({ projectId, name, sourceState: "ready", registryProjectId });
      }
      const allocated = await deps.runner("provisionAccountProject", { requestId: operationId, installationId, connectionId, identityNamespace: scope.identityNamespace, tenantId: scope.tenantId, accountProjectId: projectId, name, blueprintId, blueprintVersion });
      if (allocated.installationId !== installationId || allocated.accountProjectId !== projectId || allocated.identityNamespace !== scope.identityNamespace || allocated.tenantId !== scope.tenantId) throw new Error("FORBIDDEN");
      const registryProjectId = identifier(allocated.registryProjectId);
      const binding = { installationId, connectionId, identityNamespace: scope.identityNamespace, tenantId: scope.tenantId, accountProjectId: projectId, registryProjectId };
      const opened = SessionResponseSchema.parse(await deps.runner("dispatchAccountProject", { requestId, binding, method: "openSession", params: { protocolVersion: PROTOCOL_VERSION, requestId, projectId: registryProjectId } }));
      if (opened.projectId !== registryProjectId || opened.requestId !== requestId) throw new Error("FORBIDDEN");
      const sourceRevision = opened.session.sourceRevision;
      const proof = connectionProof(config.signingSecret, "acknowledge-provisioning", [scope.identityNamespace, scope.tenantId, scope.actorSubject, projectId, operationId, installationId, connectionId, registryProjectId, sourceRevision, operationRequestId]);
      await backend("action", "connectionProof:acknowledgeProvisioning", { ...scope, projectId, operationId, installationId, connectionId, registryProjectId, sourceRevision, requestId: operationRequestId, proof });
      return json({ projectId, name, sourceState: "ready", registryProjectId });
    }
    if (editor) {
      if (!connectionId) throw new Error("RUNNER_DISCONNECTED");
      const projectId = identifier(segments[1]); const registryProjectId = identifier(segments[3]);
      return await dispatchProjectApi(request, segments.slice(3), async (method, params, callScope) => {
        if (["listProjects", "createProject", "listBlueprints"].includes(method) || params.projectId !== registryProjectId) return makeError(callScope, "INVALID_SCOPE");
        const authorized = record(await backend("query", "connected:authorizeRegistry", { projectId, registryProjectId, connectionId, requestId: string(params.requestId), write: request.method !== "GET" }));
        if (authorized.installationId !== installationId || authorized.registryProjectId !== registryProjectId || authorized.accountProjectId !== projectId || authorized.connectionId !== connectionId || authorized.identityNamespace !== scope.identityNamespace || authorized.tenantId !== scope.tenantId || authorized.actorSubject !== scope.actorSubject) return makeError(callScope, "INVALID_SCOPE");
        const binding = { installationId, connectionId, identityNamespace: scope.identityNamespace, tenantId: scope.tenantId, accountProjectId: projectId, registryProjectId };
        const value = await deps.runner("dispatchAccountProject", { requestId: params.requestId, binding, method, params });
        const refused = ErrorEnvelopeSchema.safeParse(value);
        if (refused.success) {
          if (refused.data.requestId !== callScope.requestId || refused.data.projectId !== callScope.projectId || (callScope.sessionId && refused.data.sessionId !== callScope.sessionId)) return makeError(callScope, "RUNNER_UNAVAILABLE");
          return makeError(callScope, refused.data.error.code);
        }
        const safe = safeRunnerResponse(value, method, config, callScope);
        return safe ?? makeError(callScope, "RUNNER_UNAVAILABLE");
      });
    }
    throw new Error("INVALID_REQUEST");
  } catch (error) {
    const code = failureCode(error);
    if (editor) {
      const scope = { projectId: segments[3], sessionId: segments[5], requestId: new URL(request.url).searchParams.get("requestId") ?? undefined };
      const value = makeError(scope, code === "FORBIDDEN" || code === "PROJECT_ACCESS_DENIED" || code === "TENANT_ACCESS_DENIED" || code === "READ_ONLY" ? "FORBIDDEN" : code === "UNAUTHENTICATED" || code === "UNAUTHORIZED" ? "UNAUTHORIZED" : "RUNNER_UNAVAILABLE");
      return json(value, value.error.httpStatus);
    }
    return json({ error: { code } }, errorCodes[code]);
  }
}
