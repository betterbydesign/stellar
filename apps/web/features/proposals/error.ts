import { PlatformRequestError } from "../platform/client";

export function reviewFailureMessage(error: unknown): string {
  if (!(error instanceof PlatformRequestError)) return "The review service could not be reached. Reload to check the current proposal state.";
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Your session ended. Sign in again before reviewing proposals.",
    WORKSPACE_NOT_PROVISIONED: "Your workspace has not been set up yet.",
    TENANT_ACCESS_DENIED: "You no longer have access to this workspace.",
    PROJECT_ACCESS_DENIED: "This project is unavailable or you no longer have access.",
    READ_ONLY: "Your current role allows reading proposals but not deciding them.",
    PROPOSAL_NOT_FOUND: "This proposal is unavailable in the current project.",
    PROPOSAL_EXPIRED: "This proposal expired. Request a fresh preparation before reviewing it.",
    PROPOSAL_ALTERED: "The recorded proposal no longer matches the content you reviewed. Reload before deciding.",
    STALE_REVISION: "The source revision no longer matches this proposal. Reload before deciding.",
    PROPOSAL_CLOSED: "This proposal already has a final decision. Reload its current state.",
    PROPOSAL_CONFLICT: "This decision conflicts with the proposal's current state. Reload before deciding.",
    IDEMPOTENCY_CONFLICT: "This review request ID already has a different result. Reload to reconcile it.",
    INVALID_REQUEST: "The review request was invalid. Reload the proposal before trying again.",
    FORBIDDEN: "The review request could not be verified. Return to the configured Stellar address and try again.",
    PLATFORM_UNAVAILABLE: "The account service is temporarily unavailable or needs configuration.",
    BACKEND_UNAVAILABLE: "The review service could not be reached. Reload to check the current proposal state.",
    RUNNER_DISCONNECTED: "The project's source workspace is not connected.",
  };
  return messages[error.code] ?? messages.BACKEND_UNAVAILABLE;
}
