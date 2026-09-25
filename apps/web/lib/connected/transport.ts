import "server-only";
import { fetchAction, fetchMutation, fetchQuery } from "convex/nextjs";
import { makeFunctionReference } from "convex/server";
import type { ConnectedConfig } from "./config";

export type BackendCall = (kind: "query" | "mutation" | "action", name: string, args: Record<string, unknown>) => Promise<unknown>;
export function connectedBackend(url: string, token: string): BackendCall {
  const options = { url, token };
  return (kind, name, args) => {
    if (kind === "query") return fetchQuery(makeFunctionReference<"query", Record<string, unknown>, unknown>(name), args, options);
    if (kind === "mutation") return fetchMutation(makeFunctionReference<"mutation", Record<string, unknown>, unknown>(name), args, options);
    return fetchAction(makeFunctionReference<"action", Record<string, unknown>, unknown>(name), args, options);
  };
}
export type RunnerCall = (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
export function connectedRunner(config: ConnectedConfig, transport: typeof fetch = fetch): RunnerCall {
  return async (method, params) => {
    const response = await transport(`${config.runnerUrl}/rpc`, {
      method: "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000),
      headers: { authorization: `Bearer ${config.runnerSecret}`, "x-stellar-operator": config.operatorId, "content-type": "application/json" },
      body: JSON.stringify({ method, params }),
    });
    if (response.status >= 300 && response.status < 400 || !response.headers.get("content-type")?.includes("application/json")) throw new Error("RUNNER_DISCONNECTED");
    const raw = await response.text();
    if (raw.length > 2_000_000) throw new Error("RUNNER_DISCONNECTED");
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RUNNER_DISCONNECTED");
    const result = value as Record<string, unknown>;
    if (result.requestId !== params.requestId) throw new Error("RUNNER_DISCONNECTED");
    if (result.error && method === "dispatchAccountProject") return result;
    if (!response.ok || result.error) throw new Error("RUNNER_DISCONNECTED");
    return result;
  };
}
