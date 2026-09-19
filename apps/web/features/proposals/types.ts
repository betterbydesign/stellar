import type { ProposalAction, ProposalDetail, ProposalSummary } from "../../lib/proposals/domain";

export type ReviewAction = ProposalAction;
export type { ProposalDetail, ProposalSummary };

export type ProposalPage = {
  page: ProposalSummary[];
  isDone: boolean;
  continueCursor: string;
  canReview: boolean;
  actor: { subject: string };
  tenantId: string;
};

export type ProposalRead = {
  proposal: ProposalDetail;
  canReview: boolean;
  actor: { subject: string };
  tenantId: string;
};

export type ReviewDecision = {
  requestId: string;
  action: ReviewAction;
  expectedDigest: string;
  expectedRevision: string;
};

export type ReviewTransport = {
  list(projectId: string, cursor?: string | null): Promise<ProposalPage>;
  get(projectId: string, proposalId: string): Promise<ProposalRead>;
  decide(projectId: string, proposalId: string, decision: ReviewDecision): Promise<ProposalDetail>;
};
