import "../../apps/web/app/globals.css";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionSetup } from "../../apps/web/features/platform/ConnectionSetup";
import { PlatformDashboard } from "../../apps/web/features/platform/PlatformDashboard";
import { PlatformProject } from "../../apps/web/features/platform/PlatformProject";
import { Studio } from "../../apps/web/features/studio/Studio";

function StudioRoute({ accountProjectId }: { accountProjectId: string }) {
  const [registryProjectId, setRegistryProjectId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/connected/websites/${encodeURIComponent(accountProjectId)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const value = await response.json() as { registryProjectId?: unknown; error?: { code?: string } };
        if (!response.ok || typeof value.registryProjectId !== "string") throw new Error(value.error?.code ?? "Website is not ready");
        setRegistryProjectId(value.registryProjectId);
      })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "Website is not ready"));
  }, [accountProjectId]);
  if (error) return <main className="shell"><p role="alert">{error}</p></main>;
  if (!registryProjectId) return <main className="shell"><p role="status">Opening Studio…</p></main>;
  return <Studio projectId={registryProjectId} projectsHref="/platform" />;
}

function App() {
  const path = window.location.pathname;
  const project = /^\/platform\/projects\/([A-Za-z0-9_-]+)(\/studio)?$/.exec(path);
  let content;
  if (path === "/platform/setup") content = <ConnectionSetup organizationId={null} />;
  else if (project?.[2]) content = <StudioRoute accountProjectId={project[1]!} />;
  else if (project) content = <PlatformProject projectId={project[1]!} />;
  else content = <PlatformDashboard organizationId={null} />;
  return <main className="shell">
    {path !== "/platform" && !project?.[2] && <header className="masthead"><a className="wordmark" href="/platform">Stellar<span aria-hidden="true">✳</span></a><a href="/platform">Your websites</a></header>}
    {content}
  </main>;
}

createRoot(document.getElementById("root")!).render(<App />);
