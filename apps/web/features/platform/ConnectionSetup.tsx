"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Workspace } from "../../lib/platform/http";
import { failureMessage } from "./client";
import { connectedRequest } from "./connected-client";
import { loadAccount } from "./onboarding";
import styles from "./platform.module.css";

type ConnectionStatus = {
  available: boolean;
  connected: boolean;
  installationId?: string;
  label?: string;
  accountLabel?: string;
  needsLocalConfirmation?: boolean;
};

type ConnectionOffer = {
  requestId: string;
  installationId: string;
  challengeId: string;
  challenge: string;
  expiresAt: number;
  label: string;
  pairingId: string;
};

const pendingNonceKey = "stellar.connected.pending-nonce.v1";
const requestPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function offerStorageKey(workspace: Workspace) {
  return `stellar.connected.offer:${encodeURIComponent(workspace.actor.subject)}:${encodeURIComponent(workspace.tenant._id)}`;
}
function offerRequestStorageKey(workspace: Workspace) { return `${offerStorageKey(workspace)}:request`; }

function validOffer(value: unknown): value is ConnectionOffer {
  if (!value || typeof value !== "object") return false;
  const offer = value as Record<string, unknown>;
  return typeof offer.requestId === "string" && requestPattern.test(offer.requestId) &&
    [offer.installationId, offer.challengeId, offer.challenge, offer.label, offer.pairingId].every((item) => typeof item === "string" && item.length > 0) &&
    typeof offer.expiresAt === "number" && Number.isFinite(offer.expiresAt);
}

function readOffer(raw: string | null): ConnectionOffer | null {
  if (!raw) return null;
  try { const value: unknown = JSON.parse(raw); return validOffer(value) ? value : null; }
  catch { return null; }
}

function shortInstallation(id: string) {
  return id.length > 18 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id;
}

