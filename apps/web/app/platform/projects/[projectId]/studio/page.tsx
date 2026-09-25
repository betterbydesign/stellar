import { redirect } from "next/navigation";
import { Studio } from "../../../../../features/studio/Studio";
import { readPlatformSession } from "../../../../../lib/platform/session";
import { readConnectedConfig } from "../../../../../lib/connected/config";
import { connectedBackend } from "../../../../../lib/connected/transport";

export const dynamic = "force-dynamic";
export default async function ConnectedStudioPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const session = await readPlatformSession();
  const config = readConnectedConfig();
  if (!session) redirect("/auth/sign-in");
  if (!config) redirect(`/platform/projects/${encodeURIComponent(projectId)}`);
  let registryProjectId: string | null = null;
  try {
    const value = await connectedBackend(config.convexUrl, session.accessToken)("query", "connected:getProjectConnection", { projectId });
    if (value && typeof value === "object" && "context" in value && "binding" in value) {
      const state = value as { context: { sourceState?: string }; binding: { registryProjectId?: string } | null };
      if (state.context.sourceState === "ready" && typeof state.binding?.registryProjectId === "string") registryProjectId = state.binding.registryProjectId;
    }
  } catch { /* Project detail provides an actionable current access or connection state. */ }
  if (!registryProjectId) redirect(`/platform/projects/${encodeURIComponent(projectId)}`);
  return <Studio key={`${projectId}:${registryProjectId}`} projectId={registryProjectId} projectsHref="/platform" />;
}
