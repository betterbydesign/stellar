import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  requireProjectEdit,
  requireProjectEditForActor,
  requireWorkspace,
  requireWorkspaceForActor,
} from "./platform";
import type { VerifiedActor } from "./identity";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BLUEPRINT_VERSION = /^[1-9][0-9]*\.[0-9]+\.[0-9]+$/;
const SUBJECT = /^\S{1,512}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REVISION = /^[A-Za-z0-9_-]{8,128}$/;
const LABEL = /^[^\u0000-\u001f\u007f]{1,80}$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const PAIRING_TTL_MS = 10 * 60_000;

const sourceStateValidator = v.union(
  v.literal("unlinked"),
  v.literal("provisioning"),
  v.literal("ready"),
);
const pairingStateValidator = v.union(v.literal("pending"), v.literal("consumed"));
const operationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("failed"),
  v.literal("ready"),
);
const actorValidator = v.object({
  identityNamespace: v.string(),
  subject: v.string(),
  organizationId: v.union(v.string(), v.null()),
});
const connectionValidator = v.object({
  installationId: v.string(),
  installationLabel: v.string(),
  connectionId: v.string(),
  state: v.union(v.literal("active"), v.literal("revoked")),
});
const pairingValidator = v.object({
  pairingId: v.id("connectionPairings"),
  requestId: v.string(),
  installationId: v.string(),
  installationLabel: v.string(),
  challengeId: v.string(),
  expiresAt: v.number(),
  state: pairingStateValidator,
  connectionId: v.union(v.string(), v.null()),
  identityNamespace: v.string(),
  tenantId: v.id("tenants"),
  actorSubject: v.string(),
});
const operationValidator = v.object({
  operationId: v.id("provisioningOperations"),
  requestId: v.string(),
  status: operationStatusValidator,
  installationId: v.string(),
  connectionId: v.string(),
  blueprintId: v.string(),
  blueprintVersion: v.string(),
  registryProjectId: v.union(v.string(), v.null()),
  sourceRevision: v.union(v.string(), v.null()),
  errorCode: v.union(v.string(), v.null()),
});
const projectContextValidator = v.object({
  projectId: v.id("projects"),
  projectName: v.string(),
  sourceState: sourceStateValidator,
  identityNamespace: v.string(),
  tenantId: v.id("tenants"),
  actorSubject: v.string(),
});
const provisioningValidator = v.object({
  context: projectContextValidator,
  operation: operationValidator,
});
const bindingValidator = v.object({
  bindingId: v.id("projectRegistryBindings"),
  installationId: v.string(),
  registryProjectId: v.string(),
  sourceRevision: v.string(),
});

type DatabaseCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;
type StoredActor = {
  identityNamespace: string;
  subject: string;
  organizationId: string | null;
};

function fail(code: string): never {
  throw new ConvexError({ code });
}

function identifier(value: string): string {
  if (!IDENTIFIER.test(value)) fail("INVALID_REQUEST");
  return value;
}

function label(value: string): string {
  if (!LABEL.test(value) || value.trim() !== value) fail("INVALID_REQUEST");
  return value;
}

function verifiedActor(actor: StoredActor): VerifiedActor {
  if (!IDENTIFIER.test(actor.identityNamespace) || !SUBJECT.test(actor.subject)) {
    fail("UNAUTHENTICATED");
  }
  return {
    identityNamespace: actor.identityNamespace,
    subject: actor.subject,
    organizationId: actor.organizationId ?? undefined,
  };
}

function projectContext(
  access: Awaited<ReturnType<typeof requireProjectEdit>>,
) {
  return {
    projectId: access.project._id,
    projectName: access.project.name,
    sourceState: access.project.sourceState,
    identityNamespace: access.actor.identityNamespace,
    tenantId: access.tenant._id,
    actorSubject: access.actor.subject,
  };
}

function pairingSummary(pairing: Doc<"connectionPairings">) {
  return {
    pairingId: pairing._id,
    requestId: pairing.requestId,
    installationId: pairing.installationId,
    installationLabel: pairing.installationLabel,
    challengeId: pairing.challengeId,
    expiresAt: pairing.expiresAt,
    state: pairing.state,
    connectionId: pairing.connectionId ?? null,
    identityNamespace: pairing.identityNamespace,
    tenantId: pairing.tenantId,
    actorSubject: pairing.actorSubject,
  };
}

