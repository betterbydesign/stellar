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
      <p className={styles.badge}>Workspace not connected</p>
      <p>This project is saved in your Stellar account. Source files and editing history remain with their workspace runner.</p>
      <p>Remote workspace connections are not available in this version. To edit an existing local project, open the connection link from your local Stellar launcher.</p>
      <button className={styles.secondary} disabled>Open Studio — connection required</button>
      <p className={styles.muted}>Created {new Date(project.createdAt).toLocaleDateString()}. This project has no linked source workspace.</p>
      <ProposalReview projectId={projectId} />
    </>}
    <button className={styles.secondary} onClick={() => { setBusy(true); setProject(null); void load(); }} disabled={busy}>Reload project</button>
  </div>;
}
