"use client";
import { useCallback, useEffect, useState } from "react";
import { accountReviewTransport } from "./client";
import { reviewFailureMessage } from "./error";
import { parsePendingReview, reconciledPending, reviewStorageKey, type PendingReview } from "./pending";
import type { ProposalDetail, ProposalPage, ProposalRead, ReviewAction, ReviewTransport } from "./types";
import styles from "./review.module.css";

const actionLabels: Record<ReviewAction, string> = { approve: "Record approval", reject: "Reject proposal", cancel: "Cancel proposal" };
const statusLabels: Record<string, string> = { proposed: "Awaiting review", approved: "Approved for review only", rejected: "Rejected", cancelled: "Cancelled", expired: "Expired" };
function canWithdraw(proposal: ProposalDetail): boolean {
  return proposal.status === "approved" || (proposal.status === "expired" && proposal.decision?.action === "approve");
}

function date(value: number) { return new Date(value).toLocaleString(); }
function exact(value: unknown) { return JSON.stringify(value, null, 2); }
function PatchPreview({ proposal }: { proposal: ProposalDetail }) {
  const patch = proposal.sourceProposal.sourcePatch;
  return <div className={styles.patch}>
    <p><strong>{patch.file}</strong> · bytes {patch.startByte}–{patch.endByte}</p>
    <div><span>Before</span><pre>{patch.expectedOldText || "(empty insertion point)"}</pre></div>
    <div><span>After</span><pre>{patch.replacementText || "(empty)"}</pre></div>
    <p className={styles.muted}>Expected file SHA-256: <code>{patch.expectedFileSha256}</code></p>
  </div>;
}
function readStored(key: string): PendingReview | null {
  try { return parsePendingReview(sessionStorage.getItem(key)); } catch { return null; }
}

