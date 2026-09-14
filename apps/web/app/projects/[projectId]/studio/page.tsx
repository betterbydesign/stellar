import { Studio } from "../../../../features/studio/Studio";

export default async function StudioPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <Studio key={projectId} projectId={projectId} />;
}
