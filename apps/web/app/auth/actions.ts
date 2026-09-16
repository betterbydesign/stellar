"use server";

import { inspectPlatformConfig } from "../../lib/platform/config";

export async function signOutAction(): Promise<void> {
  const platform = inspectPlatformConfig();
  if (platform.mode !== "ready") throw new Error("Platform authentication is unavailable.");

  const { signOut } = await import("@workos-inc/authkit-nextjs");
  await signOut({ returnTo: `${platform.appOrigin}/platform` });
}
