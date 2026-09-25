import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import {
  BlueprintVersionSchema,
  IdentifierSchema,
  PROTOCOL_VERSION,
  ProjectNameSchema,
} from "@stellar/contracts";
import { Registry, type RegisteredProject } from "./registry.js";
import { durableJson, readJson } from "./storage.js";

export type AccountConnectionErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "INVALID_SCOPE"
  | "UNKNOWN_PROJECT"
  | "IDEMPOTENCY_CONFLICT"
  | "RUNNER_UNAVAILABLE";

export class AccountConnectionError extends Error {
  constructor(readonly code: AccountConnectionErrorCode, message: string) {
    super(message);
    this.name = "AccountConnectionError";
  }
}

type ChallengeRecord = {
  id: string;
  offerRequestId: string;
  identityNamespace: string;
  tenantId: string;
  actorSubject: string;
  secret: string;
  expiresAt: string;
  status: "pending" | "consumed";
  confirmRequestId: string | null;
  confirmStatus: "connected" | "existing" | null;
  connectionId: string | null;
  consumedAt: string | null;
};

type ConnectionRecord = {
  id: string;
  identityNamespace: string;
  tenantId: string;
  connectedBySubject: string;
  connectedAt: string;
  state: "active" | "revoked";
  revokedAt: string | null;
  revocationRequestId: string | null;
};

type BindingRecord = {
  identityNamespace: string;
  tenantId: string;
  accountProjectId: string;
  provisionRequestId: string;
  name: string;
  blueprintId: string;
  blueprintVersion: string;
  registryProjectId: string | null;
  status: "pending" | "ready";
  createdAt: string;
};

type AccountConnectionRecord = {
  version: 1;
  installation: { id: string; createdAt: string };
  challenges: ChallengeRecord[];
  connections: ConnectionRecord[];
  bindings: BindingRecord[];
};

export type AccountBindingScope = {
  installationId: string;
  connectionId: string;
  identityNamespace: string;
  tenantId: string;
  accountProjectId: string;
  registryProjectId: string;
};

export type InstallationStatusRequest = { requestId: string };
export type InstallationStatusResponse = {
  protocolVersion: typeof PROTOCOL_VERSION; requestId: string; installationId: string; createdAt: string;
};
export type OfferInstallationChallengeRequest = {
  requestId: string; identityNamespace: string; tenantId: string; actorSubject: string;
};
export type OfferInstallationChallengeResponse = OfferInstallationChallengeRequest & {
  protocolVersion: typeof PROTOCOL_VERSION; installationId: string; challengeId: string; challenge: string; expiresAt: string;
};
export type ConfirmInstallationChallengeRequest = OfferInstallationChallengeRequest & {
  challengeId: string; challenge: string;
};
export type ConfirmInstallationChallengeResponse = {
  protocolVersion: typeof PROTOCOL_VERSION; requestId: string; installationId: string; connectionId: string;
  identityNamespace: string; tenantId: string; connectedAt: string; status: "connected" | "existing";
};
export type RevokeInstallationConnectionRequest = {
  requestId: string; installationId: string; connectionId: string; identityNamespace: string; tenantId: string;
};
export type CheckInstallationConnectionRequest = RevokeInstallationConnectionRequest;
export type CheckInstallationConnectionResponse = {
  protocolVersion: typeof PROTOCOL_VERSION; requestId: string; installationId: string; connectionId: string;
  identityNamespace: string; tenantId: string; connectedAt: string; status: "connected";
};
export type ProvisionAccountProjectRequest = RevokeInstallationConnectionRequest & {
  accountProjectId: string; name: string; blueprintId: string; blueprintVersion: string;
};
export type DispatchAccountProjectRequest = {
  requestId: string; binding: AccountBindingScope; method: string; params: Record<string, unknown>;
};

const identifier = (value: unknown): value is string => IdentifierSchema.safeParse(value).success;
const subject = (value: unknown): value is string => typeof value === "string" && /^\S{1,512}$/.test(value);
const iso = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean =>
  Object.keys(value).sort().join("|") === [...expected].sort().join("|");
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

