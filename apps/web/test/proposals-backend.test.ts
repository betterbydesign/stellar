import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { examplePrepareChange, exampleProposal } from "@stellar/contracts";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { sealProposal } from "../lib/proposals/domain";
import { PROPOSAL_EXECUTION_POLICY } from "../lib/proposals/domain";

const MODULES = import.meta.glob("../convex/**/*.*s");
const CLIENT_ID = "client_test_stellar";
const PAGE = { numItems: 20, cursor: null };
let seedCounter = 0;

function identity(subject: string, organizationId?: string) {
  return {
    subject,
    issuer: "https://api.workos.com/",
    ...(organizationId ? { org_id: organizationId } : {}),
  };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: { code } });
}

type TestDb = ReturnType<typeof convexTest>;

async function seed(
  t: TestDb,
  projectId: Id<"projects">,
  options: { subject?: string; requestId?: string; createdAt?: number; expiresAt?: number } = {},
) {
  const project = await t.run((ctx) => ctx.db.get(projectId));
  if (project === null) throw new Error("Missing test project");
  const subject = options.subject ?? "owner";
  const requestId = options.requestId ?? `proposal-${++seedCounter}`;
  const createdAt = options.createdAt ?? Date.now();
  const expiresAt = options.expiresAt ?? createdAt + 60_000;
  const sealed = await sealProposal({
    tenantId: project.tenantId,
    projectId,
    initiatingActor: { subject, identityNamespace: CLIENT_ID },
    requestId,
    prepareChange: examplePrepareChange,
    sourceProposal: exampleProposal,
    createdAt,
    expiresAt,
    provenance: { adapter: "offline-test", version: "test-1" },
  });
  const ids = await t.run(async (ctx) => {
    const jobId = await ctx.db.insert("proposalJobs", {
      tenantId: project.tenantId,
      projectId,
      identityNamespace: CLIENT_ID,
      initiatingSubject: subject,
      requestId,
      sourceRevision: sealed.prepareChange.expectedRevision,
      commandDigest: sealed.commandDigest,
      adapter: "offline-test",
      adapterVersion: "test-1",
      createdAt,
      expiresAt,
      status: "proposed",
    });
    const proposalId = await ctx.db.insert("proposals", {
      tenantId: project.tenantId,
      projectId,
      jobId,
      digest: sealed.digest,
      prepareJson: sealed.prepareJson,
      sourceProposalJson: sealed.sourceProposalJson,
      createdAt,
    });
    return { jobId, proposalId };
  });
  return { ...ids, digest: sealed.digest, revision: sealed.prepareChange.expectedRevision };
}

