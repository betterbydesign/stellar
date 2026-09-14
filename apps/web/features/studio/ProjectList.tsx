"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RegisteredWorkspace } from "@stellar/contracts";
import { listProjects, StudioApiError } from "./api";
import styles from "./studio.module.css";

export function ProjectList() {
  const [projects, setProjects] = useState<RegisteredWorkspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void listProjects(controller.signal).then(setProjects).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof StudioApiError && cause.code === "UNAUTHORIZED"
        ? "Connect to your local workspace before opening projects."
        : cause instanceof Error ? cause.message : "The local workspace is unavailable.");
    });
    return () => controller.abort();
  }, [attempt]);

  return <main className={styles.projectsPage}>
    <header className={styles.projectsHeader}>
      <span className={styles.brand}>Stellar<span aria-hidden="true">✳</span></span>
      <span className={`${styles.modeBadge} ${error ? styles.modeBadgeError : projects === null ? styles.modeBadgePending : ""}`} role="status"><span className={styles.statusDot} /> {error ? "Connection needed" : projects === null ? "Connecting…" : "Local workspace connected"}</span>
    </header>
    <section className={styles.projectsIntro}>
      <p className={styles.eyebrow}>Workspace / Sites</p>
      <h1>Projects</h1>
      <p>Open a working copy to inspect real pages and edit styles.</p>
    </section>
    <section className={styles.projectSection} aria-labelledby="project-heading">
      <div className={styles.sectionHeading}><h2 id="project-heading">Registered projects</h2><span>{projects?.length ?? "—"} available</span></div>
      {error ? <div className={styles.projectEmpty} role="alert"><strong>Workspace unavailable</strong><p>{error}</p><div className={styles.emptyActions}><button type="button" onClick={() => { setError(null); setProjects(null); setAttempt(attempt + 1); }}>Try again</button><Link href="/connect">Connect workspace</Link></div></div>
        : projects === null ? <div className={styles.projectEmpty} role="status">Loading registered projects…</div>
          : projects.length === 0 ? <div className={styles.projectEmpty}><strong>No registered projects yet</strong><p>Start the local launcher to load the reviewed example projects.</p><Link href="/connect">Connect workspace</Link></div>
            : <div className={styles.projectGrid}>{projects.map((workspace, index) => <Link className={styles.projectCard} href={`/projects/${encodeURIComponent(workspace.project.id)}/studio`} key={workspace.id}>
              <span className={styles.cardTop}><span className={styles.cardNumber}>0{index + 1} / SITE</span><span aria-hidden="true">↗</span></span>
              <span className={styles.cardArtwork} aria-hidden="true"><span className={styles.artRingOne} /><span className={styles.artRingTwo} /><span className={styles.artLetter}>f<span>.</span></span></span>
              <span className={styles.cardBottom}><span><strong>{workspace.project.name}</strong><small>{workspace.label} · {workspace.project.pageCount} pages · {workspace.project.renderer.toUpperCase()} · Ready to open</small></span><span className={styles.cardArrow} aria-hidden="true">→</span></span>
            </Link>)}</div>}
    </section>
    <footer className={styles.projectsFooter}><span>Stellar / local editor preview</span><span>Source stays in your local working copy</span></footer>
  </main>;
}
