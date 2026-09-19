import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireProject } from "./platform";
import {
  sealProposal,
  validDigest,
  validProposalRequestId,
  type ProposalStatus,
} from "../lib/proposals/domain";

const statusValidator = v.union(
  v.literal("proposed"), v.literal("approved"), v.literal("rejected"),
  v.literal("cancelled"), v.literal("expired"),
);
const actionValidator = v.union(v.literal("approve"), v.literal("reject"), v.literal("cancel"));
const summaryValidator = v.object({
  id: v.id("proposals"), jobId: v.id("proposalJobs"), projectId: v.id("projects"),
  status: statusValidator, digest: v.string(), sourceRevision: v.string(),
  expiresAt: v.number(), createdAt: v.number(),
});
const detailValidator = v.object({
  ...summaryValidator.fields,
  prepareChange: v.any(),
  sourceProposal: v.any(),
  initiatingActor: v.object({ subject: v.string(), identityNamespace: v.string() }),
  provenance: v.object({
    adapter: v.union(v.literal("runner-prepare"), v.literal("offline-test")),
    version: v.string(),
  }),
  decision: v.union(v.null(), v.object({
    action: actionValidator, actorSubject: v.string(), requestId: v.string(), decidedAt: v.number(),
  })),
  decisionHistory: v.array(v.object({
    action: actionValidator, actorSubject: v.string(), requestId: v.string(), decidedAt: v.number(),
  })),
  application: v.object({ status: v.literal("unavailable"), code: v.literal("RUNNER_DISCONNECTED") }),
});

type Ctx = QueryCtx | MutationCtx;

function fail(code: string): never {
  throw new ConvexError({ code });
}

function canReview(access: Awaited<ReturnType<typeof requireProject>>): boolean {
  return access.membership.role !== "viewer" && access.projectRole !== "viewer";
}

function effectiveStatus(job: Doc<"proposalJobs">, now: number): ProposalStatus {
  return (job.status === "proposed" || job.status === "approved") && now >= job.expiresAt
    ? "expired" : job.status;
}

function summary(proposal: Doc<"proposals">, job: Doc<"proposalJobs">) {
  return {
    id: proposal._id, jobId: job._id, projectId: proposal.projectId,
    status: effectiveStatus(job, Date.now()), digest: proposal.digest,
    sourceRevision: job.sourceRevision, expiresAt: job.expiresAt, createdAt: proposal.createdAt,
  };
}

async function boundProposal(ctx: Ctx, projectId: Id<"projects">, proposalId: Id<"proposals">) {
  const proposal = await ctx.db.get(proposalId);
  if (proposal === null || proposal.projectId !== projectId) fail("PROPOSAL_NOT_FOUND");
  const job = await ctx.db.get(proposal.jobId);
  if (job === null || job.projectId !== projectId || job.tenantId !== proposal.tenantId) {
    fail("PROPOSAL_ALTERED");
  }
  return { proposal, job };
}

async function verifiedPayload(proposal: Doc<"proposals">, job: Doc<"proposalJobs">) {
  try {
    const sealed = await sealProposal({
      tenantId: String(job.tenantId),
      projectId: String(job.projectId),
      initiatingActor: { subject: job.initiatingSubject, identityNamespace: job.identityNamespace },
      requestId: job.requestId,
      prepareChange: JSON.parse(proposal.prepareJson),
      sourceProposal: JSON.parse(proposal.sourceProposalJson),
      createdAt: job.createdAt,
      expiresAt: job.expiresAt,
      provenance: { adapter: job.adapter, version: job.adapterVersion },
    });
    if (
      sealed.digest !== proposal.digest || sealed.commandDigest !== job.commandDigest ||
      sealed.prepareChange.expectedRevision !== job.sourceRevision ||
      proposal.createdAt !== job.createdAt || proposal.tenantId !== job.tenantId
    ) {
      fail("PROPOSAL_ALTERED");
    }
    return sealed;
  } catch {
    fail("PROPOSAL_ALTERED");
  }
}