describe("project proposal review (offline Convex)", () => {
  beforeEach(() => { process.env.WORKOS_CLIENT_ID = CLIENT_ID; });
  afterEach(() => { delete process.env.WORKOS_CLIENT_ID; });

  it("refuses production submission and writes no job, proposal, decision or audit", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await owner.mutation(api.platform.createProject, {
      name: "Project", requestId: "create-project",
    });
    const before = await t.run(async (ctx) => ({
      jobs: (await ctx.db.query("proposalJobs").collect()).length,
      proposals: (await ctx.db.query("proposals").collect()).length,
      decisions: (await ctx.db.query("proposalDecisions").collect()).length,
      audit: (await ctx.db.query("auditEvents").collect()).length,
    }));
    await expectCode(owner.mutation(api.proposals.submit, {
      projectId: project._id, requestId: "submit-1",
    }), "RUNNER_DISCONNECTED");
    await expectCode(owner.mutation(api.proposals.submit, {
      projectId: project._id, requestId: "submit-1",
    }), "RUNNER_DISCONNECTED");
    expect(await t.run(async (ctx) => ({
      jobs: (await ctx.db.query("proposalJobs").collect()).length,
      proposals: (await ctx.db.query("proposals").collect()).length,
      decisions: (await ctx.db.query("proposalDecisions").collect()).length,
      audit: (await ctx.db.query("auditEvents").collect()).length,
    }))).toEqual(before);
  });

  it("persists a sealed fixture across new views, approves once, then cancels without source writes", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await owner.mutation(api.platform.createProject, {
      name: "Project", requestId: "create-project",
    });
    const seeded = await seed(t, project._id);
    const list = await owner.query(api.proposals.list, { projectId: project._id, paginationOpts: PAGE });
    expect(list.page).toHaveLength(1);
    expect(list.canReview).toBe(true);
    expect(list.actor.subject).toBe("owner");
    const reopened = await owner.query(api.proposals.get, {
      projectId: project._id, proposalId: seeded.proposalId,
    });
    expect(reopened.proposal).toMatchObject({
      id: seeded.proposalId,
      status: "proposed",
      digest: seeded.digest,
      application: { status: "unavailable", code: "RUNNER_DISCONNECTED" },
    });
    const approve = {
      projectId: project._id,
      proposalId: seeded.proposalId,
      requestId: "decide-approve",
      action: "approve" as const,
      expectedDigest: seeded.digest,
      expectedRevision: seeded.revision,
    };
    const approved = await owner.mutation(api.proposals.decide, approve);
    expect(approved.status).toBe("approved");
    expect(approved.decisionHistory).toHaveLength(1);
    expect(await owner.mutation(api.proposals.decide, approve)).toEqual(approved);
    await expectCode(owner.mutation(api.proposals.decide, {
      ...approve, requestId: "second-approve",
    }), "PROPOSAL_CONFLICT");
    const cancelled = await owner.mutation(api.proposals.decide, {
      ...approve, action: "cancel", requestId: "decide-cancel",
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.decisionHistory.map((decision) => decision.action)).toEqual(["approve", "cancel"]);
    const recovered = await owner.mutation(api.proposals.decide, approve);
    expect(recovered.status).toBe("cancelled");
    expect(recovered.decisionHistory[0].requestId).toBe("decide-approve");
    await expectCode(owner.mutation(api.proposals.decide, {
      ...approve, action: "reject", requestId: "decide-reject",
    }), "PROPOSAL_CLOSED");
    const persisted = await t.run(async (ctx) => ({
      decisions: await ctx.db.query("proposalDecisions").collect(),
      audit: (await ctx.db.query("auditEvents").collect()).filter((event) => event.action.startsWith("proposal_")),
    }));
    expect(persisted.decisions).toHaveLength(2);
    expect(persisted.audit).toHaveLength(2);
    expect(PROPOSAL_EXECUTION_POLICY).toEqual({
      providerEnabled: false, sourceApplicationEnabled: false, maximumSpendUsd: 0,
    });
  });

  it("rejects altered, stale and expired proposals and conflicting request replay", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await owner.mutation(api.platform.createProject, {
      name: "Project", requestId: "create-project",
    });
    const seeded = await seed(t, project._id);
    const command = {
      projectId: project._id,
      proposalId: seeded.proposalId,
      requestId: "decision-1",
      action: "reject" as const,
      expectedDigest: seeded.digest,
      expectedRevision: seeded.revision,
    };
    await expectCode(owner.mutation(api.proposals.decide, {
      ...command, expectedDigest: "0".repeat(64),
    }), "PROPOSAL_ALTERED");
    await expectCode(owner.mutation(api.proposals.decide, {
      ...command, expectedRevision: "revision-stale",
    }), "STALE_REVISION");
    await owner.mutation(api.proposals.decide, command);
    await expectCode(owner.mutation(api.proposals.decide, {
      ...command, action: "cancel",
    }), "IDEMPOTENCY_CONFLICT");
    const expired = await seed(t, project._id, {
      requestId: "expired-job", createdAt: Date.now() - 120_000, expiresAt: Date.now() - 60_000,
    });
    expect((await owner.query(api.proposals.get, {
      projectId: project._id, proposalId: expired.proposalId,
    })).proposal.status).toBe("expired");
    await expectCode(owner.mutation(api.proposals.decide, {
      projectId: project._id, proposalId: expired.proposalId,
      requestId: "expired-decision", action: "approve",
      expectedDigest: expired.digest, expectedRevision: expired.revision,
    }), "PROPOSAL_EXPIRED");
    await t.run(async (ctx) => {
      const row = await ctx.db.get(seeded.proposalId);
      if (row === null) throw new Error("Missing proposal");
      await ctx.db.patch(seeded.proposalId, { sourceProposalJson: row.sourceProposalJson.replace("style.set", "style.reset") });
    });
    await expectCode(owner.query(api.proposals.get, {
      projectId: project._id, proposalId: seeded.proposalId,
    }), "PROPOSAL_ALTERED");
    await t.run(async (ctx) => {
      const row = await ctx.db.get(seeded.proposalId);
      if (row === null) throw new Error("Missing proposal");
      await ctx.db.patch(seeded.proposalId, { sourceProposalJson: sealedExampleJson() });
      const decision = (await ctx.db.query("proposalDecisions").collect())[0];
      await ctx.db.patch(decision._id, { expectedDigest: "0".repeat(64) });
    });
    await expectCode(owner.query(api.proposals.get, {
      projectId: project._id, proposalId: seeded.proposalId,
    }), "PROPOSAL_ALTERED");
  });

  it("enforces tenant, project and live grants on reads and retries", async () => {
    const t = convexTest(schema, MODULES);
    await t.mutation(internal.platform.provisionOrganization, {
      organizationId: "org-a", name: "Organization A", ownerSubject: "owner",
    });
    const owner = t.withIdentity(identity("owner", "org-a"));
    const viewer = t.withIdentity(identity("viewer", "org-a"));
    const editor = t.withIdentity(identity("editor", "org-a"));
    const outsider = t.withIdentity(identity("outsider"));
    await outsider.mutation(api.platform.bootstrapWorkspace, {});
    await owner.mutation(api.platform.setTenantMembership, { subject: "viewer", role: "viewer" });
    await owner.mutation(api.platform.setTenantMembership, { subject: "editor", role: "editor" });
    const project = await owner.mutation(api.platform.createProject, { name: "Allowed", requestId: "allowed" });
    const other = await owner.mutation(api.platform.createProject, { name: "Other", requestId: "other" });
    await owner.mutation(api.platform.setProjectMembership, {
      projectId: project._id, subject: "viewer", role: "viewer",
    });
    await owner.mutation(api.platform.setProjectMembership, {
      projectId: project._id, subject: "editor", role: "editor",
    });
    const seeded = await seed(t, project._id);
    const args = {
      projectId: project._id, proposalId: seeded.proposalId,
      requestId: "review-1", action: "approve" as const,
      expectedDigest: seeded.digest, expectedRevision: seeded.revision,
    };
    expect((await viewer.query(api.proposals.get, {
      projectId: project._id, proposalId: seeded.proposalId,
    })).canReview).toBe(false);
    await owner.mutation(api.platform.setProjectMembership, {
      projectId: project._id, subject: "viewer", role: "editor",
    });
    expect((await viewer.query(api.proposals.get, {
      projectId: project._id, proposalId: seeded.proposalId,
    })).canReview).toBe(false);
    await expectCode(viewer.mutation(api.proposals.decide, args), "READ_ONLY");
    await expectCode(viewer.mutation(api.proposals.submit, {
      projectId: project._id, requestId: "viewer-submit",
    }), "READ_ONLY");
    await expectCode(outsider.query(api.proposals.list, {
      projectId: project._id, paginationOpts: PAGE,
    }), "PROJECT_ACCESS_DENIED");
    await expectCode(outsider.query(api.proposals.get, {
      projectId: project._id, proposalId: seeded.proposalId,
    }), "PROJECT_ACCESS_DENIED");
    await expectCode(outsider.mutation(api.proposals.decide, args), "PROJECT_ACCESS_DENIED");
    await expectCode(outsider.mutation(api.proposals.submit, {
      projectId: project._id, requestId: "outside-submit",
    }), "PROJECT_ACCESS_DENIED");
    await expectCode(editor.query(api.proposals.get, {
      projectId: other._id, proposalId: seeded.proposalId,
    }), "PROJECT_ACCESS_DENIED");
    await expectCode(editor.mutation(api.proposals.decide, {
      ...args, projectId: other._id,
    }), "PROJECT_ACCESS_DENIED");
    await owner.mutation(api.platform.setProjectMembership, {
      projectId: project._id, subject: "editor", role: "viewer",
    });
    expect((await editor.query(api.proposals.get, {
      projectId: project._id, proposalId: seeded.proposalId,
    })).canReview).toBe(false);
    await expectCode(editor.mutation(api.proposals.decide, args), "READ_ONLY");
    await owner.mutation(api.platform.setProjectMembership, {
      projectId: project._id, subject: "editor", role: "editor",
    });
    const approved = await editor.mutation(api.proposals.decide, args);
    expect(approved.status).toBe("approved");
    await owner.mutation(api.platform.setProjectMembership, {
      projectId: project._id, subject: "editor", role: null,
    });
    await expectCode(editor.mutation(api.proposals.decide, args), "PROJECT_ACCESS_DENIED");
    await expectCode(editor.mutation(api.proposals.submit, {
      projectId: project._id, requestId: "editor-submit",
    }), "PROJECT_ACCESS_DENIED");
    await expectCode(editor.query(api.proposals.get, {
      projectId: project._id, proposalId: seeded.proposalId,
    }), "PROJECT_ACCESS_DENIED");
    await owner.mutation(api.platform.setTenantMembership, { subject: "viewer", role: null });
    await expectCode(viewer.query(api.proposals.list, {
      projectId: project._id, paginationOpts: PAGE,
    }), "TENANT_ACCESS_DENIED");
    await expectCode(viewer.mutation(api.proposals.decide, args), "TENANT_ACCESS_DENIED");
  });

  it("bounds pages and keeps proposal IDs scoped to their own project", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const first = await owner.mutation(api.platform.createProject, { name: "First", requestId: "first" });
    const second = await owner.mutation(api.platform.createProject, { name: "Second", requestId: "second" });
    const seeded = await seed(t, first._id);
    const another = await seed(t, first._id, { requestId: "another-first-project-job" });
    await expectCode(owner.query(api.proposals.get, {
      projectId: second._id, proposalId: seeded.proposalId,
    }), "PROPOSAL_NOT_FOUND");
    await expectCode(owner.mutation(api.proposals.decide, {
      projectId: second._id, proposalId: seeded.proposalId,
      requestId: "wrong-project", action: "approve",
      expectedDigest: seeded.digest, expectedRevision: seeded.revision,
    }), "PROPOSAL_NOT_FOUND");
    for (const numItems of [0, 21, 1.5]) {
      await expectCode(owner.query(api.proposals.list, {
        projectId: first._id, paginationOpts: { numItems, cursor: null },
      }), "INVALID_REQUEST");
    }
    await expectCode(owner.query(api.proposals.list, {
      projectId: first._id, paginationOpts: { numItems: 1, cursor: "x".repeat(513) },
    }), "INVALID_REQUEST");
    const listed = await owner.query(api.proposals.list, {
      projectId: first._id, paginationOpts: { numItems: 1, cursor: null },
    });
    expect(listed.page).toHaveLength(1);
    expect(listed.isDone).toBe(false);
    const next = await owner.query(api.proposals.list, {
      projectId: first._id, paginationOpts: { numItems: 1, cursor: listed.continueCursor },
    });
    expect(next.page).toHaveLength(1);
    expect(next.isDone).toBe(true);
    expect(new Set([...listed.page, ...next.page].map((item) => item.id))).toEqual(
      new Set([seeded.proposalId, another.proposalId]),
    );
  });
});

