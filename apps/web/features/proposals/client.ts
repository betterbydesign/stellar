import { platformRequest } from "../platform/client";
import type { ProposalDetail, ProposalPage, ProposalRead, ReviewTransport } from "./types";

export const accountReviewTransport: ReviewTransport = {
  list(projectId, cursor) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return platformRequest<ProposalPage>(`projects/${encodeURIComponent(projectId)}/proposals${query}`);
  },
  get(projectId, proposalId) {
    return platformRequest<ProposalRead>(`projects/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(proposalId)}`);
  },
  decide(projectId, proposalId, { requestId, action, expectedDigest, expectedRevision }) {
    return platformRequest<ProposalDetail>(`projects/${encodeURIComponent(projectId)}/proposals/${encodeURIComponent(proposalId)}/decisions`, { requestId, action, expectedDigest, expectedRevision });
  },
};
