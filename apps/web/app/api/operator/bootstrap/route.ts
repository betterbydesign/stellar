import { makeError } from "@stellar/contracts";
import { readLocalConfig } from "../../../../lib/server/local-config";
import { bootstrapOperator, isAllowedOrigin, isAppRequest, OPERATOR_COOKIE } from "../../../../lib/server/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const fail = (code: "FORBIDDEN" | "UNAUTHORIZED" | "INVALID_REQUEST" | "RUNNER_UNAVAILABLE") => {
  const value = makeError({}, code);
  return Response.json(value, { status: value.error.httpStatus, headers });
};

export async function POST(request: Request): Promise<Response> {
  const config = readLocalConfig();
  if (!config) return fail("RUNNER_UNAVAILABLE");
  if (!isAppRequest(request, config) || !isAllowedOrigin(request, config, true)) return fail("FORBIDDEN");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail("INVALID_REQUEST");
  let nonce: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1024) return fail("INVALID_REQUEST");
    const body = JSON.parse(raw) as Record<string, unknown>;
    nonce = Object.keys(body).length === 1 ? body.nonce : null;
  } catch { return fail("INVALID_REQUEST"); }
  if (typeof nonce !== "string") return fail("INVALID_REQUEST");
  const issued = await bootstrapOperator(nonce, config);
  if (!issued) return fail("UNAUTHORIZED");
  const response = Response.json({ csrfToken: issued.operator.csrfToken, expiresAt: issued.operator.expiresAt }, { headers });
  response.headers.set("set-cookie", `${OPERATOR_COOKIE}=${issued.cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`);
  return response;
}
