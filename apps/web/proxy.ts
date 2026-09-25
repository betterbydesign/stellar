import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { inspectPlatformConfig } from "./lib/platform/config";

const authkitHeaderNames = new Set([
  "x-workos-middleware",
  "x-url",
  "x-redirect-uri",
  "x-sign-up-paths",
  "x-workos-session",
]);

function withoutSpoofedAuthkitHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const name of Array.from(headers.keys())) {
    const normalized = name.toLowerCase();
    if (authkitHeaderNames.has(normalized) || normalized.startsWith("x-workos-")) headers.delete(name);
  }
  return headers;
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const platform = inspectPlatformConfig();
  if (platform.mode !== "ready") {
    return NextResponse.next({ request: { headers: withoutSpoofedAuthkitHeaders(request) } });
  }

  const { authkitProxy } = await import("@workos-inc/authkit-nextjs");
  return authkitProxy({ redirectUri: platform.callbackUri })(request, event);
}

export const config = {
  matcher: ["/platform/:path*", "/api/platform/:path*", "/api/connected/:path*", "/auth/:path*"],
};