function parseChallenge(value: unknown): ChallengeRecord | null {
  if (!record(value) || !exactKeys(value, ["id", "offerRequestId", "identityNamespace", "tenantId", "actorSubject", "secret", "expiresAt", "status", "confirmRequestId", "confirmStatus", "connectionId", "consumedAt"])) return null;
  if (![value.id, value.offerRequestId, value.identityNamespace, value.tenantId].every(identifier) ||
    !subject(value.actorSubject) || typeof value.secret !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.secret) ||
    !iso(value.expiresAt) || value.status !== "pending" && value.status !== "consumed" ||
    value.confirmRequestId !== null && !identifier(value.confirmRequestId) ||
    value.confirmStatus !== null && value.confirmStatus !== "connected" && value.confirmStatus !== "existing" ||
    value.connectionId !== null && !identifier(value.connectionId) || value.consumedAt !== null && !iso(value.consumedAt)) return null;
  if (value.status === "pending" && (value.confirmRequestId !== null || value.confirmStatus !== null || value.connectionId !== null || value.consumedAt !== null) ||
    value.status === "consumed" && (value.confirmRequestId === null || value.confirmStatus === null || value.connectionId === null || value.consumedAt === null)) return null;
  return value as ChallengeRecord;
}

function parseConnection(value: unknown): ConnectionRecord | null {
  if (!record(value) || !exactKeys(value, ["id", "identityNamespace", "tenantId", "connectedBySubject", "connectedAt", "state", "revokedAt", "revocationRequestId"])) return null;
  if (![value.id, value.identityNamespace, value.tenantId].every(identifier) || !subject(value.connectedBySubject) || !iso(value.connectedAt) ||
    value.state !== "active" && value.state !== "revoked" || value.revokedAt !== null && !iso(value.revokedAt) ||
    value.revocationRequestId !== null && !identifier(value.revocationRequestId)) return null;
  if (value.state === "active" && (value.revokedAt !== null || value.revocationRequestId !== null) ||
    value.state === "revoked" && (value.revokedAt === null || value.revocationRequestId === null)) return null;
  return value as ConnectionRecord;
}

function parseBinding(value: unknown): BindingRecord | null {
  if (!record(value) || !exactKeys(value, ["identityNamespace", "tenantId", "accountProjectId", "provisionRequestId", "name", "blueprintId", "blueprintVersion", "registryProjectId", "status", "createdAt"])) return null;
  if (![value.identityNamespace, value.tenantId, value.accountProjectId, value.provisionRequestId, value.blueprintId].every(identifier) ||
    !ProjectNameSchema.safeParse(value.name).success || !BlueprintVersionSchema.safeParse(value.blueprintVersion).success ||
    value.registryProjectId !== null && !identifier(value.registryProjectId) ||
    value.status !== "pending" && value.status !== "ready" || !iso(value.createdAt)) return null;
  if (value.status === "pending" && value.registryProjectId !== null || value.status === "ready" && value.registryProjectId === null) return null;
  return value as BindingRecord;
}

function parseState(value: unknown): AccountConnectionRecord | null {
  if (!record(value) || !exactKeys(value, ["version", "installation", "challenges", "connections", "bindings"]) || value.version !== 1 ||
    !record(value.installation) || !exactKeys(value.installation, ["id", "createdAt"]) ||
    !identifier(value.installation.id) || !iso(value.installation.createdAt) ||
    !Array.isArray(value.challenges) || !Array.isArray(value.connections) || !Array.isArray(value.bindings)) return null;
  const challenges = value.challenges.map(parseChallenge);
  const connections = value.connections.map(parseConnection);
  const bindings = value.bindings.map(parseBinding);
  if (challenges.some((item) => item === null) || connections.some((item) => item === null) || bindings.some((item) => item === null)) return null;
  const challengeIds = new Set<string>(); const offerIds = new Set<string>(); const connectionIds = new Set<string>();
  const confirmIds = new Set<string>(); const activeScopes = new Set<string>(); const bindingScopes = new Set<string>();
  const provisionIds = new Set<string>();
  for (const challenge of challenges as ChallengeRecord[]) {
    if (challengeIds.has(challenge.id) || offerIds.has(challenge.offerRequestId)) return null;
    challengeIds.add(challenge.id); offerIds.add(challenge.offerRequestId);
    if (challenge.confirmRequestId && confirmIds.has(challenge.confirmRequestId)) return null;
    if (challenge.confirmRequestId) confirmIds.add(challenge.confirmRequestId);
  }
  for (const connection of connections as ConnectionRecord[]) {
    if (connectionIds.has(connection.id)) return null;
    connectionIds.add(connection.id);
    const key = scopeKey(connection.identityNamespace, connection.tenantId);
    if (connection.state === "active" && activeScopes.has(key)) return null;
    if (connection.state === "active") activeScopes.add(key);
  }
  for (const binding of bindings as BindingRecord[]) {
    const key = bindingKey(binding.identityNamespace, binding.tenantId, binding.accountProjectId);
    if (bindingScopes.has(key) || provisionIds.has(binding.provisionRequestId)) return null;
    bindingScopes.add(key); provisionIds.add(binding.provisionRequestId);
  }
  for (const challenge of challenges as ChallengeRecord[]) {
    if (challenge.status === "consumed" && !connectionIds.has(challenge.connectionId!)) return null;
  }
  return { version: 1, installation: value.installation as AccountConnectionRecord["installation"],
    challenges: challenges as ChallengeRecord[], connections: connections as ConnectionRecord[], bindings: bindings as BindingRecord[] };
}

