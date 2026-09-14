import "server-only";
import { URL } from "node:url";

export type LocalConfig = {
  appOrigin: string;
  appHost: string;
  runnerUrl: string;
  runnerSecret: string;
  bootstrapNonce: string;
  operatorId: string;
  previewHost: string;
};

function parseLocalOrigin(value: string | undefined, hostname: string): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.hostname !== hostname || !url.port ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

/** A missing or unsafe launcher configuration disables every local API route. */
export function readLocalConfig(env: NodeJS.ProcessEnv = process.env): LocalConfig | null {
  if (env.STELLAR_LOCAL_MODE !== "1") return null;
  const app = parseLocalOrigin(env.STELLAR_APP_ORIGIN, "127.0.0.1");
  const runner = parseLocalOrigin(env.STELLAR_RUNNER_URL, "127.0.0.1");
  const previewHost = env.STELLAR_PREVIEW_HOST;
  const runnerSecret = env.STELLAR_RUNNER_SECRET;
  const bootstrapNonce = env.STELLAR_BOOTSTRAP_NONCE;
  const operatorId = env.STELLAR_OPERATOR_ID;
  if (!app || !runner || app.host === runner.host || previewHost !== "localhost" ||
    !runnerSecret || runnerSecret.length < 32 || !bootstrapNonce || bootstrapNonce.length < 32 ||
    !operatorId || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(operatorId)) return null;
  return {
    appOrigin: app.origin, appHost: app.host, runnerUrl: runner.origin,
    runnerSecret, bootstrapNonce, operatorId, previewHost,
  };
}

export function isSafePreviewUrl(value: string | null, config: LocalConfig): boolean {
  if (value === null) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.hostname === config.previewHost && !!url.port &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.origin !== config.appOrigin && url.origin !== config.runnerUrl;
  } catch {
    return false;
  }
}
