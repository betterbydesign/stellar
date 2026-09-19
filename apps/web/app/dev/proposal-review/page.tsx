import { notFound } from "next/navigation";
import { SyntheticProposalReview } from "../../../features/proposals/SyntheticProposalReview";

export const dynamic = "force-dynamic";

export default function ProposalReviewHarnessPage() {
  if (process.env.NODE_ENV !== "development" || process.env.STELLAR_PROPOSAL_REVIEW_DEV !== "1") notFound();
  return <SyntheticProposalReview />;
}
