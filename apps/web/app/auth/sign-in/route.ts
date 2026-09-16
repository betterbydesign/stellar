import { redirect } from "next/navigation";
import { inspectPlatformConfig } from "../../../lib/platform/config";

export async function GET() {
  const platform = inspectPlatformConfig();
  if (platform.mode !== "ready") {
    return new Response("Platform authentication is unavailable.", { status: 503 });
  }

  const { getSignInUrl } = await import("@workos-inc/authkit-nextjs");
  redirect(await getSignInUrl({ returnTo: "/platform" }));
}
