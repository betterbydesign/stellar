export class PlatformRequestError extends Error {
  constructor(public code: string) { super(code); }
}
export async function platformRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/platform/${path}`, {
      method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new PlatformRequestError("BACKEND_UNAVAILABLE"); }
  let data: unknown;
  try { data = await response.json(); } catch { throw new PlatformRequestError("BACKEND_UNAVAILABLE"); }
  if (!response.ok) {
    const code = typeof data === "object" && data !== null && "error" in data && typeof data.error === "object" && data.error !== null && "code" in data.error && typeof data.error.code === "string" ? data.error.code : "BACKEND_UNAVAILABLE";
    throw new PlatformRequestError(code);
  }
  return data as T;
}
export function failureMessage(error: unknown): string {
  const code = error instanceof PlatformRequestError ? error.code : "BACKEND_UNAVAILABLE";
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Your session ended. Sign in again to continue.",
    UNAUTHORIZED: "This computer has not confirmed local control. Open the current launcher setup link and try again.",
    WORKSPACE_NOT_PROVISIONED: "Your workspace has not been set up yet.",
    TENANT_ACCESS_DENIED: "You no longer have access to this workspace.",
    PROJECT_ACCESS_DENIED: "This project is unavailable or you do not have access.",
    READ_ONLY: "Your role does not allow creating or changing projects.",
    IDEMPOTENCY_CONFLICT: "This request already has a different result. Reload your projects to reconcile it before starting again.",
    INVALID_REQUEST: "Use a project name of up to 80 ordinary characters, starting and ending with a letter or number.",
    FORBIDDEN: "This request could not be verified. Return to the configured Stellar address and try again.",
    PLATFORM_UNAVAILABLE: "The account service is temporarily unavailable or needs configuration. Retry shortly.",
    RUNNER_DISCONNECTED: "This project's workspace is not connected.",
    CONNECTION_UNAVAILABLE: "This computer connection is unavailable. Reconnect it from website setup.",
    CONNECTION_REVOKED: "This computer connection was revoked. Start a new connection from the local launcher.",
    CONNECTION_EXPIRED: "This computer connection expired. Reconnect it before continuing.",
    PAIRING_EXPIRED: "This connection offer expired. Start a new offer from the current launcher setup link.",
    PROJECT_BINDING_MISMATCH: "This website is not bound to the requested local source.",
    CONNECTION_SESSION_MISMATCH: "This website belongs to a different computer connection.",
    BACKEND_UNAVAILABLE: "The project service could not be reached. Retry when the connection returns.",
  };
  return messages[code] ?? messages.BACKEND_UNAVAILABLE;
}
