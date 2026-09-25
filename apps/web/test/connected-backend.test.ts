import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import { confirmPairingPayload } from "../convex/connectionProof";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const CLIENT_ID = "client_test_stellar";
const ISSUER = "https://api.workos.com/";
const MODULES = import.meta.glob("../convex/**/*.*s");
const CHALLENGE = "c".repeat(43);

function identity(subject: string, organizationId?: string) {
  return {
    subject,
    issuer: ISSUER,
    ...(organizationId === undefined ? {} : { org_id: organizationId }),
  };
}

function internalActor(subject: string, organizationId: string | null = null) {
  return { identityNamespace: CLIENT_ID, subject, organizationId };
}

function digest(challenge = CHALLENGE) {
  return createHash("sha256").update(challenge).digest("hex");
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: { code } });
}

async function pair(
  t: ReturnType<typeof convexTest>,
  subject: string,
  options: {
    installationId?: string;
    connectionId?: string;
    requestId?: string;
    organizationId?: string;
  } = {},
) {
  const installationId = options.installationId ?? "installation-local";
  const connectionId = options.connectionId ?? "connection-local";
  const requestId = options.requestId ?? "pair-request";
  const actor = t.withIdentity(identity(subject, options.organizationId));
  const context = await actor.query(api.connected.connectionContext, {});
  const expiresAt = Date.now() + 5 * 60_000;
  const pairing = await actor.mutation(api.connected.beginPairing, {
    requestId,
    installationId,
    installationLabel: "Local computer",
    challengeId: `${requestId}-challenge`,
    challengeDigest: digest(),
    expiresAt,
  });
  const connection = await t.mutation(internal.connected.confirmPairingByProof, {
    actor: internalActor(subject, options.organizationId ?? null),
    tenantId: context.tenantId,
    pairingId: pairing.pairingId,
    requestId,
    installationId,
    challengeId: `${requestId}-challenge`,
    challengeDigest: digest(),
    connectionId,
    expiresAt,
  });
  return { actor, context, pairing, connection };
}

async function createProject(
  actor: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  name: string,
  requestId: string,
) {
  return await actor.mutation(api.platform.createProject, { name, requestId });
}

async function acknowledge(
  t: ReturnType<typeof convexTest>,
  subject: string,
  input: {
    tenantId: Id<"tenants">;
    projectId: Id<"projects">;
    operationId: Id<"provisioningOperations">;
    installationId: string;
    connectionId: string;
    registryProjectId: string;
    sourceRevision?: string;
    requestId: string;
    organizationId?: string;
  },
) {
  return await t.mutation(internal.connected.acknowledgeProvisioningByProof, {
    actor: internalActor(subject, input.organizationId ?? null),
    tenantId: input.tenantId,
    projectId: input.projectId,
    operationId: input.operationId,
    installationId: input.installationId,
    connectionId: input.connectionId,
    registryProjectId: input.registryProjectId,
    sourceRevision: input.sourceRevision ?? "revision-0001",
    requestId: input.requestId,
  });
}