function operationSummary(operation: Doc<"provisioningOperations">) {
  return {
    operationId: operation._id,
    requestId: operation.requestId,
    status: operation.status,
    installationId: operation.installationId,
    connectionId: operation.connectionId,
    blueprintId: operation.blueprintId,
    blueprintVersion: operation.blueprintVersion,
    registryProjectId: operation.registryProjectId ?? null,
    sourceRevision: operation.sourceRevision ?? null,
    errorCode: operation.errorCode ?? null,
  };
}

async function connectionById(
  ctx: DatabaseCtx,
  tenantId: Id<"tenants">,
  connectionId: string,
) {
  return await ctx.db
    .query("computerConnections")
    .withIndex("by_tenant_and_connection_id", (q) =>
      q.eq("tenantId", tenantId).eq("connectionId", connectionId),
    )
    .unique();
}

async function currentConnection(
  ctx: DatabaseCtx,
  tenantId: Id<"tenants">,
  actor: VerifiedActor,
  installationId: string,
) {
  const candidates = await ctx.db
    .query("computerConnections")
    .withIndex("by_tenant_and_installation_id", (q) =>
      q.eq("tenantId", tenantId).eq("installationId", installationId),
    )
    .order("desc")
    .take(20);
  return candidates.find(
    (item) =>
      item.identityNamespace === actor.identityNamespace &&
      item.pairedBySubject === actor.subject &&
      item.state === "active",
  ) ?? null;
}

async function requireConnection(
  ctx: DatabaseCtx,
  tenantId: Id<"tenants">,
  actor: VerifiedActor,
  connectionIdValue: string,
) {
  const connection = await connectionById(ctx, tenantId, identifier(connectionIdValue));
  if (
    connection === null ||
    connection.identityNamespace !== actor.identityNamespace ||
    connection.pairedBySubject !== actor.subject ||
    connection.state !== "active"
  ) {
    fail("CONNECTION_UNAVAILABLE");
  }
  return connection;
}

export const connectionContext = query({
  args: {},
  returns: v.object({
    identityNamespace: v.string(),
    tenantId: v.id("tenants"),
    actorSubject: v.string(),
  }),
  handler: async (ctx) => {
    const workspace = await requireWorkspace(ctx);
    return {
      identityNamespace: workspace.actor.identityNamespace,
      tenantId: workspace.tenant._id,
      actorSubject: workspace.actor.subject,
    };
  },
});

export const beginPairing = mutation({
  args: {
    requestId: v.string(),
    installationId: v.string(),
    installationLabel: v.string(),
    challengeId: v.string(),
    challengeDigest: v.string(),
    expiresAt: v.number(),
  },
  returns: pairingValidator,
  handler: async (ctx, args) => {
    const workspace = await requireWorkspace(ctx);
    const requestId = identifier(args.requestId);
    const installationId = identifier(args.installationId);
    const installationLabel = label(args.installationLabel);
    const challengeId = identifier(args.challengeId);
    if (!DIGEST.test(args.challengeDigest)) fail("INVALID_REQUEST");
    const now = Date.now();
    if (
      !Number.isSafeInteger(args.expiresAt) ||
      args.expiresAt <= now ||
      args.expiresAt > now + PAIRING_TTL_MS
    ) {
      fail("INVALID_REQUEST");
    }

    const previous = await ctx.db
      .query("connectionPairings")
      .withIndex("by_tenant_namespace_actor_request", (q) =>
        q
          .eq("tenantId", workspace.tenant._id)
          .eq("identityNamespace", workspace.actor.identityNamespace)
          .eq("actorSubject", workspace.actor.subject)
          .eq("requestId", requestId),
      )
      .unique();
    if (previous !== null) {
      if (
        previous.installationId !== installationId ||
        previous.installationLabel !== installationLabel ||
        previous.challengeId !== challengeId ||
        previous.challengeDigest !== args.challengeDigest ||
        previous.expiresAt !== args.expiresAt
      ) {
        fail("IDEMPOTENCY_CONFLICT");
      }
      return pairingSummary(previous);
    }

    const pairingId = await ctx.db.insert("connectionPairings", {
      tenantId: workspace.tenant._id,
      identityNamespace: workspace.actor.identityNamespace,
      actorSubject: workspace.actor.subject,
      requestId,
      installationId,
      installationLabel,
      challengeId,
      challengeDigest: args.challengeDigest,
      expiresAt: args.expiresAt,
      state: "pending",
      createdAt: now,
    });
    const pairing = await ctx.db.get(pairingId);
    if (pairing === null) throw new Error("Pairing was not readable after insert");
    return pairingSummary(pairing);
  },
});

