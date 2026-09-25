"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectPage, ProjectSummary, Workspace } from "../../lib/platform/http";
import { discardIntent, intentStorageKey, parseIntent, type CreateIntent } from "./create-intent";
import { failureMessage, platformRequest, PlatformRequestError } from "./client";
import { connectedRequest } from "./connected-client";
import { loadAccount } from "./onboarding";
import { WebsiteSetup } from "./WebsiteSetup";
import styles from "./platform.module.css";

type ConnectedStatus = { available: boolean; connected: boolean; label?: string; needsLocalConfirmation?: boolean };
type AccountProject = Omit<ProjectSummary, "sourceState"> & { sourceState: "unlinked" | "preparing" | "provisioning" | "ready" };

export function PlatformDashboard({ organizationId }: { organizationId: string | null }) {
  const createInFlight = useRef(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<AccountProject[]>([]);
  const [connection, setConnection] = useState<ConnectedStatus | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [intent, setIntent] = useState<CreateIntent | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const load = useCallback(async () => {
    try {
      const current = await loadAccount(organizationId);
      setWorkspace(current); setNeedsSetup(false); setMessage("");
      try {
        const pending = parseIntent(sessionStorage.getItem(intentStorageKey(current.actor.subject, current.tenant._id)));
        setIntent(pending); setStorageReady(true);
      } catch { setStorageReady(false); }
      const page = await platformRequest<ProjectPage>("projects");
      setProjects(page.page as AccountProject[]); setCursor(page.isDone ? null : page.continueCursor);
      try { setConnection(await connectedRequest<ConnectedStatus>("status")); }
      catch { setConnection({ available: false, connected: false }); }
    } catch (error) {
      setWorkspace(null); setProjects([]);
      setNeedsSetup(error instanceof PlatformRequestError && error.code === "WORKSPACE_NOT_PROVISIONED");
      setMessage(failureMessage(error));
    } finally { setBusy(false); }
  }, [organizationId]);
  // The effect loads external project state; it does not derive state from render values.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!workspace || !storageReady || !intent || createInFlight.current) return;
    const pending = intent;
    const key = intentStorageKey(workspace.actor.subject, workspace.tenant._id);
    try { sessionStorage.setItem(key, JSON.stringify(pending)); }
    catch { setStorageReady(false); setMessage("Allow session storage so an interrupted creation can be recovered safely."); return; }
    createInFlight.current = true;
    setIntent(pending); setBusy(true); setMessage("");
    try {
      const project = await platformRequest<ProjectSummary>("projects", pending) as AccountProject;
      sessionStorage.removeItem(key); setIntent(null);
      setProjects((items) => [project, ...items.filter((item) => item._id !== project._id)]);
      setMessage(`Recovered ${project.name}. Its name is saved; website setup is still incomplete.`);
    } catch (error) { setMessage(`${failureMessage(error)} Your original creation request is retained for retry.`); }
    finally { createInFlight.current = false; setBusy(false); }
  }
  function discardPending() {
    if (!workspace || !intent) return;
    if (!window.confirm("The earlier request may already have created a project. Refresh and check your project list first. Discard this request anyway? A new attempt can create another project.")) return;
    try {
      discardIntent(sessionStorage, workspace.actor.subject, workspace.tenant._id);
      setIntent(null); setMessage("The pending request was discarded. Existing project records have not been deleted.");
    } catch { setMessage("The pending request could not be cleared from session storage."); }
  }
  async function more() {
    if (!cursor) return;
    setBusy(true); setMessage("");
    try {
      const page = await platformRequest<ProjectPage>(`projects?cursor=${encodeURIComponent(cursor)}`);
      setProjects((items) => [...items, ...(page.page as AccountProject[]).filter((next) => !items.some((item) => item._id === next._id))]);
      setCursor(page.isDone ? null : page.continueCursor);
    } catch (error) { setMessage(failureMessage(error)); }
    finally { setBusy(false); }
  }
  return <div className={styles.content}>
    {message && <p className={styles.notice} role="status">{message}</p>}
    {busy && <p role="status">Preparing your account…</p>}
    {needsSetup && <p>{organizationId ? "Your organization needs access from its Stellar administrator." : "Account setup could not finish. Retry below; your existing access will be checked again."}</p>}
    {workspace && <>
      <p className={styles.eyebrow}>{workspace.tenant.kind === "personal" ? "Personal account" : workspace.tenant.name}</p>
      <section className={`${styles.connectionBanner} ${connection?.connected ? styles.connectionBannerReady : ""}`}>
        <div><p className={styles.eyebrow}>Website editing</p>
          <h2>{connection?.connected ? `${connection.label ?? "This computer"} is connected` : "Connect a computer to build"}</h2>
          <p>{connection?.connected ? "New websites can be prepared from reviewed source and opened in Studio." : "Source files and edit history stay on the computer you explicitly connect to this account."}</p></div>
        <Link className={connection?.connected ? styles.secondaryLink : styles.primary} href="/platform/setup">{connection?.connected ? "Connection settings" : "Connect this computer"}</Link>
      </section>
      {connection?.connected && workspace.tenant.role !== "viewer" && <div id="new-website"><WebsiteSetup workspace={workspace} /></div>}
      {workspace.tenant.role !== "viewer" && intent && <form onSubmit={(event) => void create(event)} className={styles.form}>
        <label htmlFor="project-name">Project name</label>
        <div className={styles.formRow}>
          <input id="project-name" value={intent.name} disabled readOnly />
          <button className={styles.primary} type="submit" disabled={busy || !storageReady}>Recover saved request</button>
        </div>
        <p className={styles.muted}>An earlier request is unresolved. Recovery checks that same request; it does not prepare website files.</p>
        {intent && <button className={styles.secondary} type="button" onClick={discardPending} disabled={busy}>Discard unresolved request</button>}
        {!storageReady && <p role="alert">Enable session storage to create projects with safe retry recovery.</p>}
      </form>}
      <ul className={styles.projects}>
        {projects.map((project) => <li key={project._id}>
          <Link className={styles.projectLink} href={`/platform/projects/${encodeURIComponent(project._id)}`}>
            <span>{project.name}</span><span className={`${styles.badge} ${project.sourceState === "ready" ? styles.badgeReady : ""}`}>
              {project.sourceState === "ready" ? "Ready to edit" : project.sourceState === "preparing" || project.sourceState === "provisioning" ? "Preparing" : "Setup incomplete"}
            </span>
          </Link>
        </li>)}
      </ul>
      {!busy && !projects.length && <p>No websites have been registered in your account yet.</p>}
      {cursor && <button className={styles.secondary} onClick={() => void more()} disabled={busy}>Load more projects</button>}
    </>}
    <button className={styles.secondary} onClick={() => { setBusy(true); setMessage(""); setWorkspace(null); setProjects([]); void load(); }} disabled={busy}>Refresh projects</button>
    <p className={styles.muted}><a href="/auth/sign-in">Sign in again</a> if your session has ended.</p>
  </div>;
}