describe("connected backend authorization and recovery", () => {
  beforeEach(() => {
    process.env.WORKOS_CLIENT_ID = CLIENT_ID;
    process.env.STELLAR_CONNECTION_SECRET = "connection-test-secret-value-32-bytes";
  });

  afterEach(() => {
    delete process.env.WORKOS_CLIENT_ID;
    delete process.env.STELLAR_CONNECTION_SECRET;
    vi.restoreAllMocks();
  });

  it("rejects invalid proof, swapped identity scope, and an expired single-use challenge", async () => {
    const now = 2_000_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const context = await owner.query(api.connected.connectionContext, {});
    const expiresAt = now + 30_000;
    const pairing = await owner.mutation(api.connected.beginPairing, {
      requestId: "pair-proof",
      installationId: "installation-proof",
      installationLabel: "Proof computer",
      challengeId: "challenge-proof",
      challengeDigest: digest(),
      expiresAt,
    });
    const proofArgs = {
      identityNamespace: CLIENT_ID,
      tenantId: context.tenantId,
      actorSubject: "owner",
      pairingId: pairing.pairingId,
      requestId: "pair-proof",
      installationId: "installation-proof",
      challengeId: "challenge-proof",
      challenge: CHALLENGE,
      connectionId: "connection-proof",
      expiresAt,
    };
    expect(confirmPairingPayload({
      ...proofArgs,
      tenantId: String(context.tenantId),
      pairingId: String(pairing.pairingId),
    })).toBe(JSON.stringify([
      "stellar-connection-v1",
      "confirm-pairing",
      CLIENT_ID,
      String(context.tenantId),
      "owner",
      String(pairing.pairingId),
      "pair-proof",
      "installation-proof",
      "challenge-proof",
      CHALLENGE,
      "connection-proof",
      String(expiresAt),
    ]));
    await expectCode(
      owner.action(api.connectionProof.confirmPairing, {
        ...proofArgs,
        proof: "x".repeat(43),
      }),
      "CONNECTION_PROOF_INVALID",
    );
    const proof = createHmac("sha256", process.env.STELLAR_CONNECTION_SECRET!)
      .update(confirmPairingPayload({
        ...proofArgs,
        tenantId: String(context.tenantId),
        pairingId: String(pairing.pairingId),
      }))
      .digest("base64url");
    await expectCode(
      t.withIdentity(identity("attacker")).action(api.connectionProof.confirmPairing, {
        ...proofArgs,
        proof,
      }),
      "PAIRING_MISMATCH",
    );
    await expect(
      owner.action(api.connectionProof.confirmPairing, { ...proofArgs, proof }),
    ).resolves.toMatchObject({
      installationId: "installation-proof",
      connectionId: "connection-proof",
      state: "active",
    });

    const expiring = await owner.mutation(api.connected.beginPairing, {
      requestId: "pair-expiring",
      installationId: "installation-expiring",
      installationLabel: "Expiring computer",
      challengeId: "challenge-expiring",
      challengeDigest: digest(),
      expiresAt,
    });
    const expiringArgs = {
      ...proofArgs,
      pairingId: expiring.pairingId,
      requestId: "pair-expiring",
      installationId: "installation-expiring",
      challengeId: "challenge-expiring",
      connectionId: "connection-expiring",
    };
    const expiringProof = createHmac("sha256", process.env.STELLAR_CONNECTION_SECRET!)
      .update(confirmPairingPayload({
        ...expiringArgs,
        tenantId: String(context.tenantId),
        pairingId: String(expiring.pairingId),
      }))
      .digest("base64url");
    vi.spyOn(Date, "now").mockReturnValue(now + 30_001);
    await expectCode(
      owner.action(api.connectionProof.confirmPairing, {
        ...expiringArgs,
        proof: expiringProof,
      }),
      "PAIRING_EXPIRED",
    );
  });

  it("records a scoped, idempotent pairing and accepts only the proof-verified tuple", async () => {
    const t = convexTest(schema, MODULES);
    const actor = t.withIdentity(identity("owner"));
    await actor.mutation(api.platform.bootstrapWorkspace, {});
    const context = await actor.query(api.connected.connectionContext, {});
    const expiresAt = Date.now() + 60_000;
    const args = {
      requestId: "pair-one",
      installationId: "installation-one",
      installationLabel: "Office Mac",
      challengeId: "challenge-one",
      challengeDigest: digest(),
      expiresAt,
    };
    const first = await actor.mutation(api.connected.beginPairing, args);
    expect(await actor.mutation(api.connected.beginPairing, args)).toEqual(first);
    await expectCode(
      actor.mutation(api.connected.beginPairing, {
        ...args,
        installationId: "installation-swapped",
      }),
      "IDEMPOTENCY_CONFLICT",
    );

    await expectCode(
      t.mutation(internal.connected.confirmPairingByProof, {
        actor: internalActor("owner"),
        tenantId: context.tenantId,
        pairingId: first.pairingId,
        requestId: args.requestId,
        installationId: args.installationId,
        challengeId: args.challengeId,
        challengeDigest: digest("d".repeat(43)),
        connectionId: "connection-one",
        expiresAt,
      }),
      "PAIRING_MISMATCH",
    );

    const connected = await t.mutation(internal.connected.confirmPairingByProof, {
      actor: internalActor("owner"),
      tenantId: context.tenantId,
      pairingId: first.pairingId,
      requestId: args.requestId,
      installationId: args.installationId,
      challengeId: args.challengeId,
      challengeDigest: args.challengeDigest,
      connectionId: "connection-one",
      expiresAt,
    });
    expect(connected).toMatchObject({
      installationId: "installation-one",
      connectionId: "connection-one",
      state: "active",
    });
    await expect(
      t.mutation(internal.connected.confirmPairingByProof, {
        actor: internalActor("owner"),
        tenantId: context.tenantId,
        pairingId: first.pairingId,
        requestId: args.requestId,
        installationId: args.installationId,
        challengeId: args.challengeId,
        challengeDigest: args.challengeDigest,
        connectionId: "connection-one",
        expiresAt,
      }),
    ).resolves.toEqual(connected);
    expect(await actor.query(api.connected.connectionStatus, {
      installationId: "installation-one",
    })).toEqual({ connection: connected });

    const replacement = await pair(t, "owner", {
      installationId: "installation-one",
      connectionId: "connection-two",
      requestId: "pair-two",
    });
    expect(await actor.query(api.connected.connectionStatus, {
      installationId: "installation-one",
    })).toEqual({ connection: replacement.connection });
    await expectCode(
      t.mutation(internal.connected.confirmPairingByProof, {
        actor: internalActor("owner"),
        tenantId: context.tenantId,
        pairingId: first.pairingId,
        requestId: args.requestId,
        installationId: args.installationId,
        challengeId: args.challengeId,
        challengeDigest: args.challengeDigest,
        connectionId: "connection-one",
        expiresAt,
      }),
      "CONNECTION_REVOKED",
    );
  });

  it("recovers a lost provisioning response without allocating another binding", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await createProject(owner, "Test", "create-test");
    const paired = await pair(t, "owner");
    const request = {
      projectId: project._id,
      connectionId: paired.connection.connectionId,
      requestId: "provision-test",
      blueprintId: "astro-style-lab",
      blueprintVersion: "1.0.0",
    };
    const first = await owner.mutation(api.connected.beginProvisioning, request);
    const replay = await owner.mutation(api.connected.beginProvisioning, request);
    expect(replay).toEqual(first);
    await expectCode(
      owner.mutation(api.connected.beginProvisioning, {
        ...request,
        blueprintVersion: "2.0.0",
      }),
      "IDEMPOTENCY_CONFLICT",
    );

    const acknowledgement = await acknowledge(t, "owner", {
      tenantId: paired.context.tenantId,
      projectId: project._id,
      operationId: first.operation.operationId,
      installationId: paired.connection.installationId,
      connectionId: paired.connection.connectionId,
      registryProjectId: "registry-test",
      requestId: request.requestId,
    });
    await expect(
      acknowledge(t, "owner", {
        tenantId: paired.context.tenantId,
        projectId: project._id,
        operationId: first.operation.operationId,
        installationId: paired.connection.installationId,
        connectionId: paired.connection.connectionId,
        registryProjectId: "registry-test",
        requestId: request.requestId,
      }),
    ).resolves.toEqual(acknowledgement);

    const recovered = await owner.query(api.connected.getProjectConnection, {
      projectId: project._id,
    });
    expect(recovered).toMatchObject({
      context: { projectId: project._id, projectName: "Test", sourceState: "ready" },
      operation: {
        operationId: first.operation.operationId,
        requestId: "provision-test",
        status: "ready",
        blueprintId: "astro-style-lab",
        blueprintVersion: "1.0.0",
        registryProjectId: "registry-test",
      },
      binding: {
        installationId: "installation-local",
        registryProjectId: "registry-test",
      },
    });
    const counts = await t.run(async (ctx) => ({
      operations: (await ctx.db.query("provisioningOperations").collect()).length,
      bindings: (await ctx.db.query("projectRegistryBindings").collect()).length,
    }));
    expect(counts).toEqual({ operations: 1, bindings: 1 });
    const completedRetry = await owner.mutation(api.connected.beginProvisioning, request);
    expect(completedRetry).toMatchObject({
      context: { sourceState: "ready" },
      operation: {
        operationId: first.operation.operationId,
        status: "ready",
        sourceRevision: "revision-0001",
      },
    });
  });

  it("fails closed for wrong account project, registry project, and connection session", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const firstProject = await createProject(owner, "First", "create-first");
    const secondProject = await createProject(owner, "Second", "create-second");
    const paired = await pair(t, "owner");
    const operation = await owner.mutation(api.connected.beginProvisioning, {
      projectId: firstProject._id,
      connectionId: paired.connection.connectionId,
      requestId: "provision-first",
      blueprintId: "astro-style-lab",
      blueprintVersion: "1.0.0",
    });
    await acknowledge(t, "owner", {
      tenantId: paired.context.tenantId,
      projectId: firstProject._id,
      operationId: operation.operation.operationId,
      installationId: paired.connection.installationId,
      connectionId: paired.connection.connectionId,
      registryProjectId: "registry-first",
      requestId: "provision-first",
    });

    const valid = {
      projectId: firstProject._id,
      registryProjectId: "registry-first",
      connectionId: "connection-local",
      requestId: "read-first",
      write: false,
    };
    await expect(owner.query(api.connected.authorizeRegistry, valid)).resolves.toMatchObject({
      accountProjectId: firstProject._id,
      registryProjectId: "registry-first",
      installationId: "installation-local",
    });
    await expectCode(
      owner.query(api.connected.authorizeRegistry, {
        ...valid,
        projectId: secondProject._id,
      }),
      "PROJECT_BINDING_MISMATCH",
    );
    await expectCode(
      owner.query(api.connected.authorizeRegistry, {
        ...valid,
        registryProjectId: "registry-swapped",
      }),
      "PROJECT_BINDING_MISMATCH",
    );
    await expectCode(
      owner.query(api.connected.authorizeRegistry, {
        ...valid,
        connectionId: "connection-swapped",
      }),
      "CONNECTION_UNAVAILABLE",
    );
  });

  it("keeps a failed allocation owned and resumes the same operation to readiness", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await createProject(owner, "Recoverable", "create-recoverable");
    const paired = await pair(t, "owner");
    const request = {
      projectId: project._id,
      connectionId: paired.connection.connectionId,
      requestId: "provision-recoverable",
      blueprintId: "astro-style-lab",
      blueprintVersion: "1.0.0",
    };
    const operation = await owner.mutation(api.connected.beginProvisioning, request);
    const failed = await t.mutation(internal.connected.failProvisioningByProof, {
      actor: internalActor("owner"),
      tenantId: paired.context.tenantId,
      projectId: project._id,
      operationId: operation.operation.operationId,
      installationId: paired.connection.installationId,
      connectionId: paired.connection.connectionId,
      errorCode: "RUNNER_UNAVAILABLE",
      requestId: request.requestId,
    });
    expect(failed.operation).toMatchObject({ status: "failed", errorCode: "RUNNER_UNAVAILABLE" });
    await expect(
      t.mutation(internal.connected.failProvisioningByProof, {
        actor: internalActor("owner"),
        tenantId: paired.context.tenantId,
        projectId: project._id,
        operationId: operation.operation.operationId,
        installationId: paired.connection.installationId,
        connectionId: paired.connection.connectionId,
        errorCode: "RUNNER_UNAVAILABLE",
        requestId: request.requestId,
      }),
    ).resolves.toEqual(failed);
    expect(await owner.mutation(api.connected.beginProvisioning, request)).toEqual(failed);

    await acknowledge(t, "owner", {
      tenantId: paired.context.tenantId,
      projectId: project._id,
      operationId: operation.operation.operationId,
      installationId: paired.connection.installationId,
      connectionId: paired.connection.connectionId,
      registryProjectId: "registry-recovered",
      requestId: request.requestId,
    });
    expect(await owner.query(api.connected.getProjectConnection, {
      projectId: project._id,
    })).toMatchObject({
      context: { sourceState: "ready" },
      operation: { status: "ready", registryProjectId: "registry-recovered", errorCode: null },
    });
  });

  it("revokes old sessions but allows a newly confirmed connection for the immutable installation binding", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await createProject(owner, "Reconnect", "create-reconnect");
    const first = await pair(t, "owner", {
      installationId: "installation-stable",
      connectionId: "connection-old",
      requestId: "pair-old",
    });
    const operation = await owner.mutation(api.connected.beginProvisioning, {
      projectId: project._id,
      connectionId: first.connection.connectionId,
      requestId: "provision-reconnect",
      blueprintId: "astro-style-lab",
      blueprintVersion: "1.0.0",
    });
    await acknowledge(t, "owner", {
      tenantId: first.context.tenantId,
      projectId: project._id,
      operationId: operation.operation.operationId,
      installationId: "installation-stable",
      connectionId: "connection-old",
      registryProjectId: "registry-stable",
      requestId: "provision-reconnect",
    });
    await owner.mutation(api.connected.revokeConnection, {
      connectionId: "connection-old",
      requestId: "revoke-old",
    });
    await expectCode(
      owner.query(api.connected.authorizeRegistry, {
        projectId: project._id,
        registryProjectId: "registry-stable",
        connectionId: "connection-old",
        requestId: "after-revoke",
        write: false,
      }),
      "CONNECTION_UNAVAILABLE",
    );
    await expectCode(
      acknowledge(t, "owner", {
        tenantId: first.context.tenantId,
        projectId: project._id,
        operationId: operation.operation.operationId,
        installationId: "installation-stable",
        connectionId: "connection-old",
        registryProjectId: "registry-stable",
        requestId: "provision-reconnect",
      }),
      "CONNECTION_UNAVAILABLE",
    );

    const fresh = await pair(t, "owner", {
      installationId: "installation-stable",
      connectionId: "connection-new",
      requestId: "pair-new",
    });
    await expect(
      owner.query(api.connected.authorizeRegistry, {
        projectId: project._id,
        registryProjectId: "registry-stable",
        connectionId: fresh.connection.connectionId,
        requestId: "after-reconnect",
        write: true,
        expectedRevision: "revision-0002",
      }),
    ).resolves.toMatchObject({
      installationId: "installation-stable",
      connectionId: "connection-new",
      registryProjectId: "registry-stable",
    });
  });

  it("can finish a pending stable operation after reconnecting the same installation", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await createProject(owner, "Pending reconnect", "create-pending-reconnect");
    const first = await pair(t, "owner", {
      installationId: "installation-pending",
      connectionId: "connection-pending-old",
      requestId: "pair-pending-old",
    });
    const request = {
      projectId: project._id,
      connectionId: first.connection.connectionId,
      requestId: "provision-pending-reconnect",
      blueprintId: "astro-style-lab",
      blueprintVersion: "1.0.0",
    };
    const operation = await owner.mutation(api.connected.beginProvisioning, request);
    await owner.mutation(api.connected.revokeConnection, {
      connectionId: first.connection.connectionId,
      requestId: "revoke-pending-old",
    });
    const fresh = await pair(t, "owner", {
      installationId: "installation-pending",
      connectionId: "connection-pending-new",
      requestId: "pair-pending-new",
    });
    const replay = await owner.mutation(api.connected.beginProvisioning, {
      ...request,
      connectionId: fresh.connection.connectionId,
    });
    expect(replay.operation).toMatchObject({
      operationId: operation.operation.operationId,
      connectionId: "connection-pending-old",
      status: "pending",
    });
    await acknowledge(t, "owner", {
      tenantId: first.context.tenantId,
      projectId: project._id,
      operationId: operation.operation.operationId,
      installationId: "installation-pending",
      connectionId: "connection-pending-new",
      registryProjectId: "registry-pending",
      requestId: request.requestId,
    });
    await expect(
      owner.query(api.connected.authorizeRegistry, {
        projectId: project._id,
        registryProjectId: "registry-pending",
        connectionId: "connection-pending-new",
        requestId: "read-pending-reconnected",
        write: false,
      }),
    ).resolves.toMatchObject({
      installationId: "installation-pending",
      connectionId: "connection-pending-new",
    });
  });

  it("rechecks current tenant and project edit grants on retries and every registry authorization", async () => {
    const t = convexTest(schema, MODULES);
    await t.mutation(internal.platform.provisionOrganization, {
      organizationId: "org-grants",
      name: "Grant Organization",
      ownerSubject: "owner",
    });
    const owner = t.withIdentity(identity("owner", "org-grants"));
    const editor = t.withIdentity(identity("editor", "org-grants"));
    await owner.mutation(api.platform.setTenantMembership, { subject: "editor", role: "editor" });
    const project = await createProject(editor, "Grant Site", "create-grant-site");
    const paired = await pair(t, "editor", { organizationId: "org-grants" });
    const request = {
      projectId: project._id,
      connectionId: paired.connection.connectionId,
      requestId: "provision-grant-site",
      blueprintId: "astro-style-lab",
      blueprintVersion: "1.0.0",
    };
    const operation = await editor.mutation(api.connected.beginProvisioning, request);
    await acknowledge(t, "editor", {
      tenantId: paired.context.tenantId,
      projectId: project._id,
      operationId: operation.operation.operationId,
      installationId: paired.connection.installationId,
      connectionId: paired.connection.connectionId,
      registryProjectId: "registry-grants",
      requestId: request.requestId,
      organizationId: "org-grants",
    });

    await owner.mutation(api.platform.setProjectMembership, {
      projectId: project._id,
      subject: "editor",
      role: "viewer",
    });
    await expectCode(editor.mutation(api.connected.beginProvisioning, request), "READ_ONLY");
    await expectCode(
      editor.query(api.connected.authorizeRegistry, {
        projectId: project._id,
        registryProjectId: "registry-grants",
        connectionId: paired.connection.connectionId,
        requestId: "read-after-downgrade",
        write: false,
      }),
      "READ_ONLY",
    );

    await owner.mutation(api.platform.setTenantMembership, { subject: "editor", role: null });
    await expectCode(
      editor.query(api.connected.getProjectConnection, { projectId: project._id }),
      "TENANT_ACCESS_DENIED",
    );
  });
});
