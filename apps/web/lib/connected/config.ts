import "server-only";
import { inspectPlatformConfig } from "../platform/config";
import type { LocalConfig } from "../server/local-config";

export type ConnectedConfig = LocalConfig & { convexUrl: string; identityNamespace: string; signingSecret: string };

/** This first connection runs on the user's own computer, never a hosted loopback proxy. */
export function readConnectedConfig(env: NodeJS.ProcessEnv = process.env): ConnectedConfig | null {
  const platform = inspectPlatformConfig(env);
  if (env.STELLAR_CONNECTED_MODE !== "1" || platform.mode !== "ready" || env.STELLAR_LOCAL_MODE === "1") return null;
  try {
    const app = new URL(env.STELLAR_APP_ORIGIN ?? "");
    const runner = new URL(env.STELLAR_RUNNER_URL ?? "");
    if (app.origin !== platform.appOrigin || app.protocol !== "http:" || app.hostname !== "127.0.0.1" || !app.port ||
      app.pathname !== "/" || app.search || app.hash || app.username || app.password ||
      runner.protocol !== "http:" || runner.hostname !== "127.0.0.1" || !runner.port || runner.origin === app.origin ||
      runner.pathname !== "/" || runner.search || runner.hash || runner.username || runner.password || env.STELLAR_PREVIEW_HOST !== "localhost" ||
      !env.STELLAR_RUNNER_SECRET || env.STELLAR_RUNNER_SECRET.length < 32 ||
      !env.STELLAR_BOOTSTRAP_NONCE || env.STELLAR_BOOTSTRAP_NONCE.length < 32 ||
      !env.STELLAR_CONNECTION_SECRET || env.STELLAR_CONNECTION_SECRET.length < 32 ||
      !env.STELLAR_OPERATOR_ID || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(env.STELLAR_OPERATOR_ID)) return null;
    return { appOrigin: app.origin, appHost: app.host, runnerUrl: runner.origin, runnerSecret: env.STELLAR_RUNNER_SECRET,
      bootstrapNonce: env.STELLAR_BOOTSTRAP_NONCE, operatorId: env.STELLAR_OPERATOR_ID, previewHost: "localhost",
      convexUrl: platform.convexUrl, identityNamespace: env.WORKOS_CLIENT_ID!, signingSecret: env.STELLAR_CONNECTION_SECRET };
  } catch { return null; }
}