async function detail(ctx: Ctx, proposal: Doc<"proposals">, job: Doc<"proposalJobs">) {
  const payload = await verifiedPayload(proposal, job);
  const decisions = await ctx.db
    .query("proposalDecisions")
    .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
    .order("desc")
    .take(3);
  if (decisions.length > 2) fail("PROPOSAL_ALTERED");
  const decisionHistory = decisions.reverse().map((item) => ({
    action: item.action,
    actorSubject: item.actorSubject,
    requestId: item.requestId,
    decidedAt: item.decidedAt,
  }));
  if (decisions.some((item) =>
    item.tenantId !== job.tenantId || item.projectId !== job.projectId ||
    item.proposalId !== proposal._id || item.identityNamespace !== job.identityNamespace ||
    item.expectedDigest !== proposal.digest || item.expectedRevision !== job.sourceRevision ||
    item.decidedAt < job.createdAt ||
    (item.action === "approve" && item.decidedAt >= job.expiresAt)
  )) fail("PROPOSAL_ALTERED");
  const sequence = decisionHistory.map((item) => item.action).join(",");
  const expectedSequence = job.status === "proposed" ? "" :
    job.status === "approved" ? "approve" :
    job.status === "rejected" ? "reject" :
    sequence === "approve,cancel" ? "approve,cancel" : "cancel";
  if (sequence !== expectedSequence) fail("PROPOSAL_ALTERED");
  const lastDecision = decisionHistory.at(-1) ?? null;
  return {
    ...summary(proposal, job),
    prepareChange: payload.prepareChange,
    sourceProposal: payload.sourceProposal,
    initiatingActor: { subject: job.initiatingSubject, identityNamespace: job.identityNamespace },
    provenance: { adapter: job.adapter, version: job.adapterVersion },
    decision: lastDecision,
    decisionHistory,
    application: { status: "unavailable" as const, code: "RUNNER_DISCONNECTED" as const },
  };
}

export const list = query({
  args: { projectId: v.id("projects"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...paginationResultValidator(summaryValidator).fields,
    canReview: v.boolean(), actor: v.object({ subject: v.string() }), tenantId: v.id("tenants"),
  }),
  handler: async (ctx, args) => {
    const access = await requireProject(ctx, args.projectId);
    if (
      !Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 20 || args.paginationOpts.maximumRowsRead !== undefined ||
      args.paginationOpts.maximumBytesRead !== undefined ||
      (args.paginationOpts.cursor !== null && args.paginationOpts.cursor.length > 512) ||
      Object.keys(args.paginationOpts).some((key) => key !== "numItems" && key !== "cursor")
    ) fail("INVALID_REQUEST");
    const result = await ctx.db
      .query("proposals")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map(async (proposal) => {
      if (proposal.tenantId !== access.tenant._id) fail("PROPOSAL_ALTERED");
      const job = await ctx.db.get(proposal.jobId);
      if (job === null || job.tenantId !== access.tenant._id || job.projectId !== args.projectId) {
        fail("PROPOSAL_ALTERED");
      }
      await detail(ctx, proposal, job);
      return summary(proposal, job);
    }));
    return {
      ...result, page, canReview: canReview(access),
      actor: { subject: access.actor.subject }, tenantId: access.tenant._id,
    };
  },
});

export const get = query({
  args: { projectId: v.id("projects"), proposalId: v.id("proposals") },
  returns: v.object({
    proposal: detailValidator, canReview: v.boolean(),
    actor: v.object({ subject: v.string() }), tenantId: v.id("tenants"),
  }),
  handler: async (ctx, args) => {
    const access = await requireProject(ctx, args.projectId);
    const bound = await boundProposal(ctx, args.projectId, args.proposalId);
    if (bound.proposal.tenantId !== access.tenant._id) fail("PROPOSAL_NOT_FOUND");
    return {
      proposal: await detail(ctx, bound.proposal, bound.job),
      canReview: canReview(access), actor: { subject: access.actor.subject }, tenantId: access.tenant._id,
    };
  },
});

