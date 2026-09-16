import { inspectPlatformConfig } from "../../../../lib/platform/config";
import { readPlatformSession } from "../../../../lib/platform/session";
import { platformBackend, platformErrorCode } from "../../../../lib/platform/backend";
import { platformHttp } from "../../../../lib/platform/http";

export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ segments: string[] }> }) {
  const config = inspectPlatformConfig();
  const { segments } = await context.params;
  return platformHttp(request, segments, {
    appOrigin: config.mode === "ready" ? config.appOrigin : null,
    session: readPlatformSession,
    backend: platformBackend(config.mode === "ready" ? config.convexUrl : "https://unconfigured.invalid"),
    errorCode: platformErrorCode,
  });
}
export const GET = handle;
export const POST = handle;
