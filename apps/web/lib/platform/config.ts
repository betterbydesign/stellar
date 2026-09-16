import "server-only";

export type PlatformConfigEnvName =
  | "WORKOS_CLIENT_ID"
  | "WORKOS_API_KEY"
  | "WORKOS_COOKIE_PASSWORD"
  | "NEXT_PUBLIC_WORKOS_REDIRECT_URI"
  | "NEXT_PUBLIC_CONVEX_URL";

export type PlatformConfigInvalidName =
  | PlatformConfigEnvName
  | "STELLAR_PLATFORM_MODE"
  | "STELLAR_LOCAL_MODE"
  | "WORKOS_API_HOSTNAME"
  | "WORKOS_API_HTTPS"
  | "WORKOS_API_PORT";

export type PlatformConfig =
  | { mode: "disabled" }
  | { mode: "invalid"; invalid: readonly PlatformConfigInvalidName[] }
  | { mode: "unconfigured"; missing: readonly PlatformConfigEnvName[] }
  | { mode: "ready"; appOrigin: string; callbackUri: string; convexUrl: string };

const requiredNames: readonly PlatformConfigEnvName[] = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
  "NEXT_PUBLIC_CONVEX_URL",
];

const apiOverrideNames = ["WORKOS_API_HOSTNAME", "WORKOS_API_HTTPS", "WORKOS_API_PORT"] as const;

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseSafeUrl(value: string, expectedPathname: string): URL | null {
  try {
    const url = new URL(value);
    const safeProtocol = url.protocol === "https:" || (url.protocol === "http:" && isLoopback(url.hostname));
    if (!safeProtocol || url.username || url.password || url.pathname !== expectedPathname || url.search || url.hash) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * Reports only configuration names and public origins. Provider credentials
 * remain in process.env for the provider SDK and never enter application data.
 */
export function inspectPlatformConfig(env: NodeJS.ProcessEnv = process.env): PlatformConfig {
  const platformMode = env.STELLAR_PLATFORM_MODE ?? "";
  const localMode = env.STELLAR_LOCAL_MODE ?? "";

  if (platformMode !== "" && platformMode !== "0" && platformMode !== "1") {
    return { mode: "invalid", invalid: ["STELLAR_PLATFORM_MODE"] };
  }
  if (platformMode !== "1") return { mode: "disabled" };
  if (localMode !== "" && localMode !== "0") {
    return { mode: "invalid", invalid: ["STELLAR_LOCAL_MODE"] };
  }

  const forbiddenOverrides = apiOverrideNames.filter((name) => present(env[name]));
  if (forbiddenOverrides.length > 0) {
    return { mode: "invalid", invalid: forbiddenOverrides };
  }

  const invalid: PlatformConfigEnvName[] = [];
  const clientId = env.WORKOS_CLIENT_ID;
  const apiKey = env.WORKOS_API_KEY;
  const cookiePassword = env.WORKOS_COOKIE_PASSWORD;
  const callbackValue = env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  const convexValue = env.NEXT_PUBLIC_CONVEX_URL;

  if (present(clientId) && !/^client_[A-Za-z0-9_-]{8,}$/.test(clientId)) invalid.push("WORKOS_CLIENT_ID");
  if (present(apiKey) && !/^sk_[A-Za-z0-9_-]{8,}$/.test(apiKey)) invalid.push("WORKOS_API_KEY");
  if (present(cookiePassword) && cookiePassword.length < 32) invalid.push("WORKOS_COOKIE_PASSWORD");

  const callbackUri = present(callbackValue) ? parseSafeUrl(callbackValue, "/auth/callback") : null;
  const convexUrl = present(convexValue) ? parseSafeUrl(convexValue, "/") : null;
  if (present(callbackValue) && callbackUri === null) invalid.push("NEXT_PUBLIC_WORKOS_REDIRECT_URI");
  if (present(convexValue) && convexUrl === null) invalid.push("NEXT_PUBLIC_CONVEX_URL");
  if (invalid.length > 0) return { mode: "invalid", invalid };

  const missing = requiredNames.filter((name) => !present(env[name]));
  if (missing.length > 0) return { mode: "unconfigured", missing };

  // The missing and invalid branches prove these values are present and parsed.
  return {
    mode: "ready",
    appOrigin: callbackUri!.origin,
    callbackUri: callbackUri!.toString(),
    convexUrl: convexUrl!.origin,
  };
}
