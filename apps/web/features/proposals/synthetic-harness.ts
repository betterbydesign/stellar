"use client";
import { examplePrepareChange, exampleProposal } from "@stellar/contracts";
import type { ProposalDetail, ProposalPage, ProposalRead, ReviewDecision, ReviewTransport } from "./types";

export const SYNTHETIC_PROJECT_ID = "synthetic-review-project";
const KEY = "stellar.synthetic-proposal-review.v1";
const VIEWER_KEY = "stellar.synthetic-proposal-review.viewer.v1";
const LOSE_KEY = "stellar.synthetic-proposal-review.lose-once.v1";

type SyntheticState = { proposals: ProposalDetail[]; decisionWrites: number };

function seed(): SyntheticState {
  const now = Date.now();
  const names = ["approve-demo", "reject-demo", "cancel-demo"];
  return { decisionWrites: 0, proposals: names.map((name, index) => ({
    id: name,
    jobId: `synthetic-job-${index + 1}`,
    projectId: SYNTHETIC_PROJECT_ID,
    status: "proposed",
    digest: String(index + 1).repeat(64),
    sourceRevision: `synthetic-revision-${index + 1}`,
    expiresAt: now + 86_400_000,
    createdAt: now - (index + 1) * 60_000,
    prepareChange: { ...examplePrepareChange, projectId: "synthetic-runner-project", sessionId: `synthetic-session-${index + 1}`, requestId: `synthetic-prepare-${index + 1}`, expectedRevision: `synthetic-revision-${index + 1}` },
    sourceProposal: { ...exampleProposal, proposalId: `synthetic-source-proposal-${index + 1}`, projectId: "synthetic-runner-project", sessionId: `synthetic-session-${index + 1}`, baseRevision: `synthetic-revision-${index + 1}` },
    initiatingActor: { subject: "synthetic-initiator", identityNamespace: "synthetic-only" },
    provenance: { adapter: "offline-test", version: "synthetic-browser-harness" },
    decision: null,
    decisionHistory: [],
    application: { status: "unavailable", code: "RUNNER_DISCONNECTED" },
  })) };
}

function state(): SyntheticState {
  const raw = sessionStorage.getItem(KEY);
  if (raw) {
    try {
      const parsed: SyntheticState = JSON.parse(raw);
      if (Array.isArray(parsed.proposals) && typeof parsed.decisionWrites === "number") return parsed;
    } catch { /* Reset malformed synthetic data below. */ }
  }
  const fresh = seed();
  sessionStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}
function scope(projectId: string) {
  if (projectId !== SYNTHETIC_PROJECT_ID) throw new Error("Synthetic project scope mismatch");
}
function viewer() { return sessionStorage.getItem(VIEWER_KEY) === "1"; }
function read(detail: ProposalDetail): ProposalRead {
  return { proposal: detail, canReview: !viewer(), actor: { subject: "synthetic-reviewer" }, tenantId: "synthetic-tenant" };
}

export const syntheticReviewTransport: ReviewTransport = {
  async list(projectId): Promise<ProposalPage> {
    scope(projectId);
    return { page: state().proposals, isDone: true, continueCursor: "", canReview: !viewer(), actor: { subject: "synthetic-reviewer" }, tenantId: "synthetic-tenant" };
  },
  async get(projectId, proposalId): Promise<ProposalRead> {
    scope(projectId);
    const item = state().proposals.find((proposal) => proposal.id === proposalId);
    if (!item) throw new Error("Synthetic proposal not found");
    return read(item);
  },
  async decide(projectId, proposalId, input: ReviewDecision): Promise<ProposalDetail> {
    scope(projectId);
    if (viewer()) throw new Error("Synthetic viewer cannot decide");
    const data = state();
    const index = data.proposals.findIndex((proposal) => proposal.id === proposalId);
    if (index < 0) throw new Error("Synthetic proposal not found");
    const item = data.proposals[index];
    if (item.digest !== input.expectedDigest || item.sourceRevision !== input.expectedRevision) throw new Error("Synthetic binding mismatch");
    if (item.decisionHistory.some((decision) => decision.requestId === input.requestId && decision.action === input.action && decision.actorSubject === "synthetic-reviewer")) return item;
    if (item.status !== "proposed" && !(item.status === "approved" && input.action === "cancel")) throw new Error("Synthetic decision conflict");
    const status = { approve: "approved", reject: "rejected", cancel: "cancelled" } as const;
    const decision = { action: input.action, actorSubject: "synthetic-reviewer", requestId: input.requestId, decidedAt: Date.now() };
    const updated: ProposalDetail = { ...item, status: status[input.action], decision, decisionHistory: [...item.decisionHistory, decision] };
    data.proposals[index] = updated;
    data.decisionWrites += 1;
    sessionStorage.setItem(KEY, JSON.stringify(data));
    if (sessionStorage.getItem(LOSE_KEY) === "1") {
      sessionStorage.removeItem(LOSE_KEY);
      throw new Error("Simulated lost response after the synthetic decision was saved");
    }
    return updated;
  },
};

export function resetSyntheticReview() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(LOSE_KEY);
  sessionStorage.removeItem("stellar.proposal-review.v1:synthetic-tenant:synthetic-reviewer:synthetic-review-project");
}
export function setSyntheticViewer(enabled: boolean) { sessionStorage.setItem(VIEWER_KEY, enabled ? "1" : "0"); }
export function syntheticViewer() { return viewer(); }
export function loseNextSyntheticResponse() { sessionStorage.setItem(LOSE_KEY, "1"); }
export function syntheticDecisionWrites() { return state().decisionWrites; }
