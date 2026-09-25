import { PlatformRequestError } from "./client";

type ConnectedRequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
};

async function responseData(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new PlatformRequestError("BACKEND_UNAVAILABLE"); }
}

function errorCode(value: unknown): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = value.error;
    if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  }
  return "BACKEND_UNAVAILABLE";
}

async function csrfToken(): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/connected/session", {
      credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new PlatformRequestError("RUNNER_DISCONNECTED"); }
  const value = await responseData(response);
  if (!response.ok) throw new PlatformRequestError(errorCode(value));
  if (!value || typeof value !== "object" || !("csrfToken" in value) || typeof value.csrfToken !== "string") {
    throw new PlatformRequestError("BACKEND_UNAVAILABLE");
  }
  return value.csrfToken;
}

/** Account requests remain same-origin; every mutation except nonce bootstrap gets a fresh account-bound CSRF token. */
export async function connectedRequest<T>(path: string, options: ConnectedRequestOptions = {}): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const headers: Record<string, string> = {};
  if (method === "POST") {
    headers["content-type"] = "application/json";
    if (path !== "bootstrap") headers["x-stellar-csrf"] = await csrfToken();
  }
  let response: Response;
  try {
    response = await fetch(`/api/connected/${path}`, {
      method, credentials: "same-origin", cache: "no-store", headers,
      body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new PlatformRequestError("RUNNER_DISCONNECTED"); }
  const value = await responseData(response);
  if (!response.ok) throw new PlatformRequestError(errorCode(value));
  return value as T;
}