export function ProposalReview({ projectId, transport = accountReviewTransport, heading = "Proposals" }: {
  projectId: string; transport?: ReviewTransport; heading?: string;
}) {
  const [page, setPage] = useState<ProposalPage | null>(null);
  const [detail, setDetail] = useState<ProposalRead | null>(null);
  const [pending, setPending] = useState<PendingReview | null>(null);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (wantedId?: string) => {
    setLoading(true);
    try {
      const first = await transport.list(projectId);
      const key = reviewStorageKey(first.tenantId, first.actor.subject, projectId);
      const saved = readStored(key);
      const id = saved?.proposalId ?? wantedId ?? first.page[0]?.id;
      const selected = id ? await transport.get(projectId, id) : null;
      if (selected && (selected.tenantId !== first.tenantId || selected.actor.subject !== first.actor.subject || selected.proposal.projectId !== projectId)) throw new Error("Scope changed");
      if (saved && selected && reconciledPending(saved, selected.proposal.decisionHistory, first.actor.subject)) {
        sessionStorage.removeItem(key);
        setPending(null);
        setNotice(`Recovered the recorded ${saved.action} decision after reload. No second decision was sent. The proposal's current state may have changed since that decision.`);
      } else {
        setPending(saved);
        setNotice(saved ? "An earlier review request may be unresolved. Check the current state, then retry the same request if needed." : "");
      }
      setPage(first); setDetail(selected); setStorageKey(key);
    } catch (error) {
      setPage(null); setDetail(null);
      setNotice(error instanceof Error && error.message === "Scope changed" ? "Project review scope changed. Reload this page after checking access." : reviewFailureMessage(error));
    } finally { setLoading(false); }
  }, [projectId, transport]);

  // The effect loads server or isolated harness state; it does not derive state from render values.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function select(proposalId: string) {
    if (loading || deciding || pending) return;
    setLoading(true); setNotice("");
    try {
      const next = await transport.get(projectId, proposalId);
      if (!page || next.tenantId !== page.tenantId || next.actor.subject !== page.actor.subject || next.proposal.projectId !== projectId) throw new Error("Scope changed");
      setDetail(next);
    } catch (error) { setNotice(error instanceof Error && error.message === "Scope changed" ? "Project review scope changed. Reload this page after checking access." : reviewFailureMessage(error)); }
    finally { setLoading(false); }
  }

  async function more() {
    if (!page || page.isDone || loadingMore) return;
    setLoadingMore(true); setNotice("");
    try {
      const next = await transport.list(projectId, page.continueCursor);
      if (next.tenantId !== page.tenantId || next.actor.subject !== page.actor.subject) throw new Error("Scope changed");
      setPage({ ...next, page: [...page.page, ...next.page.filter((item) => !page.page.some((old) => old.id === item.id))] });
    } catch (error) { setNotice(error instanceof Error && error.message === "Scope changed" ? "Project review scope changed. Reload this page after checking access." : reviewFailureMessage(error)); }
    finally { setLoadingMore(false); }
  }

  async function decide(action: ReviewAction) {
    if (!detail || !page?.canReview || !detail.canReview || !storageKey || deciding || loading ||
      !(detail.proposal.status === "proposed" || (canWithdraw(detail.proposal) && action === "cancel"))) return;
    const current = detail.proposal;
    const intent: PendingReview = pending ?? { proposalId: current.id, action, requestId: crypto.randomUUID(), expectedDigest: current.digest, expectedRevision: current.sourceRevision };
    if (intent.proposalId !== current.id || intent.action !== action || intent.expectedDigest !== current.digest || intent.expectedRevision !== current.sourceRevision) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(intent)); }
    catch { setNotice("Allow session storage so a lost response can be recovered with the same review request."); return; }
    setPending(intent); setDeciding(true); setNotice("");
    try {
      const updated = await transport.decide(projectId, current.id, intent);
      if (updated.projectId !== projectId || updated.id !== current.id || !reconciledPending(intent, updated.decisionHistory, page.actor.subject)) throw new Error("Outcome needs reconciliation");
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setDetail({ ...detail, proposal: updated });
      setPage({ ...page, page: page.page.map((item) => item.id === updated.id ? updated : item) });
      setNotice(action === "approve" ?
        `Approval recorded. ${updated.status === "approved" ? "The source was not changed; application is unavailable until a workspace runner is connected and revalidates it." : "The proposal's current state changed after your approval. No source change was made."}` :
        `${action === "reject" ? "Rejection" : "Cancellation"} recorded. No source change was made.`);
    } catch (error) {
      setNotice(`${error instanceof Error && error.message === "Outcome needs reconciliation" ? "The decision outcome needs reconciliation." : reviewFailureMessage(error)} The original request is retained. Reload to check its result before retrying.`);
    } finally { setDeciding(false); }
  }

  function discardPending() {
    if (!storageKey || !pending) return;
    if (!window.confirm("The earlier decision may already have been recorded. Reload and check its state first. Discard the pending request anyway?")) return;
    try { sessionStorage.removeItem(storageKey); setPending(null); setNotice("The local pending request was discarded. The recorded proposal state was not changed."); }
    catch { setNotice("The pending request could not be removed from session storage."); }
  }

  const proposal = detail?.proposal;
  const canDecide = Boolean(page?.canReview && detail?.canReview && proposal && (proposal.status === "proposed" || canWithdraw(proposal)) && !loading && !deciding);
  return <section className={styles.review} aria-labelledby="proposal-review-heading">
    <div className={styles.heading}><div><p className={styles.eyebrow}>Project review</p><h2 id="proposal-review-heading">{heading}</h2></div><button className={styles.secondary} type="button" onClick={() => void load(proposal?.id)} disabled={loading || deciding}>Reload proposals</button></div>
    <p className={styles.muted}>Review records are scoped to this project. Recording approval does not apply a change. Source application is unavailable until a connected runner can revalidate the exact command and current source.</p>
    {loading && <p role="status">Loading proposals…</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {page && <>
      {!page.canReview && <p className={styles.notice}>Your access is read only. You can inspect proposals but cannot decide them.</p>}
      {!page.page.length && <p>No proposals have been prepared for this project.</p>}
      {!!page.page.length && <div className={styles.layout}>
        <div><h3>Review queue</h3><ul className={styles.list}>{page.page.map((item) => <li key={item.id}><button type="button" className={item.id === proposal?.id ? styles.selected : styles.item} onClick={() => void select(item.id)} disabled={loading || deciding || Boolean(pending)} aria-current={item.id === proposal?.id ? "true" : undefined}><span>{item.jobId}</span><small>{statusLabels[item.status] ?? item.status} · {date(item.createdAt)}</small></button></li>)}</ul>{!page.isDone && <button className={styles.secondary} onClick={() => void more()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</button>}</div>
        {proposal && <article className={styles.detail} aria-label="Proposal details">
          <div className={styles.heading}><div><p className={styles.eyebrow}>Proposal {proposal.id}</p><h3>{statusLabels[proposal.status] ?? proposal.status}</h3></div><span className={styles.badge}>{proposal.status}</span></div>
          <dl className={styles.facts}><div><dt>Source revision</dt><dd>{proposal.sourceRevision}</dd></div><div><dt>Digest (SHA-256)</dt><dd className={styles.mono}>{proposal.digest}</dd></div><div><dt>Expires</dt><dd>{date(proposal.expiresAt)}</dd></div><div><dt>Prepared</dt><dd>{date(proposal.createdAt)}</dd></div><div><dt>Initiating actor</dt><dd><code>{exact(proposal.initiatingActor)}</code></dd></div></dl>
          <h4>Exact prepared command</h4><pre>{exact(proposal.prepareChange)}</pre>
          <h4>Source context and prepared change</h4><p className={styles.muted}>This is the prepared patch for the recorded source revision. Its preview is not a live workspace read.</p><PatchPreview proposal={proposal} /><details><summary>Exact impact and patch record</summary><pre>{exact({ impact: proposal.sourceProposal.impact, sourcePatch: proposal.sourceProposal.sourcePatch })}</pre></details>
          <details><summary>Adapter provenance</summary><pre>{exact(proposal.provenance)}</pre></details>
          {!!proposal.decisionHistory.length && <details open><summary>Recorded decision history</summary><pre>{exact(proposal.decisionHistory)}</pre></details>}
          <div className={styles.disconnected}><strong>Application unavailable · RUNNER_DISCONNECTED</strong><p>Approval is a review record only. A future authenticated runner must check current grants, source revision, and the exact command before any source change.</p></div>
          {pending && <p className={styles.notice} role="status">Pending {pending.action} request {pending.requestId}. {reconciledPending(pending, proposal.decisionHistory, page.actor.subject) ? "Reload to reconcile its recorded result and current state." : "Retrying will use the same request ID if this proposal still accepts the action."}</p>}
          {canDecide && <div className={styles.actions}>
            {(canWithdraw(proposal) ? ["cancel"] as const : ["approve", "reject", "cancel"] as const).map((action) => <button key={action} className={action === "approve" ? styles.primary : styles.secondary} type="button" onClick={() => void decide(action)} disabled={Boolean(pending && pending.action !== action)}>{pending?.action === action ? `Retry ${action} request` : canWithdraw(proposal) && action === "cancel" ? "Withdraw approval" : actionLabels[action]}</button>)}
          </div>}
          {pending && <button className={styles.textButton} type="button" onClick={discardPending}>Discard unresolved local request</button>}
        </article>}
      </div>}
    </>}
  </section>;
}
