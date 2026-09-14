import { makeError } from "@stellar/contracts";
import { readLocalConfig } from "../../../../lib/server/local-config";
import { isAllowedOrigin, isAppRequest, readOperator } from "../../../../lib/server/operator-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };

export async function GET(request: Request): Promise<Response> {
  const config = readLocalConfig();
  if (!config) {
    const value = makeError({}, "RUNNER_UNAVAILABLE");
    return Response.json(value, { status: 503, headers });
  }
  if (!isAppRequest(request, config) || !isAllowedOrigin(request, config, false)) {
    const value = makeError({}, "FORBIDDEN");
    return Response.json(value, { status: 403, headers });
  }
  const operator = readOperator(request, config);
  if (!operator) {
    const value = makeError({}, "UNAUTHORIZED");
    return Response.json(value, { status: 401, headers });
  }
  return Response.json({ csrfToken: operator.csrfToken, expiresAt: operator.expiresAt }, { headers });
}
