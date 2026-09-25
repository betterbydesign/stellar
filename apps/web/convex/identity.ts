import { ConvexError } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

export const SUBJECT_PATTERN = /^\S{1,512}$/;
export const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

type IdentityCtx = Pick<QueryCtx | MutationCtx | ActionCtx, "auth">;

function fail(code: string): never {
  throw new ConvexError({ code });
}

function configuredNamespace(): string {
  const clientId = process.env.WORKOS_CLIENT_ID?.trim();
  if (!clientId) fail("AUTH_CONFIG_MISSING");
  return clientId;
}

export async function requireActor(ctx: IdentityCtx) {
  const identityNamespace = configuredNamespace();
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null || !SUBJECT_PATTERN.test(identity.subject)) {
    fail("UNAUTHENTICATED");
  }

  const allowedIssuers = new Set([
    "https://api.workos.com/",
    `https://api.workos.com/user_management/${identityNamespace}`,
  ]);
  if (!allowedIssuers.has(identity.issuer)) fail("UNAUTHENTICATED");

  const organizationClaim = identity.org_id;
  if (
    organizationClaim !== undefined &&
    (typeof organizationClaim !== "string" ||
      !ORGANIZATION_ID_PATTERN.test(organizationClaim))
  ) {
    fail("UNAUTHENTICATED");
  }

  return {
    identityNamespace,
    subject: identity.subject,
    organizationId: organizationClaim as string | undefined,
  };
}

export type VerifiedActor = Awaited<ReturnType<typeof requireActor>>;
