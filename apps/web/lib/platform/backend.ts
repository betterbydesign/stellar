import "server-only";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { PlatformBackend } from "./http";

export function platformBackend(url: string): PlatformBackend {
  const options = (token: string) => ({ token, url });
  return {
    viewer: (token) => fetchQuery(api.platform.viewer, {}, options(token)),
    bootstrap: (token) => fetchMutation(api.platform.bootstrapWorkspace, {}, options(token)),
    list: (token, cursor) => fetchQuery(api.platform.listProjects, { paginationOpts: { numItems: 20, cursor } }, options(token)),
    create: (token, input) => fetchMutation(api.platform.createProject, input, options(token)),
    project: (token, projectId) => fetchQuery(api.platform.getProject, { projectId }, options(token)),
    runner: (token, projectId) => fetchMutation(api.platform.requestRunnerCommand, { projectId }, options(token)),
    proposals: (token, projectId, cursor) => fetchQuery(api.proposals.list, { projectId, paginationOpts: { numItems: 20, cursor } }, options(token)),
    proposal: (token, projectId, proposalId) => fetchQuery(api.proposals.get, { projectId, proposalId: proposalId as Id<"proposals"> }, options(token)),
    decideProposal: (token, input) => fetchMutation(api.proposals.decide, { ...input, proposalId: input.proposalId as Id<"proposals"> }, options(token)),
    submitProposal: (token, projectId, requestId) => fetchMutation(api.proposals.submit, { projectId, requestId }, options(token)),
  };
}
export function platformErrorCode(error: unknown): string | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (data && typeof data === "object" && "code" in data && typeof data.code === "string") return data.code;
  return null;
}