export const submit = mutation({
  args: { projectId: v.id("projects"), requestId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await requireProject(ctx, args.projectId);
    if (!canReview(access)) fail("READ_ONLY");
    if (!validProposalRequestId(args.requestId)) fail("INVALID_REQUEST");
    // A trusted runner prepare receipt and source binding are not available.
    // No public mutation can create a job or insert synthetic fixture records.
    fail("RUNNER_DISCONNECTED");
  },
});

export const decide = mutation({
  args: {
    projectId: v.id("projects"), proposalId: v.id("proposals"), requestId: v.string(),
    action: actionValidator, expectedDigest: v.string(), expectedRevision: v.string(),
  },
  returns: detailValidator,
  handler: async (ctx, args) => {
    const access = await requireProject(ctx, args.projectId);
    if (!canReview(access)) fail("READ_ONLY");
    if (!validProposalRequestId(args.requestId) || !validDigest(args.expectedDigest)) {
      fail("INVALID_REQUEST");
    }
    const { proposal, job } = await boundProposal(ctx, args.projectId, args.proposalId);
    if (proposal.tenantId !== access.tenant._id) fail("PROPOSAL_NOT_FOUND");
    await detail(ctx, proposal, job);
    if (args.expectedDigest !== proposal.digest) fail("PROPOSAL_ALTERED");
    if (args.expectedRevision !== job.sourceRevision) fail("STALE_REVISION");

    const priorRequest = await ctx.db
      .query("proposalDecisions")
      .withIndex("by_tenant_and_project_and_actor_and_request", (q) =>
        q.eq("tenantId", access.tenant._id)
          .eq("projectId", args.projectId)
          .eq("actorSubject", access.actor.subject)
          .eq("requestId", args.requestId),
      )
      .unique();
    if (priorRequest !== null) {
      if (
        priorRequest.proposalId !== proposal._id || priorRequest.action !== args.action ||
        priorRequest.expectedDigest !== args.expectedDigest ||
        priorRequest.expectedRevision !== args.expectedRevision
      ) fail("IDEMPOTENCY_CONFLICT");
      return await detail(ctx, proposal, job);
    }

    const now = Date.now();
    if (job.status === "proposed" && now >= job.expiresAt && args.action !== "cancel") {
      fail("PROPOSAL_EXPIRED");
    }
    const lastDecision = await ctx.db
      .query("proposalDecisions")
      .withIndex("by_proposal", (q) => q.eq("proposalId", proposal._id))
      .order("desc")
      .first();
    if (job.status === "rejected" || job.status === "cancelled") fail("PROPOSAL_CLOSED");
    if (job.status === "approved" && args.action !== "cancel") {
      fail("PROPOSAL_CONFLICT");
    }
    if (job.status === "proposed" && lastDecision !== null) fail("PROPOSAL_ALTERED");
    if (job.status === "approved" && lastDecision?.action !== "approve") fail("PROPOSAL_ALTERED");

    const nextStatus = args.action === "approve" ? "approved" : args.action === "reject" ? "rejected" : "cancelled";
    await ctx.db.insert("proposalDecisions", {
      tenantId: access.tenant._id, projectId: args.projectId, proposalId: proposal._id,
      identityNamespace: access.actor.identityNamespace, actorSubject: access.actor.subject,
      requestId: args.requestId, action: args.action, expectedDigest: args.expectedDigest,
      expectedRevision: args.expectedRevision, decidedAt: now,
    });
    await ctx.db.patch(job._id, { status: nextStatus });
    await ctx.db.insert("auditEvents", {
      tenantId: access.tenant._id, projectId: args.projectId,
      actorSubject: access.actor.subject,
      action: `proposal_${nextStatus}` as "proposal_approved" | "proposal_rejected" | "proposal_cancelled",
      requestId: args.requestId, occurredAt: now,
    });
    const updatedJob = await ctx.db.get(job._id);
    if (updatedJob === null) fail("PROPOSAL_ALTERED");
    return await detail(ctx, proposal, updatedJob);
  },
});
