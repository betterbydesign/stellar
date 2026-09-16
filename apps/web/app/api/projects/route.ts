import { handleProjectApi } from "../../../lib/server/project-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleProjectApi(request, []);
}

export async function POST(request: Request): Promise<Response> {
  return handleProjectApi(request, []);
}