describe("review recovery edges", () => {
  beforeEach(() => { process.env.WORKOS_CLIENT_ID = CLIENT_ID; });
  afterEach(() => {
    delete process.env.WORKOS_CLIENT_ID;
    vi.useRealTimers();
  });

  it("shows a recorded approval as expired and preserves its decision history", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-19T12:00:00.000Z"));
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await owner.mutation(api.platform.createProject, {
      name: "Expiry", requestId: "expiry-project",
    });
    const seeded = await seed(t, project._id, { expiresAt: Date.now() + 1000 });
    await owner.mutation(api.proposals.decide, {
      projectId: project._id, proposalId: seeded.proposalId,
      requestId: "approve-before-expiry", action: "approve",
      expectedDigest: seeded.digest, expectedRevision: seeded.revision,
    });
    vi.setSystemTime(new Date("2026-09-19T12:00:01.000Z"));
    const expired = await owner.query(api.proposals.get, {
      projectId: project._id, proposalId: seeded.proposalId,
    });
    expect(expired.proposal.status).toBe("expired");
    expect(expired.proposal.decisionHistory[0].requestId).toBe("approve-before-expiry");
    expect(expired.proposal.application.code).toBe("RUNNER_DISCONNECTED");
  });

  it("records one winning decision and scopes request IDs across proposals", async () => {
    const t = convexTest(schema, MODULES);
    const owner = t.withIdentity(identity("owner"));
    await owner.mutation(api.platform.bootstrapWorkspace, {});
    const project = await owner.mutation(api.platform.createProject, {
      name: "Race", requestId: "race-project",
    });
    const first = await seed(t, project._id, { requestId: "first-job" });
    const second = await seed(t, project._id, { requestId: "second-job" });
    const common = {
      projectId: project._id, proposalId: first.proposalId, requestId: "race-decision",
      expectedDigest: first.digest, expectedRevision: first.revision,
    };
    const results = await Promise.allSettled([
      owner.mutation(api.proposals.decide, { ...common, action: "approve" }),
      owner.mutation(api.proposals.decide, { ...common, action: "reject" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.query("proposalDecisions").collect()))).toHaveLength(1);
    await expectCode(owner.mutation(api.proposals.decide, {
      projectId: project._id, proposalId: second.proposalId,
      requestId: "race-decision", action: "cancel",
      expectedDigest: second.digest, expectedRevision: second.revision,
    }), "IDEMPOTENCY_CONFLICT");
  });
});

