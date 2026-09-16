import "server-only";
import { inspectPlatformConfig } from "./config";

export type PlatformIdentity = {
  subject: string;
  organizationId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export type PlatformSession = {
  identity: PlatformIdentity;
  accessToken: string;
};

/** Read the verified AuthKit request session without exposing refresh/session credentials. */
export async function readPlatformSession(): Promise<PlatformSession | null> {
  if (inspectPlatformConfig().mode !== "ready") return null;

  const { withAuth } = await import("@workos-inc/authkit-nextjs");
  const auth = await withAuth();
  if (!auth.user || !auth.accessToken) return null;

  return {
    identity: {
      subject: auth.user.id,
      organizationId: auth.organizationId ?? null,
      email: auth.user.email,
      firstName: auth.user.firstName ?? null,
      lastName: auth.user.lastName ?? null,
    },
    accessToken: auth.accessToken,
  };
}
