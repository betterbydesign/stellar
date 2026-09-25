import { readConnectedConfig } from "../../../../lib/connected/config";
import { connectedHttp } from "../../../../lib/connected/http";
import { connectedBackend, connectedRunner } from "../../../../lib/connected/transport";
import { readPlatformSession } from "../../../../lib/platform/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const config = readConnectedConfig();
  return connectedHttp(request, (await context.params).segments, {
    config, session: readPlatformSession,
    backend: (token) => connectedBackend(config?.convexUrl ?? "https://unconfigured.invalid", token),
    runner: config ? connectedRunner(config) : async () => { throw new Error("RUNNER_DISCONNECTED"); },
  });
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