function scopeKey(identityNamespace: string, tenantId: string): string {
  return `${identityNamespace}\0${tenantId}`;
}

function bindingKey(identityNamespace: string, tenantId: string, accountProjectId: string): string {
  return `${scopeKey(identityNamespace, tenantId)}\0${accountProjectId}`;
}

function allocationRequestId(identityNamespace: string, tenantId: string, accountProjectId: string): string {
  return `account-${createHash("sha256").update(`stellar.account-project.v1\0${bindingKey(identityNamespace, tenantId, accountProjectId)}`).digest("hex")}`;
}

function requireKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!record(value) || !exactKeys(value, keys)) throw new AccountConnectionError("INVALID_REQUEST", "Invalid account connection request");
  return value;
}

function requireScope(input: Record<string, unknown>): { identityNamespace: string; tenantId: string } {
  if (!identifier(input.identityNamespace) || !identifier(input.tenantId)) throw new AccountConnectionError("INVALID_REQUEST", "Invalid account scope");
  return { identityNamespace: input.identityNamespace, tenantId: input.tenantId };
}

export class AccountConnectionStore {
  private state: AccountConnectionRecord | null = null;
  private file: string | null = null;
  private serial: Promise<void> = Promise.resolve();

  constructor(
    readonly data: string,
    readonly registry: Registry,
    readonly now: () => number = Date.now,
    readonly challengeTtlMs = 5 * 60_000,
    readonly writeState: (file: string, value: unknown) => Promise<void> = durableJson,
  ) {}

  async initialize(): Promise<void> {
    const dataReal = await realpath(this.data);
    this.file = path.join(dataReal, "account-connection.json");
    try {
      const info = await lstat(this.file);
      if (info.isSymbolicLink() || !info.isFile()) throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Account connection record must be a regular file");
      this.state = parseState(await readJson(this.file));
      if (!this.state) throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Account connection record is corrupt");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const createdAt = new Date(this.now()).toISOString();
      this.state = { version: 1, installation: { id: `installation-${randomUUID()}`, createdAt }, challenges: [], connections: [], bindings: [] };
      await this.save();
    }
    if (this.state.challenges.length > 1_000 || this.state.connections.length > 1_000 || this.state.bindings.length > 100) {
      throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Account connection record exceeds supported limits");
    }
    await this.recoverPendingBindings();
  }

