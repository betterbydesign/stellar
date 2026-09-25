"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ProjectSummary } from "../../lib/platform/http";
import { ProposalReview } from "../proposals/ProposalReview";
import { failureMessage, platformRequest } from "./client";
import styles from "./platform.module.css";

export function PlatformProject({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    try { setProject(await platformRequest<ProjectSummary>(`projects/${encodeURIComponent(projectId)}`)); setMessage(""); }
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
      <p className={styles.badge}>Setup incomplete</p>
      <p>The name “{project.name}” is saved in your account. Website files have not been prepared, so this website is not ready to edit.</p>
      <p>Stellar currently edits websites on your computer. Account connection is still being built. Your saved record will remain here; opening a separate local website does not finish this setup.</p>
      <Link className={styles.primary} href="/platform/setup">View setup steps</Link>
      <p className={styles.muted}>Name saved {new Date(project.createdAt).toLocaleDateString()}. No existing files will be attached automatically.</p>
      <ProposalReview projectId={projectId} hideWhenEmpty />
    </>}
    <button className={styles.secondary} onClick={() => { setBusy(true); setProject(null); void load(); }} disabled={busy}>Reload project</button>
  </div>;
}
