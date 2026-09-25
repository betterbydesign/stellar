/** Routing only. The server independently authenticates every connected request. */
export function editorApiBase(): string {
  if (typeof window === "undefined") return "/api/projects";
  const match = /^\/platform\/projects\/([A-Za-z0-9_-]+)\/studio(?:\/|$)/.exec(window.location.pathname);
  return match ? `/api/connected/websites/${encodeURIComponent(match[1])}/projects` : "/api/projects";
}
export function editorSessionEndpoint(): string {
  return editorApiBase() === "/api/projects" ? "/api/operator/session" : "/api/connected/session";
}
export function editorCsrfKey(): string {
  return editorApiBase() === "/api/projects" ? "stellar.csrf" : "stellar.connected.csrf";
}

/** Connected account cookies can change between actions; never reuse another account's CSRF. */
export async function freshEditorCsrf(): Promise<string | null> {
  if (editorApiBase() === "/api/projects") return window.sessionStorage.getItem(editorCsrfKey());
  const response = await fetch(editorSessionEndpoint(), { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("csrfToken" in value) || typeof value.csrfToken !== "string") return null;
  window.sessionStorage.setItem(editorCsrfKey(), value.csrfToken);
  return value.csrfToken;
}