export const connectionStatus = query({
  args: { installationId: v.string() },
  returns: v.object({ connection: v.union(connectionValidator, v.null()) }),
  handler: async (ctx, args) => {
    const workspace = await requireWorkspace(ctx);
    const connection = await currentConnection(
      ctx,
      workspace.tenant._id,
      workspace.actor,
      identifier(args.installationId),
    );
    return {
      connection: connection === null
        ? null
        : {
            installationId: connection.installationId,
            installationLabel: connection.installationLabel,
            connectionId: connection.connectionId,
            state: connection.state,
          },
    };
  },
});

export const revokeConnection = mutation({
  args: { connectionId: v.string(), requestId: v.string() },
  returns: v.object({ connectionId: v.string(), state: v.literal("revoked") }),
  handler: async (ctx, args) => {
    const workspace = await requireWorkspace(ctx);
    const connection = await connectionById(
      ctx,
      workspace.tenant._id,
      identifier(args.connectionId),
    );
    const requestId = identifier(args.requestId);
    if (
      connection === null ||
      connection.identityNamespace !== workspace.actor.identityNamespace ||
      connection.pairedBySubject !== workspace.actor.subject
    ) {
      fail("CONNECTION_UNAVAILABLE");
    }
    if (connection.state === "revoked") {
      if (connection.revocationRequestId !== requestId) fail("CONNECTION_REVOKED");
      return { connectionId: connection.connectionId, state: "revoked" as const };
    }
    const now = Date.now();
    await ctx.db.patch(connection._id, {
      state: "revoked",
      revocationRequestId: requestId,
      revokedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      tenantId: workspace.tenant._id,
      actorSubject: workspace.actor.subject,
      action: "computer_connection_revoked",
      requestId,
      occurredAt: now,
    });
    return { connectionId: connection.connectionId, state: "revoked" as const };
  },
});

