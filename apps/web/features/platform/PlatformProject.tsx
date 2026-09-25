"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ProjectSummary, Workspace } from "../../lib/platform/http";
import { ProposalReview } from "../proposals/ProposalReview";
import { failureMessage, platformRequest } from "./client";
import { connectedRequest } from "./connected-client";
import { WebsiteSetup } from "./WebsiteSetup";
import styles from "./platform.module.css";

type AccountProject = Omit<ProjectSummary, "sourceState"> & { sourceState: "unlinked" | "preparing" | "provisioning" | "ready" };
type WebsiteStatus = {
  projectId: string;
  name: string;
  sourceState: "unlinked" | "preparing" | "ready";
  connected: boolean;
  registryProjectId?: string;
  blueprintId?: string;
  blueprintVersion?: string;
  requestId?: string;
};

export function PlatformProject({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<AccountProject | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [website, setWebsite] = useState<WebsiteStatus | null>(null);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    try {
      const [nextProject, nextWorkspace] = await Promise.all([
        platformRequest<ProjectSummary>(`projects/${encodeURIComponent(projectId)}`),
        platformRequest<Workspace>("workspace"),
      ]);
      setProject(nextProject as AccountProject); setWorkspace(nextWorkspace); setMessage("");
      try {
        setWebsite(await connectedRequest<WebsiteStatus>(`websites/${encodeURIComponent(projectId)}`));
        setConnectionMessage("");
      } catch (error) {
        setWebsite(null); setConnectionMessage(failureMessage(error));
      }
    }
    catch (error) { setProject(null); setMessage(failureMessage(error)); }
    finally { setBusy(false); }
  }, [projectId]);
  // The effect loads external project state; it does not derive state from render values.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  return <div className={styles.content}>
    <Link href="/platform">← All projects</Link>
    {busy && <p role="status">Opening project…</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    {project && <>
      <h1>{project.name}</h1>
      {(website?.sourceState ?? project.sourceState) === "ready" ? <>
        <p className={`${styles.badge} ${styles.badgeReady}`}>Ready to edit</p>
        {workspace?.tenant.role === "viewer" ? <section className={styles.notice}>
          <h2>Editor access required</h2><p>This website is ready, but your current role cannot open or change its source.</p>
        </section> : website?.connected ? <>
          <p>This website is bound to its exact source on the connected computer.</p>
          <Link className={styles.primary} href={`/platform/projects/${encodeURIComponent(projectId)}/studio`}>Open Studio</Link>
        </> : <section className={styles.notice}>
          <h2>Reconnect the source computer</h2>
          <p>The website binding is retained, but its computer is not available. Reconnect that same installation before opening Studio.</p>
          <Link className={styles.primary} href="/platform/setup">Reconnect computer</Link>
        </section>}
        {website?.blueprintId && <p className={styles.muted}>Reviewed template {website.blueprintId}{website.blueprintVersion ? ` ${website.blueprintVersion}` : ""}. The registry identity is verified again for each action.</p>}
      </> : <>
        <p className={styles.badge}>{website?.sourceState === "preparing" ? "Preparing" : "Setup incomplete"}</p>
        <p>The name “{project.name}” is saved in your account. Website files still need to be prepared on a connected computer.</p>
        {workspace?.tenant.role === "viewer" ? <section className={styles.notice}><h2>Editor access required</h2><p>Your current role can view this account record but cannot prepare website source.</p></section>
          : website?.connected && workspace
            ? <WebsiteSetup workspace={workspace} existingProject={{ projectId, name: project.name, requestId: website.requestId, blueprintId: website.blueprintId, blueprintVersion: website.blueprintVersion }} />
            : <section className={styles.notice}><h2>Connect the source computer</h2><p>{connectionMessage || "Stellar needs an explicitly connected computer before it can prepare this website."}</p><Link className={styles.primary} href="/platform/setup">Connect this computer</Link></section>}
        <p className={styles.muted}>Name saved {new Date(project.createdAt).toLocaleDateString()}. No existing local files are attached automatically or matched by name.</p>
      </>}
      <ProposalReview projectId={projectId} hideWhenEmpty />
    </>}
    <button className={styles.secondary} onClick={() => { setBusy(true); setProject(null); void load(); }} disabled={busy}>Reload project</button>
  </div>;
}