function sealedExampleJson() {
  return JSON.stringify(exampleProposal);
}

describe("proposal seal", () => {
  it("binds scope, initiator, revision, source patch and expiry to the digest", async () => {
    const input = {
      tenantId: "tenant-a",
      projectId: "project-a",
      initiatingActor: { subject: "actor-a", identityNamespace: CLIENT_ID },
      requestId: "request-a",
      prepareChange: examplePrepareChange,
      sourceProposal: exampleProposal,
      createdAt: 1_000,
      expiresAt: 61_000,
      provenance: { adapter: "offline-test" as const, version: "test-1" },
    };
    const original = await sealProposal(input);
    const variants = [
      { ...input, tenantId: "tenant-b" },
      { ...input, projectId: "project-b" },
      { ...input, initiatingActor: { ...input.initiatingActor, subject: "actor-b" } },
      { ...input, expiresAt: 62_000 },
      { ...input, sourceProposal: {
        ...exampleProposal,
        sourcePatch: { ...exampleProposal.sourcePatch, expectedFileSha256: "b".repeat(64) },
      } },
      { ...input,
        prepareChange: { ...examplePrepareChange, expectedRevision: "revision-0002" },
        sourceProposal: { ...exampleProposal, baseRevision: "revision-0002" },
      },
    ];
    for (const variant of variants) {
      expect((await sealProposal(variant)).digest).not.toBe(original.digest);
    }
    await expect(sealProposal({
      ...input,
      sourceProposal: {
        ...exampleProposal,
        command: { type: "style.reset", property: "background-color", scopeId: "base" },
      },
    })).rejects.toThrow("INVALID_PROPOSAL");
    await expect(sealProposal({
      ...input,
      expiresAt: input.createdAt + 24 * 60 * 60 * 1000 + 1,
    })).rejects.toThrow("INVALID_PROPOSAL");
    await expect(sealProposal({
      ...input,
      sourceProposal: {
        ...exampleProposal,
        sourcePatch: {
          ...exampleProposal.sourcePatch,
          startByte: 0,
          endByte: 16_384,
          expectedOldText: "a".repeat(16_384),
          replacementText: "b".repeat(16_384),
        },
      },
    })).rejects.toThrow("INVALID_PROPOSAL");
  });
});