export function ConnectionSetup({ organizationId }: { organizationId: string | null }) {
  const actionInFlight = useRef(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [offer, setOffer] = useState<ConnectionOffer | null>(null);
  const [offerExpired, setOfferExpired] = useState(false);
  const [pendingNonce, setPendingNonce] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  const accountLabel = status?.accountLabel ?? (workspace ? workspace.tenant.name : "your signed-in account");
  const offerExpires = useMemo(() => offer ? new Date(offer.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null, [offer]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      // A brand-new personal account must exist before the connected backend can
      // derive its tenant scope. Running these requests concurrently makes the
      // first status check race workspace provisioning.
      const currentWorkspace = await loadAccount(organizationId);
      setWorkspace(currentWorkspace);
      const currentStatus = await connectedRequest<ConnectionStatus>("status");
      setStatus(currentStatus);
      try {
        const retainedOffer = readOffer(sessionStorage.getItem(offerStorageKey(currentWorkspace)));
        setOffer(retainedOffer); setOfferExpired(Boolean(retainedOffer && retainedOffer.expiresAt <= Date.now()));
      }
      catch { setMessage("Allow session storage so an interrupted connection can be recovered safely."); }
    } catch (error) {
      setMessage(failureMessage(error));
    } finally { setBusy(false); }
  }, [organizationId]);

  useEffect(() => {
    let nonce = window.location.hash.slice(1);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    try {
      if (nonce && /^[A-Za-z0-9_-]{32,512}$/.test(nonce)) sessionStorage.setItem(pendingNonceKey, nonce);
      else nonce = sessionStorage.getItem(pendingNonceKey) ?? "";
    } catch { nonce = ""; }
    const retainedNonce = nonce || null;
    queueMicrotask(() => setPendingNonce(retainedNonce));
    // The effect synchronizes the account page with external connection state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!offer) return;
    const remaining = offer.expiresAt - Date.now();
    if (remaining <= 0) {
      queueMicrotask(() => setOfferExpired(true));
      return;
    }
    const timer = window.setTimeout(() => setOfferExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [offer]);

  async function beginConnection() {
    if (!workspace || actionInFlight.current) return;
    actionInFlight.current = true; setBusy(true); setMessage("");
    try {
      if (pendingNonce) {
        await connectedRequest<{ csrfToken: string }>("bootstrap", { method: "POST", body: { nonce: pendingNonce } });
        sessionStorage.removeItem(pendingNonceKey); setPendingNonce(null);
        setStatus((current) => current ? { ...current, needsLocalConfirmation: false } : current);
      }
      const key = offerStorageKey(workspace);
      const existing = readOffer(sessionStorage.getItem(key));
      const retainedRequest = sessionStorage.getItem(offerRequestStorageKey(workspace));
      const requestId = existing?.requestId ?? (retainedRequest && requestPattern.test(retainedRequest) ? retainedRequest : `pair-${crypto.randomUUID()}`);
      sessionStorage.setItem(offerRequestStorageKey(workspace), requestId);
      const nextOffer = await connectedRequest<ConnectionOffer>("offer", { method: "POST", body: { requestId } });
      sessionStorage.setItem(key, JSON.stringify(nextOffer));
      setOffer(nextOffer); setOfferExpired(false);
      setMessage("Check the account and computer below, then confirm the connection.");
    } catch (error) { setMessage(failureMessage(error)); }
    finally { actionInFlight.current = false; setBusy(false); }
  }

  async function confirmConnection() {
    if (!workspace || !offer || actionInFlight.current) return;
    if (offer.expiresAt <= Date.now()) {
      setOfferExpired(true);
      setMessage("This connection offer expired. Start a new connection request to continue.");
      return;
    }
    actionInFlight.current = true; setBusy(true); setMessage("");
    try {
      const connected = await connectedRequest<{ connected: true; installationId: string }>("confirm", { method: "POST", body: offer });
      sessionStorage.removeItem(offerStorageKey(workspace)); sessionStorage.removeItem(offerRequestStorageKey(workspace)); setOffer(null);
      setOfferExpired(false);
      setStatus((current) => current
        ? { ...current, connected: true, installationId: connected.installationId, label: offer.label, needsLocalConfirmation: false }
        : { available: true, connected: true, installationId: connected.installationId, label: offer.label, needsLocalConfirmation: false });
      setMessage("This computer is connected. You can prepare a website from your account.");
    } catch (error) { setMessage(`${failureMessage(error)} The same connection request is retained for retry.`); }
    finally { actionInFlight.current = false; setBusy(false); }
  }

  async function disconnect() {
    if (!workspace || !status?.installationId || actionInFlight.current) return;
    actionInFlight.current = true; setBusy(true); setMessage("");
    try {
      await connectedRequest("disconnect", { method: "POST", body: { installationId: status.installationId } });
      setStatus((current) => current ? { ...current, connected: false, needsLocalConfirmation: false } : current);
      setMessage("This account is disconnected from the computer. Website files remain on the computer, and this verified setup tab can reconnect them.");
    } catch (error) { setMessage(failureMessage(error)); }
    finally { actionInFlight.current = false; setBusy(false); }
  }

  function clearExpiredOffer() {
    if (!workspace || !offer || offer.expiresAt > Date.now()) return;
    try {
      sessionStorage.removeItem(offerStorageKey(workspace));
      sessionStorage.removeItem(offerRequestStorageKey(workspace));
      setOffer(null); setOfferExpired(false);
      setMessage("The expired offer was cleared. Start a new connection request when you are ready.");
    } catch { setMessage("The expired offer could not be cleared from session storage."); }
  }

  return <div className={styles.setupGrid}>
    {message && <p className={styles.notice} role="status">{message}</p>}
    {busy && !status && <p role="status">Checking this computer…</p>}
    {!workspace && !busy && <section className={styles.connectionCard}>
      <span className={styles.stepIndex}>Account</span><h2>Sign in to continue</h2>
      <p>The computer connection can only be confirmed after Stellar verifies your account.</p>
      <a className={styles.primary} href="/auth/sign-in">Sign in to Stellar</a>
    </section>}
    {workspace && status && !status.available && <section className={styles.connectionCard}>
      <span className={styles.stepIndex}>Computer</span><h2>Start Stellar on this computer</h2>
      <p>The local connection service is not available at this address. Start the Stellar launcher and open the exact setup link it prints.</p>
      <code className={styles.command}>npm run dev:connected</code>
    </section>}
    {workspace && status?.available && status.connected && <section className={styles.connectionCard}>
      <span className={`${styles.connectionState} ${styles.connectionReady}`}>Connected</span>
      <h2>{status.label ?? "This computer"}</h2>
      <dl className={styles.connectionFacts}>
        <div><dt>Account</dt><dd>{accountLabel}</dd></div>
        {status.installationId && <div><dt>Installation</dt><dd title={status.installationId}>{shortInstallation(status.installationId)}</dd></div>}
      </dl>
      <p>Stellar will still check your current account and project access before every website action.</p>
      <div className={styles.formRow}>
        <Link className={styles.primary} href="/platform#new-website">Prepare a website</Link>
        <button className={styles.secondary} type="button" onClick={() => void disconnect()} disabled={busy}>Disconnect this computer</button>
      </div>
    </section>}
    {workspace && status?.available && !status.connected && <>
      <section className={styles.connectionCard}>
        <span className={styles.stepIndex}>1</span><h2>Confirm local control</h2>
        <p>{pendingNonce
          ? "The launcher setup link is ready in this tab. Nothing connects until you continue."
          : status.needsLocalConfirmation
            ? "Open the exact setup link printed by the Stellar launcher. A copied account URL cannot confirm control of this computer."
            : "This tab still has verified local control. Continue to reconnect this account to the computer."}</p>
        <dl className={styles.connectionFacts}>
          <div><dt>Signed-in account</dt><dd>{accountLabel}</dd></div>
          <div><dt>Local installation</dt><dd>{status.label ?? "This computer"}</dd></div>
        </dl>
        {!offer && <button className={styles.primary} type="button" onClick={() => void beginConnection()} disabled={busy || (!pendingNonce && status.needsLocalConfirmation)}>
          {busy ? "Checking…" : "Connect this computer"}
        </button>}
      </section>
      {offer && <section className={`${styles.connectionCard} ${styles.confirmCard}`}>
        <span className={styles.stepIndex}>2</span><h2>Connect these two</h2>
        <dl className={styles.connectionFacts}>
          <div><dt>Account</dt><dd>{accountLabel}</dd></div>
          <div><dt>Computer</dt><dd>{offer.label}</dd></div>
          <div><dt>Offer expires</dt><dd>{offerExpires}</dd></div>
        </dl>
        <p>Confirm only if this is the account and computer you intend to use. Confirming replaces any other active connection between this account and this computer; for an organization account, that can be another member&apos;s connection. Existing local websites are not attached by name.</p>
        <div className={styles.formRow}>
          {!offerExpired
            ? <><button className={styles.primary} type="button" onClick={() => void confirmConnection()} disabled={busy}>Confirm connection</button>
              <button className={styles.secondary} type="button" onClick={() => void beginConnection()} disabled={busy}>Retry offer</button></>
            : <button className={styles.primary} type="button" onClick={clearExpiredOffer} disabled={busy}>Start a new connection request</button>}
        </div>
      </section>}
    </>}
    <p className={styles.muted}>If sign-in expires, <a href="/auth/sign-in">sign in again</a>, then return to this tab. Your pending connection request remains scoped to this account.</p>
    <p><Link href="/platform">← Return to your websites</Link></p>
  </div>;
}
