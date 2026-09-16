"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ProjectPage, ProjectSummary, Workspace } from "../../lib/platform/http";
import { discardIntent, intentStorageKey, newIntent, parseIntent, type CreateIntent } from "./create-intent";
import { failureMessage, platformRequest, PlatformRequestError } from "./client";
import styles from "./platform.module.css";

export function PlatformDashboard({ organizationId }: { organizationId: string | null }) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [intent, setIntent] = useState<CreateIntent | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const load = useCallback(async () => {
    try {
      const current = await platformRequest<Workspace>("workspace");
      setWorkspace(current); setNeedsSetup(false); setMessage("");
      try {
        const pending = parseIntent(sessionStorage.getItem(intentStorageKey(current.actor.subject, current.tenant._id)));
        setIntent(pending); setName(pending?.name ?? ""); setStorageReady(true);
      } catch { setStorageReady(false); }
      const page = await platformRequest<ProjectPage>("projects");
      setProjects(page.page); setCursor(page.isDone ? null : page.continueCursor);
    } catch (error) {
      setWorkspace(null); setProjects([]);
      setNeedsSetup(error instanceof PlatformRequestError && error.code === "WORKSPACE_NOT_PROVISIONED");
      setMessage(failureMessage(error));
    } finally { setBusy(false); }
  }, []);
  // The effect loads external project state; it does not derive state from render values.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  async function initialize() {
    setBusy(true); setMessage("");
    try { await platformRequest("workspace", {}); await load(); }
    catch (error) { setMessage(failureMessage(error)); setBusy(false); }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!workspace || !storageReady) return;
    const pending = intent ?? newIntent(name, crypto.randomUUID());
    if (!pending) { setMessage(failureMessage(new PlatformRequestError("INVALID_REQUEST"))); return; }
    const key = intentStorageKey(workspace.actor.subject, workspace.tenant._id);
    try { sessionStorage.setItem(key, JSON.stringify(pending)); }
    catch { setStorageReady(false); setMessage("Allow session storage so an interrupted creation can be recovered safely."); return; }
    setIntent(pending); setBusy(true); setMessage("");
    try {
      const project = await platformRequest<ProjectSummary>("projects", pending);
      sessionStorage.removeItem(key); setIntent(null); setName("");
      setProjects((items) => [project, ...items.filter((item) => item._id !== project._id)]);
      setMessage(`Created ${project.name}. Its workspace is not connected yet.`);
    } catch (error) { setMessage(`${failureMessage(error)} Your original creation request is retained for retry.`); }
    finally { setBusy(false); }
  }
  function discardPending() {
    if (!workspace || !intent) return;
    if (!window.confirm("The earlier request may already have created a project. Refresh and check your project list first. Discard this request anyway? A new attempt can create another project.")) return;
    try {
      discardIntent(sessionStorage, workspace.actor.subject, workspace.tenant._id);
      setIntent(null); setName(""); setMessage("The pending request was discarded. Existing project records have not been deleted.");
    } catch { setMessage("The pending request could not be cleared from session storage."); }
  }
  async function more() {
    if (!cursor) return;
    setBusy(true); setMessage("");
    try {
      const page = await platformRequest<ProjectPage>(`projects?cursor=${encodeURIComponent(cursor)}`);
      setProjects((items) => [...items, ...page.page.filter((next) => !items.some((item) => item._id === next._id))]);
      setCursor(page.isDone ? null : page.continueCursor);
    } catch (error) { setMessage(failureMessage(error)); }
    finally { setBusy(false); }
  }
  return <div className={styles.content}>
    {message && <p className={styles.notice} role="status">{message}</p>}
    {busy && <p role="status">Loading projects…</p>}
    {needsSetup && (organizationId
      ? <p>Your organization needs a Stellar workspace and membership grant from its administrator.</p>
      : <button className={styles.primary} onClick={() => void initialize()} disabled={busy}>Set up my workspace</button>)}
    {workspace && <>
      <p className={styles.eyebrow}>{workspace.tenant.name} · {workspace.tenant.role}</p>
      {workspace.tenant.role !== "viewer" && <form onSubmit={(event) => void create(event)} className={styles.form}>
        <label htmlFor="project-name">Project name</label>
        <div className={styles.formRow}>
          <input id="project-name" value={intent?.name ?? name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="My new website" disabled={busy || !!intent} required />
          <button className={styles.primary} type="submit" disabled={busy || !storageReady}>{intent ? "Retry creation" : "Create project"}</button>
        </div>
        <p className={styles.muted}>{intent ? "An earlier request is unresolved. Retrying checks that same request." : "Save a named project. Connecting its source workspace is a separate step."}</p>
        {intent && <button className={styles.secondary} type="button" onClick={discardPending} disabled={busy}>Discard unresolved request</button>}
        {!storageReady && <p role="alert">Enable session storage to create projects with safe retry recovery.</p>}
      </form>}
      <ul className={styles.projects}>
        {projects.map((project) => <li key={project._id}>
          <Link className={styles.projectLink} href={`/platform/projects/${encodeURIComponent(project._id)}`}>
            <span>{project.name}</span><span className={styles.badge}>Workspace not connected</span>
          </Link>
        </li>)}
      </ul>
      {!busy && !projects.length && <p>No projects are available in this workspace yet.</p>}
      {cursor && <button className={styles.secondary} onClick={() => void more()} disabled={busy}>Load more projects</button>}
    </>}
    <button className={styles.secondary} onClick={() => { setBusy(true); setMessage(""); setWorkspace(null); setProjects([]); void load(); }} disabled={busy}>Refresh projects</button>
    <p className={styles.muted}><a href="/auth/sign-in">Sign in again</a> if your session has ended.</p>
  </div>;
}
