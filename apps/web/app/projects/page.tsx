import { redirect } from "next/navigation";
import { inspectPlatformConfig } from "../../lib/platform/config";
import { ProjectList } from "../../features/studio/ProjectList";

export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  if (inspectPlatformConfig().mode !== "disabled") redirect("/platform");
  return <ProjectList />;
}
