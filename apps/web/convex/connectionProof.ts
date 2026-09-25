"use node";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { requireActor } from "./identity";

const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const PROOF = /^[A-Za-z0-9_-]{43}$/;

type ConnectionResult = {
  installationId: string;
  installationLabel: string;
  connectionId: string;
  state: "active" | "revoked";
};

type AcknowledgementResult = {
  context: {
    projectId: import("./_generated/dataModel").Id<"projects">;
    projectName: string;
    sourceState: "unlinked" | "provisioning" | "ready";
    identityNamespace: string;
    tenantId: import("./_generated/dataModel").Id<"tenants">;
    actorSubject: string;
  };
  binding: {
    bindingId: import("./_generated/dataModel").Id<"projectRegistryBindings">;
    installationId: string;
    registryProjectId: string;
    sourceRevision: string;
  };
};

type FailureResult = {
  context: AcknowledgementResult["context"];
  operation: {
    operationId: import("./_generated/dataModel").Id<"provisioningOperations">;
    requestId: string;
    status: "pending" | "failed" | "ready";
    installationId: string;
    connectionId: string;
    blueprintId: string;
    blueprintVersion: string;
    registryProjectId: string | null;
    sourceRevision: string | null;
    errorCode: string | null;
  };
};

function fail(code: string): never {
  throw new ConvexError({ code });
}

function secret(): string {
  const value = process.env.STELLAR_CONNECTION_SECRET;
  if (!value || value.length < 32) fail("CONNECTION_PROOF_CONFIG_MISSING");
  return value;
}

function verify(payload: string, proof: string): void {
  if (!PROOF.test(proof)) fail("CONNECTION_PROOF_INVALID");
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const actualBytes = Buffer.from(proof);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    fail("CONNECTION_PROOF_INVALID");
  }
}

export function confirmPairingPayload(args: {
  identityNamespace: string;
  tenantId: string;
  actorSubject: string;
  pairingId: string;
  requestId: string;
  installationId: string;
  challengeId: string;
  challenge: string;
  connectionId: string;
  expiresAt: number;
}): string {
  return JSON.stringify([
    "stellar-connection-v1",
    "confirm-pairing",
    args.identityNamespace,
    args.tenantId,
    args.actorSubject,
    args.pairingId,
    args.requestId,
    args.installationId,
    args.challengeId,
    args.challenge,
    args.connectionId,
    String(args.expiresAt),
  ]);
}

export function acknowledgeProvisioningPayload(args: {
  identityNamespace: string;
  tenantId: string;
  actorSubject: string;
  projectId: string;
  operationId: string;
  installationId: string;
  connectionId: string;
  registryProjectId: string;
  sourceRevision: string;
  requestId: string;
}): string {
  return JSON.stringify([
    "stellar-connection-v1",
    "acknowledge-provisioning",
    args.identityNamespace,
    args.tenantId,
    args.actorSubject,
    args.projectId,
    args.operationId,
    args.installationId,
    args.connectionId,
    args.registryProjectId,
    args.sourceRevision,
    args.requestId,
  ]);
}

export function failProvisioningPayload(args: {
  identityNamespace: string;
  tenantId: string;
  actorSubject: string;
  projectId: string;
  operationId: string;
  installationId: string;
  connectionId: string;
  errorCode: string;
  requestId: string;
}): string {
  return JSON.stringify([
    "stellar-connection-v1",
    "fail-provisioning",
    args.identityNamespace,
    args.tenantId,
    args.actorSubject,
    args.projectId,
    args.operationId,
    args.installationId,
    args.connectionId,
    args.errorCode,
    args.requestId,
  ]);
}

export const confirmPairing = action({
  args: {
    identityNamespace: v.string(),
    tenantId: v.id("tenants"),
    actorSubject: v.string(),
    pairingId: v.id("connectionPairings"),
    requestId: v.string(),
    installationId: v.string(),
    challengeId: v.string(),
    challenge: v.string(),
    connectionId: v.string(),
    expiresAt: v.number(),
    proof: v.string(),
  },
  returns: v.object({
    installationId: v.string(),
    installationLabel: v.string(),
    connectionId: v.string(),
    state: v.union(v.literal("active"), v.literal("revoked")),
  }),
  handler: async (ctx, args): Promise<ConnectionResult> => {
    const actor = await requireActor(ctx);
    if (
      actor.identityNamespace !== args.identityNamespace ||
      actor.subject !== args.actorSubject ||
      !CHALLENGE.test(args.challenge)
    ) {
      fail("PAIRING_MISMATCH");
    }
    verify(confirmPairingPayload({ ...args, tenantId: String(args.tenantId), pairingId: String(args.pairingId) }), args.proof);
    const challengeDigest = createHash("sha256").update(args.challenge).digest("hex");
    return await ctx.runMutation(internal.connected.confirmPairingByProof, {
      actor: {
        identityNamespace: actor.identityNamespace,
        subject: actor.subject,
        organizationId: actor.organizationId ?? null,
      },
      tenantId: args.tenantId,
      pairingId: args.pairingId,
      requestId: args.requestId,
      installationId: args.installationId,
      challengeId: args.challengeId,
      challengeDigest,
      connectionId: args.connectionId,
      expiresAt: args.expiresAt,
    });
  },
});