export const beginProvisioning = mutation({
  args: {
    projectId: v.id("projects"),
    connectionId: v.string(),
    requestId: v.string(),
    blueprintId: v.string(),
    blueprintVersion: v.string(),
  },
  returns: provisioningValidator,
  handler: async (ctx, args) => {
    const access = await requireProjectEdit(ctx, args.projectId);
    const connection = await requireConnection(
      ctx,
      access.tenant._id,
      access.actor,
      args.connectionId,
    );
    const requestId = identifier(args.requestId);
    const blueprintId = identifier(args.blueprintId);
    const blueprintVersion = args.blueprintVersion;
    if (blueprintVersion.length > 32 || !BLUEPRINT_VERSION.test(blueprintVersion)) {
      fail("INVALID_REQUEST");
    }
    const existing = await ctx.db
      .query("provisioningOperations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (existing !== null) {
      if (
        existing.tenantId !== access.tenant._id ||
        existing.identityNamespace !== access.actor.identityNamespace ||
        existing.initiatingSubject !== access.actor.subject ||
        existing.requestId !== requestId ||
        existing.installationId !== connection.installationId ||
        existing.blueprintId !== blueprintId ||
        existing.blueprintVersion !== blueprintVersion
      ) {
        fail("IDEMPOTENCY_CONFLICT");
      }
      return { context: projectContext(access), operation: operationSummary(existing) };
    }
    const existingBinding = await ctx.db
      .query("projectRegistryBindings")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (existingBinding !== null || access.project.sourceState === "ready") {
      fail("IDEMPOTENCY_CONFLICT");
    }
    const now = Date.now();
    const operationId = await ctx.db.insert("provisioningOperations", {
      tenantId: access.tenant._id,
      projectId: args.projectId,
      identityNamespace: access.actor.identityNamespace,
      initiatingSubject: access.actor.subject,
      requestId,
      installationId: connection.installationId,
      connectionId: connection.connectionId,
      blueprintId,
      blueprintVersion,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { sourceState: "provisioning" });
    await ctx.db.insert("auditEvents", {
      tenantId: access.tenant._id,
      projectId: args.projectId,
      actorSubject: access.actor.subject,
      action: "project_provisioning_started",
      requestId,
      occurredAt: now,
    });
    const operation = await ctx.db.get(operationId);
    const project = await ctx.db.get(args.projectId);
    if (operation === null || project === null) {
      throw new Error("Provisioning operation was not readable after insert");
    }
    return {
      context: projectContext({ ...access, project }),
      operation: operationSummary(operation),
    };
  },
});

export const getProjectConnection = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    context: projectContextValidator,
    connection: v.union(connectionValidator, v.null()),
    operation: v.union(operationValidator, v.null()),
    binding: v.union(bindingValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    const access = await requireProjectEdit(ctx, args.projectId);
    const operation = await ctx.db
      .query("provisioningOperations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    const binding = await ctx.db
      .query("projectRegistryBindings")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (operation !== null && (
      operation.tenantId !== access.tenant._id ||
      operation.projectId !== access.project._id ||
      operation.identityNamespace !== access.actor.identityNamespace
    )) {
      fail("PROVISIONING_MISMATCH");
    }
    if (binding !== null && (
      binding.tenantId !== access.tenant._id ||
      binding.projectId !== access.project._id ||
      binding.identityNamespace !== access.actor.identityNamespace ||
      operation === null ||
      binding.operationId !== operation._id ||
      operation.status !== "ready" ||
      operation.registryProjectId !== binding.registryProjectId ||
      operation.sourceRevision !== binding.sourceRevision ||
      access.project.sourceState !== "ready" ||
      access.project.registryReference?.runnerInstallationId !== binding.installationId ||
      access.project.registryReference.registryProjectId !== binding.registryProjectId
    )) {
      fail("PROJECT_BINDING_MISMATCH");
    }
    const installationId = binding?.installationId ?? operation?.installationId;
    const connection = installationId === undefined
      ? null
      : await currentConnection(ctx, access.tenant._id, access.actor, installationId);
    return {
      context: projectContext(access),
      connection: connection === null
        ? null
        : {
            installationId: connection.installationId,
            installationLabel: connection.installationLabel,
            connectionId: connection.connectionId,
            state: connection.state,
          },
      operation: operation === null ? null : operationSummary(operation),
      binding: binding === null
        ? null
        : {
            bindingId: binding._id,
            installationId: binding.installationId,
            registryProjectId: binding.registryProjectId,
            sourceRevision: binding.sourceRevision,
          },
    };
  },
});

