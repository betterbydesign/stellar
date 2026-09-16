import { redirect } from "next/navigation";
import { readPlatformSession } from "../../../../lib/platform/session";
import { PlatformProject } from "../../../../features/platform/PlatformProject";

export const dynamic = "force-dynamic";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  if (!await readPlatformSession()) redirect("/platform");
  const { projectId } = await params;
  return <main className="shell"><PlatformProject key={projectId} projectId={projectId} /></main>;
}