  installationStatus(input: unknown): unknown {
    const request = requireKeys(input, ["requestId"]);
    if (!identifier(request.requestId)) throw new AccountConnectionError("INVALID_REQUEST", "Invalid request ID");
    const state = this.requireState();
    return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId,
      installationId: state.installation.id, createdAt: state.installation.createdAt };
  }

  checkConnection(input: unknown): unknown {
    const request = requireKeys(input, ["requestId", "installationId", "connectionId", "identityNamespace", "tenantId"]);
    if (![request.requestId, request.installationId, request.connectionId].every(identifier)) {
      throw new AccountConnectionError("INVALID_REQUEST", "Invalid connection status request");
    }
    const scope = requireScope(request); const state = this.requireState();
    const connection = this.requireActiveConnection(state, request.installationId, request.connectionId,
      scope.identityNamespace, scope.tenantId);
    return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId, installationId: state.installation.id,
      connectionId: connection.id, identityNamespace: connection.identityNamespace, tenantId: connection.tenantId,
      connectedAt: connection.connectedAt, status: "connected" };
  }

  async offerChallenge(input: unknown): Promise<unknown> {
    return this.exclusive(async () => {
      const request = requireKeys(input, ["requestId", "identityNamespace", "tenantId", "actorSubject"]);
      if (!identifier(request.requestId) || !subject(request.actorSubject)) throw new AccountConnectionError("INVALID_REQUEST", "Invalid challenge request");
      const scope = requireScope(request); const state = this.requireState();
      const prior = state.challenges.find((item) => item.offerRequestId === request.requestId);
      if (prior) {
        if (prior.identityNamespace !== scope.identityNamespace || prior.tenantId !== scope.tenantId || prior.actorSubject !== request.actorSubject) {
          throw new AccountConnectionError("IDEMPOTENCY_CONFLICT", "Challenge request was already used for another account");
        }
        if (prior.status !== "pending" || Date.parse(prior.expiresAt) <= this.now()) {
          throw new AccountConnectionError("INVALID_SCOPE", "Connection challenge is no longer available");
        }
        return this.challengeResponse(request.requestId, prior);
      }
      if (state.challenges.length >= 1_000) throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Connection challenge limit reached");
      const challenge: ChallengeRecord = {
        id: `challenge-${randomUUID()}`, offerRequestId: request.requestId,
        identityNamespace: scope.identityNamespace, tenantId: scope.tenantId,
        actorSubject: request.actorSubject, secret: randomBytes(32).toString("base64url"),
        expiresAt: new Date(this.now() + this.challengeTtlMs).toISOString(), status: "pending",
        confirmRequestId: null, confirmStatus: null, connectionId: null, consumedAt: null,
      };
      state.challenges.push(challenge);
      try { await this.save(); } catch (failure) { this.failClosed(failure); }
      return this.challengeResponse(request.requestId, challenge);
    });
  }

  async confirmChallenge(input: unknown): Promise<unknown> {
    return this.exclusive(async () => {
      const request = requireKeys(input, ["requestId", "challengeId", "challenge", "identityNamespace", "tenantId", "actorSubject"]);
      if (![request.requestId, request.challengeId].every(identifier) || !subject(request.actorSubject) ||
        typeof request.challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(request.challenge)) {
        throw new AccountConnectionError("INVALID_REQUEST", "Invalid challenge confirmation");
      }
      const scope = requireScope(request); const state = this.requireState();
      const challenge = state.challenges.find((item) => item.id === request.challengeId);
      if (!challenge || challenge.identityNamespace !== scope.identityNamespace || challenge.tenantId !== scope.tenantId ||
        challenge.actorSubject !== request.actorSubject || challenge.secret !== request.challenge) {
        throw new AccountConnectionError("INVALID_SCOPE", "Connection challenge does not match this account");
      }
      const reusedConfirmation = state.challenges.find((item) => item.confirmRequestId === request.requestId && item.id !== challenge.id);
      if (reusedConfirmation) throw new AccountConnectionError("IDEMPOTENCY_CONFLICT", "Confirmation request was already used for another challenge");
      if (challenge.status === "consumed") {
        if (challenge.confirmRequestId !== request.requestId) throw new AccountConnectionError("IDEMPOTENCY_CONFLICT", "Connection challenge was already used");
        const connection = state.connections.find((item) => item.id === challenge.connectionId);
        if (!connection || connection.state !== "active") throw new AccountConnectionError("UNAUTHORIZED", "Connection has been revoked");
        return this.connectionResponse(request.requestId, connection, challenge.confirmStatus!);
      }
      if (Date.parse(challenge.expiresAt) <= this.now()) throw new AccountConnectionError("INVALID_SCOPE", "Connection challenge expired");
      const previousConnection = state.connections.find((item) => item.state === "active" &&
        item.identityNamespace === scope.identityNamespace && item.tenantId === scope.tenantId);
      const connectedAt = new Date(this.now()).toISOString();
      if (previousConnection) {
        previousConnection.state = "revoked"; previousConnection.revokedAt = connectedAt;
        previousConnection.revocationRequestId = `replacement-${challenge.id}`;
      }
      const connection: ConnectionRecord = { id: `connection-${randomUUID()}`, identityNamespace: scope.identityNamespace, tenantId: scope.tenantId,
        connectedBySubject: request.actorSubject, connectedAt, state: "active", revokedAt: null, revocationRequestId: null };
      state.connections.push(connection);
      const status = "connected" as const;
      challenge.status = "consumed"; challenge.confirmRequestId = request.requestId as string;
      challenge.confirmStatus = status; challenge.connectionId = connection.id;
      challenge.consumedAt = new Date(this.now()).toISOString();
      try { await this.save(); } catch (failure) { this.failClosed(failure); }
      return this.connectionResponse(request.requestId, connection, status);
    });
  }

  async revokeConnection(input: unknown): Promise<unknown> {
    return this.exclusive(async () => {
      const request = requireKeys(input, ["requestId", "installationId", "connectionId", "identityNamespace", "tenantId"]);
      if (![request.requestId, request.installationId, request.connectionId].every(identifier)) throw new AccountConnectionError("INVALID_REQUEST", "Invalid revocation request");
      const scope = requireScope(request); const state = this.requireState();
      if (request.installationId !== state.installation.id) throw new AccountConnectionError("INVALID_SCOPE", "Wrong installation");
      const connection = state.connections.find((item) => item.id === request.connectionId &&
        item.identityNamespace === scope.identityNamespace && item.tenantId === scope.tenantId);
      if (!connection) throw new AccountConnectionError("INVALID_SCOPE", "Unknown connection");
      if (connection.state === "revoked") {
        if (connection.revocationRequestId !== request.requestId) throw new AccountConnectionError("UNAUTHORIZED", "Connection has been revoked");
      } else {
        connection.state = "revoked"; connection.revokedAt = new Date(this.now()).toISOString();
        connection.revocationRequestId = request.requestId as string;
        try { await this.save(); } catch (failure) { this.failClosed(failure); }
      }
      return { protocolVersion: PROTOCOL_VERSION, requestId: request.requestId,
        installationId: state.installation.id, connectionId: connection.id, status: "revoked" };
    });
  }

  async provisionProject(input: unknown): Promise<{ response: unknown; project: RegisteredProject }> {
    return this.exclusive(async () => {
      const request = requireKeys(input, ["requestId", "installationId", "connectionId", "identityNamespace", "tenantId", "accountProjectId", "name", "blueprintId", "blueprintVersion"]);
      if (![request.requestId, request.installationId, request.connectionId, request.accountProjectId, request.blueprintId].every(identifier) ||
        !ProjectNameSchema.safeParse(request.name).success || !BlueprintVersionSchema.safeParse(request.blueprintVersion).success) {
        throw new AccountConnectionError("INVALID_REQUEST", "Invalid project provisioning request");
      }
      const requestId = request.requestId as string;
      const accountProjectId = request.accountProjectId as string;
      const name = request.name as string;
      const blueprintId = request.blueprintId as string;
      const blueprintVersion = request.blueprintVersion as string;
      const scope = requireScope(request); const state = this.requireState();
      this.requireActiveConnection(state, request.installationId, request.connectionId, scope.identityNamespace, scope.tenantId);
      let binding = state.bindings.find((item) => item.identityNamespace === scope.identityNamespace &&
        item.tenantId === scope.tenantId && item.accountProjectId === accountProjectId);
      if (binding) {
        if (binding.name !== name || binding.blueprintId !== blueprintId || binding.blueprintVersion !== blueprintVersion) {
          throw new AccountConnectionError("IDEMPOTENCY_CONFLICT", "Account project is already bound to a different provisioning intent");
        }
      } else {
        if (state.bindings.length >= 100) throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Project binding limit reached");
        if (state.bindings.some((item) => item.provisionRequestId === requestId)) {
          throw new AccountConnectionError("IDEMPOTENCY_CONFLICT", "Provisioning request was already used for another account project");
        }
        const createdBinding: BindingRecord = { identityNamespace: scope.identityNamespace, tenantId: scope.tenantId,
          accountProjectId, provisionRequestId: requestId,
          name, blueprintId, blueprintVersion,
          registryProjectId: null, status: "pending", createdAt: new Date(this.now()).toISOString() };
        state.bindings.push(createdBinding); binding = createdBinding;
        try { await this.save(); } catch (failure) { this.failClosed(failure); }
      }
      let project: RegisteredProject;
      if (binding.status === "ready") {
        project = this.registry.get(binding.registryProjectId! )!;
        if (!project) throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Bound registry project is unavailable");
      } else {
        const created = await this.registry.create({ protocolVersion: PROTOCOL_VERSION,
          requestId: allocationRequestId(binding.identityNamespace, binding.tenantId, binding.accountProjectId),
          name: binding.name, blueprintId: binding.blueprintId, blueprintVersion: binding.blueprintVersion });
        binding.registryProjectId = created.project.id; binding.status = "ready";
        try { await this.save(); } catch (failure) { this.failClosed(failure); }
        project = created.project;
      }
      return { response: this.provisionResponse(requestId, state, binding, project), project };
    });
  }

  assertBinding(input: unknown): RegisteredProject {
    const request = requireKeys(input, ["installationId", "connectionId", "identityNamespace", "tenantId", "accountProjectId", "registryProjectId"]);
    if (![request.installationId, request.connectionId, request.accountProjectId, request.registryProjectId].every(identifier)) {
      throw new AccountConnectionError("INVALID_REQUEST", "Invalid project binding scope");
    }
    const scope = requireScope(request); const state = this.requireState();
    this.requireActiveConnection(state, request.installationId, request.connectionId, scope.identityNamespace, scope.tenantId);
    const binding = state.bindings.find((item) => item.identityNamespace === scope.identityNamespace && item.tenantId === scope.tenantId &&
      item.accountProjectId === request.accountProjectId && item.registryProjectId === request.registryProjectId && item.status === "ready");
    if (!binding) throw new AccountConnectionError("UNKNOWN_PROJECT", "Account project is not bound to this source");
    const project = this.registry.get(binding.registryProjectId!);
    if (!project) throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Bound registry project is unavailable");
    return project;
  }

  private async recoverPendingBindings(): Promise<void> {
    const state = this.requireState(); let changed = false;
    for (const binding of state.bindings.filter((item) => item.status === "pending")) {
      const created = await this.registry.create({ protocolVersion: PROTOCOL_VERSION,
        requestId: allocationRequestId(binding.identityNamespace, binding.tenantId, binding.accountProjectId),
        name: binding.name, blueprintId: binding.blueprintId, blueprintVersion: binding.blueprintVersion });
      binding.registryProjectId = created.project.id; binding.status = "ready"; changed = true;
    }
    if (changed) await this.save();
    for (const binding of state.bindings.filter((item) => item.status === "ready")) {
      if (!this.registry.get(binding.registryProjectId!)) throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Bound registry project is missing");
    }
  }

  private requireActiveConnection(state: AccountConnectionRecord, installationId: unknown, connectionId: unknown,
    identityNamespace: string, tenantId: string): ConnectionRecord {
    if (installationId !== state.installation.id) throw new AccountConnectionError("INVALID_SCOPE", "Wrong installation");
    const connection = state.connections.find((item) => item.id === connectionId && item.identityNamespace === identityNamespace && item.tenantId === tenantId);
    if (!connection || connection.state !== "active") throw new AccountConnectionError("UNAUTHORIZED", "Account connection is unavailable");
    return connection;
  }

  private challengeResponse(requestId: unknown, challenge: ChallengeRecord): unknown {
    const state = this.requireState();
    return { protocolVersion: PROTOCOL_VERSION, requestId, installationId: state.installation.id,
      challengeId: challenge.id, challenge: challenge.secret, expiresAt: challenge.expiresAt,
      identityNamespace: challenge.identityNamespace, tenantId: challenge.tenantId, actorSubject: challenge.actorSubject };
  }

  private connectionResponse(requestId: unknown, connection: ConnectionRecord, status: "connected" | "existing"): unknown {
    const state = this.requireState();
    return { protocolVersion: PROTOCOL_VERSION, requestId, installationId: state.installation.id,
      connectionId: connection.id, identityNamespace: connection.identityNamespace, tenantId: connection.tenantId,
      connectedAt: connection.connectedAt, status };
  }

  private provisionResponse(requestId: unknown, state: AccountConnectionRecord, binding: BindingRecord, project: RegisteredProject): unknown {
    return { protocolVersion: PROTOCOL_VERSION, requestId, status: binding.provisionRequestId === requestId ? "ready" : "existing",
      installationId: state.installation.id, identityNamespace: binding.identityNamespace, tenantId: binding.tenantId,
      accountProjectId: binding.accountProjectId, registryProjectId: project.id, workspace: project.workspace };
  }

  private requireState(): AccountConnectionRecord {
    if (!this.state || !this.file) throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Account connection store is not initialized");
    return this.state;
  }

  private async save(): Promise<void> {
    if (!this.state || !this.file) throw new AccountConnectionError("RUNNER_UNAVAILABLE", "Account connection store is not initialized");
    await this.writeState(this.file, this.state);
  }

  private failClosed(failure: unknown): never {
    // A durable write can fail after rename but before directory fsync. The
    // process cannot know whether disk contains the old or new authority, so it
    // must stop serving account-scoped requests until a restart reloads disk.
    this.state = null;
    throw failure;
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.serial;
    this.serial = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }
}
