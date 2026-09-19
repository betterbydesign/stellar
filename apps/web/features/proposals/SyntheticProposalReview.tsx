"use client";
import { useEffect, useState } from "react";
import { ProposalReview } from "./ProposalReview";
import { loseNextSyntheticResponse, resetSyntheticReview, setSyntheticViewer, syntheticDecisionWrites, syntheticReviewTransport, syntheticViewer, SYNTHETIC_PROJECT_ID } from "./synthetic-harness";
import styles from "./review.module.css";

export function SyntheticProposalReview() {
  const [viewer, setViewer] = useState(false);
  const [instance, setInstance] = useState(0);
  const [message, setMessage] = useState("");
  // The effect reads browser-only harness state after server rendering.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setViewer(syntheticViewer()); }, []);
  function reset() { resetSyntheticReview(); setInstance((value) => value + 1); setMessage("Synthetic proposals reset in this browser tab."); }
  function toggleViewer() { const next = !viewer; setSyntheticViewer(next); setViewer(next); setInstance((value) => value + 1); setMessage(next ? "Synthetic viewer mode: decisions are read only." : "Synthetic editor mode: decisions are available."); }
  return <main className="shell">
    <div className={styles.review}>
      <p className={styles.eyebrow}>Development only · synthetic data</p>
      <h1>Proposal review harness</h1>
      <p className={styles.muted}>This isolated browser tab has fabricated proposals and an in-browser decision store. It is not a WorkOS session, Convex deployment, provider run, connected runner, or source edit. All provider calls and spending are disabled.</p>
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={reset}>Reset synthetic proposals</button>
        <button className={styles.secondary} onClick={toggleViewer}>{viewer ? "Switch to synthetic editor" : "Switch to synthetic viewer"}</button>
        <button className={styles.secondary} onClick={() => { loseNextSyntheticResponse(); setMessage("The next synthetic decision response will be lost after it is saved. Reload to reconcile."); }}>Simulate one lost decision response</button>
        <button className={styles.secondary} onClick={() => setMessage(`Synthetic decision writes: ${syntheticDecisionWrites()}`)}>Show synthetic decision writes</button>
      </div>
      {message && <p className={styles.notice} role="status">{message}</p>}
      <ProposalReview key={`${instance}-${viewer}`} projectId={SYNTHETIC_PROJECT_ID} transport={syntheticReviewTransport} heading="Synthetic proposals" />
    </div>
  </main>;
}
