import type { NextRequest } from "next/server";
import { inspectPlatformConfig } from "../../../lib/platform/config";

export async function GET(request: NextRequest) {
  const platform = inspectPlatformConfig();
  if (platform.mode !== "ready") {
    return new Response("Platform authentication is unavailable.", { status: 503 });
  }

  const { handleAuth } = await import("@workos-inc/authkit-nextjs");
  return handleAuth({ baseURL: platform.appOrigin, returnPathname: "/platform" })(request);
}