export const authorizeRegistry = query({
  args: {
    projectId: v.id("projects"),
    registryProjectId: v.string(),
    connectionId: v.string(),
    requestId: v.string(),
    write: v.boolean(),
    expectedRevision: v.optional(v.string()),
  },
  returns: v.object({
    identityNamespace: v.string(),
    tenantId: v.id("tenants"),
    actorSubject: v.string(),
    accountProjectId: v.id("projects"),
    projectName: v.string(),
    installationId: v.string(),
    connectionId: v.string(),
    registryProjectId: v.string(),
    requestId: v.string(),
    write: v.boolean(),
    expectedRevision: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const access = await requireProjectEdit(ctx, args.projectId);
    const registryProjectId = identifier(args.registryProjectId);
    const requestId = identifier(args.requestId);
    if (args.expectedRevision !== undefined && !REVISION.test(args.expectedRevision)) {
      fail("INVALID_REQUEST");
    }
    const binding = await ctx.db
      .query("projectRegistryBindings")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (
      binding === null ||
      binding.tenantId !== access.tenant._id ||
      binding.identityNamespace !== access.actor.identityNamespace ||
      binding.registryProjectId !== registryProjectId ||
      access.project.sourceState !== "ready" ||
      access.project.registryReference?.runnerInstallationId !== binding.installationId ||
      access.project.registryReference.registryProjectId !== binding.registryProjectId
    ) {
      fail("PROJECT_BINDING_MISMATCH");
    }
    const operation = await ctx.db.get(binding.operationId);
    if (
      operation === null ||
      operation.tenantId !== access.tenant._id ||
      operation.projectId !== access.project._id ||
      operation.status !== "ready" ||
      operation.registryProjectId !== binding.registryProjectId ||
      operation.sourceRevision !== binding.sourceRevision
    ) {
      fail("PROJECT_BINDING_MISMATCH");
    }
    const connection = await requireConnection(
      ctx,
      access.tenant._id,
      access.actor,
      args.connectionId,
    );
    if (connection.installationId !== binding.installationId) {
      fail("CONNECTION_SESSION_MISMATCH");
    }
    return {
      identityNamespace: access.actor.identityNamespace,
      tenantId: access.tenant._id,
      actorSubject: access.actor.subject,
      accountProjectId: access.project._id,
      projectName: access.project.name,
      installationId: binding.installationId,
      connectionId: connection.connectionId,
      registryProjectId: binding.registryProjectId,
      requestId,
      write: args.write,
      expectedRevision: args.expectedRevision ?? null,
    };
  },
});

export const confirmPairingByProof = internalMutation({
  args: {
    actor: actorValidator,
    tenantId: v.id("tenants"),
    pairingId: v.id("connectionPairings"),
    requestId: v.string(),
    installationId: v.string(),
    challengeId: v.string(),
    challengeDigest: v.string(),
    connectionId: v.string(),
    expiresAt: v.number(),
  },
  returns: connectionValidator,
  handler: async (ctx, args) => {
    const actor = verifiedActor(args.actor);
    const workspace = await requireWorkspaceForActor(ctx, actor);
    if (workspace.tenant._id !== args.tenantId) fail("TENANT_ACCESS_DENIED");
    const pairing = await ctx.db.get(args.pairingId);
    if (
      pairing === null ||
      pairing.tenantId !== workspace.tenant._id ||
      pairing.identityNamespace !== actor.identityNamespace ||
      pairing.actorSubject !== actor.subject ||
      pairing.requestId !== identifier(args.requestId) ||
      pairing.installationId !== identifier(args.installationId) ||
      pairing.challengeId !== identifier(args.challengeId) ||
      pairing.challengeDigest !== args.challengeDigest ||
      pairing.expiresAt !== args.expiresAt
    ) {
      fail("PAIRING_MISMATCH");
    }
    const connectionId = identifier(args.connectionId);
    if (pairing.state === "consumed") {
      if (pairing.connectionId !== connectionId) fail("IDEMPOTENCY_CONFLICT");
      const existing = await connectionById(ctx, workspace.tenant._id, connectionId);
      if (existing === null || existing.state !== "active") fail("CONNECTION_REVOKED");
      return {
        installationId: existing.installationId,
        installationLabel: existing.installationLabel,
        connectionId: existing.connectionId,
        state: existing.state,
      };
    }
    if (pairing.expiresAt <= Date.now()) fail("PAIRING_EXPIRED");

    let connection = await connectionById(ctx, workspace.tenant._id, connectionId);
    const now = Date.now();
    if (connection !== null) {
      if (
        connection.identityNamespace !== actor.identityNamespace ||
        connection.pairedBySubject !== actor.subject ||
        connection.installationId !== pairing.installationId ||
        connection.state !== "active"
      ) {
        fail("IDEMPOTENCY_CONFLICT");
      }
    } else {
      const connectionDocId = await ctx.db.insert("computerConnections", {
        tenantId: workspace.tenant._id,
        identityNamespace: actor.identityNamespace,
        pairedBySubject: actor.subject,
        installationId: pairing.installationId,
        installationLabel: pairing.installationLabel,
        connectionId,
        state: "active",
        createdAt: now,
        updatedAt: now,
      });
      connection = await ctx.db.get(connectionDocId);
      if (connection === null) throw new Error("Connection was not readable after insert");
      await ctx.db.insert("auditEvents", {
        tenantId: workspace.tenant._id,
        actorSubject: actor.subject,
        action: "computer_connected",
        requestId: pairing.requestId,
        occurredAt: now,
      });
    }
    const priorActiveConnections = (await ctx.db
      .query("computerConnections")
      .withIndex("by_tenant_and_installation_id", (q) =>
        q
          .eq("tenantId", workspace.tenant._id)
          .eq("installationId", pairing.installationId),
      )
      .order("desc")
      .take(20))
      .filter((item) =>
        item.identityNamespace === actor.identityNamespace &&
        item.pairedBySubject === actor.subject &&
        item.state === "active" &&
        item._id !== connection._id,
      );
    if (priorActiveConnections.length > 1) fail("CONNECTION_UNAVAILABLE");
    for (const prior of priorActiveConnections) {
      await ctx.db.patch(prior._id, {
        state: "revoked",
        revocationRequestId: `replacement:${String(pairing._id)}`,
        revokedAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(pairing._id, {
      state: "consumed",
      connectionId,
      consumedAt: now,
    });
    return {
      installationId: connection.installationId,
      installationLabel: connection.installationLabel,
      connectionId: connection.connectionId,
      state: connection.state,
    };
  },
});

export const acknowledgeProvisioningByProof = internalMutation({
  args: {
    actor: actorValidator,
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    operationId: v.id("provisioningOperations"),
    installationId: v.string(),
    connectionId: v.string(),
    registryProjectId: v.string(),
    sourceRevision: v.string(),
    requestId: v.string(),
  },
  returns: v.object({ context: projectContextValidator, binding: bindingValidator }),
  handler: async (ctx, args) => {
    const actor = verifiedActor(args.actor);
    const access = await requireProjectEditForActor(ctx, actor, args.projectId);
    if (access.tenant._id !== args.tenantId) fail("TENANT_ACCESS_DENIED");
    const connection = await requireConnection(ctx, access.tenant._id, actor, args.connectionId);
    const registryProjectId = identifier(args.registryProjectId);
    const requestId = identifier(args.requestId);
    if (connection.installationId !== identifier(args.installationId)) {
      fail("CONNECTION_SESSION_MISMATCH");
    }
    if (!REVISION.test(args.sourceRevision)) fail("INVALID_REQUEST");
    const operation = await ctx.db.get(args.operationId);
    if (
      operation === null ||
      operation.tenantId !== access.tenant._id ||
      operation.projectId !== args.projectId ||
      operation.identityNamespace !== actor.identityNamespace ||
      operation.initiatingSubject !== actor.subject ||
      operation.installationId !== connection.installationId ||
      operation.requestId !== requestId
    ) {
      fail("PROVISIONING_MISMATCH");
    }
    const existing = await ctx.db
      .query("projectRegistryBindings")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (existing !== null) {
      if (
        existing.operationId !== operation._id ||
        existing.installationId !== connection.installationId ||
        existing.registryProjectId !== registryProjectId ||
        existing.sourceRevision !== args.sourceRevision
      ) {
        fail("IDEMPOTENCY_CONFLICT");
      }
      if (
        operation.status !== "ready" ||
        operation.registryProjectId !== existing.registryProjectId ||
        operation.sourceRevision !== existing.sourceRevision ||
        access.project.sourceState !== "ready" ||
        access.project.registryReference?.runnerInstallationId !== existing.installationId ||
        access.project.registryReference.registryProjectId !== existing.registryProjectId
      ) {
        fail("PROVISIONING_MISMATCH");
      }
      return {
        context: projectContext(access),
        binding: {
          bindingId: existing._id,
          installationId: existing.installationId,
          registryProjectId: existing.registryProjectId,
          sourceRevision: existing.sourceRevision,
        },
      };
    }
    if (
      operation.status === "ready" ||
      operation.registryProjectId !== undefined ||
      operation.sourceRevision !== undefined
    ) {
      fail("PROVISIONING_MISMATCH");
    }
    const claimed = await ctx.db
      .query("projectRegistryBindings")
      .withIndex("by_namespace_installation_registry", (q) =>
        q
          .eq("identityNamespace", actor.identityNamespace)
          .eq("installationId", connection.installationId)
          .eq("registryProjectId", registryProjectId),
      )
      .unique();
    if (claimed !== null) fail("REGISTRY_PROJECT_ALREADY_BOUND");
    if (
      access.project.registryReference !== undefined &&
      (access.project.registryReference.runnerInstallationId !== connection.installationId ||
        access.project.registryReference.registryProjectId !== registryProjectId)
    ) {
      fail("IDEMPOTENCY_CONFLICT");
    }
    const now = Date.now();
    const bindingId = await ctx.db.insert("projectRegistryBindings", {
      tenantId: access.tenant._id,
      projectId: args.projectId,
      operationId: operation._id,
      identityNamespace: actor.identityNamespace,
      installationId: connection.installationId,
      connectionId: connection.connectionId,
      registryProjectId,
      sourceRevision: args.sourceRevision,
      acknowledgedBySubject: actor.subject,
      createdAt: now,
    });
    await ctx.db.patch(operation._id, {
      status: "ready",
      registryProjectId,
      sourceRevision: args.sourceRevision,
      errorCode: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, {
      sourceState: "ready",
      registryReference: {
        runnerInstallationId: connection.installationId,
        registryProjectId,
      },
    });
    await ctx.db.insert("auditEvents", {
      tenantId: access.tenant._id,
      projectId: args.projectId,
      actorSubject: actor.subject,
      action: "project_registry_bound",
      requestId,
      occurredAt: now,
    });
    const project = await ctx.db.get(args.projectId);
    const binding = await ctx.db.get(bindingId);
    if (project === null || binding === null) throw new Error("Binding was not readable after insert");
    return {
      context: projectContext({ ...access, project }),
      binding: {
        bindingId: binding._id,
        installationId: binding.installationId,
        registryProjectId: binding.registryProjectId,
        sourceRevision: binding.sourceRevision,
      },
    };
  },
});

export const failProvisioningByProof = internalMutation({
  args: {
    actor: actorValidator,
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    operationId: v.id("provisioningOperations"),
    installationId: v.string(),
    connectionId: v.string(),
    errorCode: v.string(),
    requestId: v.string(),
  },
  returns: provisioningValidator,
  handler: async (ctx, args) => {
    const actor = verifiedActor(args.actor);
    const access = await requireProjectEditForActor(ctx, actor, args.projectId);
    if (access.tenant._id !== args.tenantId) fail("TENANT_ACCESS_DENIED");
    const connection = await requireConnection(ctx, access.tenant._id, actor, args.connectionId);
    if (connection.installationId !== identifier(args.installationId)) {
      fail("CONNECTION_SESSION_MISMATCH");
    }
    const errorCode = args.errorCode;
    if (!ERROR_CODE.test(errorCode)) fail("INVALID_REQUEST");
    const operation = await ctx.db.get(args.operationId);
    if (
      operation === null ||
      operation.projectId !== args.projectId ||
      operation.tenantId !== access.tenant._id ||
      operation.identityNamespace !== actor.identityNamespace ||
      operation.initiatingSubject !== actor.subject ||
      operation.installationId !== connection.installationId ||
      operation.requestId !== identifier(args.requestId)
    ) {
      fail("PROVISIONING_MISMATCH");
    }
    if (operation.status === "ready") fail("IDEMPOTENCY_CONFLICT");
    if (operation.status === "failed") {
      if (operation.errorCode !== errorCode) fail("IDEMPOTENCY_CONFLICT");
      return { context: projectContext(access), operation: operationSummary(operation) };
    }
    const now = Date.now();
    await ctx.db.patch(operation._id, { status: "failed", errorCode, updatedAt: now });
    await ctx.db.insert("auditEvents", {
      tenantId: access.tenant._id,
      projectId: args.projectId,
      actorSubject: actor.subject,
      action: "project_provisioning_failed",
      requestId: operation.requestId,
      occurredAt: now,
    });
    const updated = await ctx.db.get(operation._id);
    if (updated === null) throw new Error("Provisioning operation disappeared");
    return { context: projectContext(access), operation: operationSummary(updated) };
  },
});