export const acknowledgeProvisioning = action({
  args: {
    identityNamespace: v.string(),
    tenantId: v.id("tenants"),
    actorSubject: v.string(),
    projectId: v.id("projects"),
    operationId: v.id("provisioningOperations"),
    installationId: v.string(),
    connectionId: v.string(),
    registryProjectId: v.string(),
    sourceRevision: v.string(),
    requestId: v.string(),
    proof: v.string(),
  },
  returns: v.object({
    context: v.object({
      projectId: v.id("projects"),
      projectName: v.string(),
      sourceState: v.union(
        v.literal("unlinked"),
        v.literal("provisioning"),
        v.literal("ready"),
      ),
      identityNamespace: v.string(),
      tenantId: v.id("tenants"),
      actorSubject: v.string(),
    }),
    binding: v.object({
      bindingId: v.id("projectRegistryBindings"),
      installationId: v.string(),
      registryProjectId: v.string(),
      sourceRevision: v.string(),
    }),
  }),
  handler: async (ctx, args): Promise<AcknowledgementResult> => {
    const actor = await requireActor(ctx);
    if (actor.identityNamespace !== args.identityNamespace || actor.subject !== args.actorSubject) {
      fail("PROVISIONING_MISMATCH");
    }
    verify(acknowledgeProvisioningPayload({
      ...args,
      tenantId: String(args.tenantId),
      projectId: String(args.projectId),
      operationId: String(args.operationId),
    }), args.proof);
    return await ctx.runMutation(internal.connected.acknowledgeProvisioningByProof, {
      actor: {
        identityNamespace: actor.identityNamespace,
        subject: actor.subject,
        organizationId: actor.organizationId ?? null,
      },
      tenantId: args.tenantId,
      projectId: args.projectId,
      operationId: args.operationId,
      installationId: args.installationId,
      connectionId: args.connectionId,
      registryProjectId: args.registryProjectId,
      sourceRevision: args.sourceRevision,
      requestId: args.requestId,
    });
  },
});

export const failProvisioning = action({
  args: {
    identityNamespace: v.string(),
    tenantId: v.id("tenants"),
    actorSubject: v.string(),
    projectId: v.id("projects"),
    operationId: v.id("provisioningOperations"),
    installationId: v.string(),
    connectionId: v.string(),
    errorCode: v.string(),
    requestId: v.string(),
    proof: v.string(),
  },
  returns: v.object({
    context: v.object({
      projectId: v.id("projects"),
      projectName: v.string(),
      sourceState: v.union(
        v.literal("unlinked"),
        v.literal("provisioning"),
        v.literal("ready"),
      ),
      identityNamespace: v.string(),
      tenantId: v.id("tenants"),
      actorSubject: v.string(),
    }),
    operation: v.object({
      operationId: v.id("provisioningOperations"),
      requestId: v.string(),
      status: v.union(v.literal("pending"), v.literal("failed"), v.literal("ready")),
      installationId: v.string(),
      connectionId: v.string(),
      blueprintId: v.string(),
      blueprintVersion: v.string(),
      registryProjectId: v.union(v.string(), v.null()),
      sourceRevision: v.union(v.string(), v.null()),
      errorCode: v.union(v.string(), v.null()),
    }),
  }),
  handler: async (ctx, args): Promise<FailureResult> => {
    const actor = await requireActor(ctx);
    if (actor.identityNamespace !== args.identityNamespace || actor.subject !== args.actorSubject) {
      fail("PROVISIONING_MISMATCH");
    }
    verify(failProvisioningPayload({
      ...args,
      tenantId: String(args.tenantId),
      projectId: String(args.projectId),
      operationId: String(args.operationId),
    }), args.proof);
    return await ctx.runMutation(internal.connected.failProvisioningByProof, {
      actor: {
        identityNamespace: actor.identityNamespace,
        subject: actor.subject,
        organizationId: actor.organizationId ?? null,
      },
      tenantId: args.tenantId,
      projectId: args.projectId,
      operationId: args.operationId,
      installationId: args.installationId,
      connectionId: args.connectionId,
      errorCode: args.errorCode,
      requestId: args.requestId,
    });
  },
});
