"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  PROTOCOL_VERSION, SUPPORTED_PROPERTIES,
  type ApplyChange, type ChangeReceipt, type Command, type ElementSourceTarget,
  type PrepareChange, type SourceModel, type StyleControl, type TokenDefinition,
} from "@stellar/contracts";
import { applyEdit, EditApiError, lookupEdit, newRequestId, prepareEdit } from "./edit-client";
import { LocalEditForm, TokenEditForm } from "./EditForms";
import { hasPendingEdit, initialEditState, receiptPreviewStatus, transitionEdit, type EditAction, type EditDraft, type EditState } from "./edit-state";
import { canRetryPendingApply, parsePendingApply, pendingApplyAgeExpired, pendingApplyKey, type PendingApplyMarker } from "./pending-apply";
import { formatValue, isLocalCommandAllowed, isTokenCommandAllowed, propertyLabel, readOnlyExplanation } from "./values";
import styles from "./Inspector.module.css";

type SupportedProperty = (typeof SUPPORTED_PROPERTIES)[number];
type EditorChoice = { kind: "local"; property: SupportedProperty } | { kind: "token"; targetId: string } | null;

export type InspectorProps = {
  projectId: string;
  sessionId: string;
  pageId: string;
  sourceRevision: string;
  previewGeneration: string;
  model: SourceModel | null;
  selectedTarget: ElementSourceTarget | null;
  viewportWidth: number;
  previewRevision?: string | null;
  externallyBlocked?: boolean;
  computedStyles?: Partial<Record<SupportedProperty, string>>;
  onReceipt: (receipt: ChangeReceipt) => void;
  onRequestMobileViewport?: () => void;
  onRequestRefresh?: () => void;
  onNavigationGuardChange?: (guard: (() => Promise<boolean>) | null) => void;
};

function isTokenTarget(value: SourceModel["targets"][number]): value is TokenDefinition {
  return value.kind === "token-definition";
}

function scopeKey(projectId: string, sessionId: string, pageId: string,
  targetId: string | undefined, revision: string, scope: "base" | "mobile"): string {
  return [projectId, sessionId, pageId, targetId ?? "none", revision, scope].join("|");
}

function apiError(error: unknown): EditApiError {
  if (error instanceof EditApiError) return error;
  return new EditApiError({ code: "RUNNER_UNAVAILABLE", httpStatus: 503, recoverable: true,
    message: "The local runner is unavailable." }, true);
}

function removePendingMarker(key: string) {
  try { window.sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
}

export function Inspector(props: InspectorProps) {
  const {
    projectId, sessionId, pageId, sourceRevision, previewGeneration, model,
    selectedTarget, viewportWidth, previewRevision, computedStyles, externallyBlocked, onReceipt,
    onRequestMobileViewport, onRequestRefresh, onNavigationGuardChange,
  } = props;
  const [scope, setScope] = useState<"base" | "mobile">("base");
  const [choice, setChoice] = useState<EditorChoice>(null);
  const [state, setState] = useState<EditState>(initialEditState);
  const stateRef = useRef(state);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkedPending, setCheckedPending] = useState(false);
  const [recovered, setRecovered] = useState<{ key: string; marker: PendingApplyMarker } | null>(null);
  const [recoveredScope, setRecoveredScope] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(true);
  const [recoverNotice, setRecoverNotice] = useState<string | null>(null);
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false);
  const [recoveredMissing, setRecoveredMissing] = useState(false);
  const [recoveredBusyState, setRecoveredBusyState] = useState(false);
  const dialogResolver = useRef<((allowed: boolean) => void) | null>(null);
  const dialogKeepButton = useRef<HTMLButtonElement>(null);
  const dialogElement = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const busy = useRef(false);
  const recoveredBusy = useRef(false);
  const recoveredRef = useRef<{ key: string; marker: PendingApplyMarker } | null>(null);
  const recoveringRef = useRef(true);
  const recoveryUnavailableRef = useRef(false);
  const recoveredScopeRef = useRef<string | null>(null);
  const projectIdRef = useRef(projectId);
  const pendingMarkerKeyRef = useRef<string | null>(null);
  const onReceiptRef = useRef(onReceipt);
  useEffect(() => { onReceiptRef.current = onReceipt; }, [onReceipt]);

  const contextKey = scopeKey(projectId, sessionId, pageId, selectedTarget?.targetId, sourceRevision, scope);
  const contextRef = useRef(contextKey);
  useEffect(() => { contextRef.current = contextKey; }, [contextKey]);
  const sourceCurrent = model?.projectId === projectId && model.sessionId === sessionId &&
    model.pageId === pageId && model.projectRevision === sourceRevision &&
    selectedTarget?.revision === sourceRevision && selectedTarget.pageId === pageId &&
    model.targets.some((target) => target.kind === "element" && target.targetId === selectedTarget.targetId &&
      target.anchor === selectedTarget.anchor && target.pageId === selectedTarget.pageId);
  const draftStale = !!state.draft && state.draft.contextKey !== contextKey;
  const blocked = !!externallyBlocked || ["preparing", "saving", "reconciling", "uncertain"].includes(state.phase);
  const recoveryBlocked = recovering || recovered !== null || recoveryUnavailable || recoveredScope !== projectId;
  useEffect(() => { recoveredRef.current = recovered; }, [recovered]);
  useEffect(() => { recoveringRef.current = recovering; }, [recovering]);
  useEffect(() => { recoveryUnavailableRef.current = recoveryUnavailable; }, [recoveryUnavailable]);
  useEffect(() => { recoveredScopeRef.current = recoveredScope; }, [recoveredScope]);
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);
  const linkedTokens = selectedTarget && model
    ? model.targets.filter(isTokenTarget).filter((target) => selectedTarget.linkedTokenTargetIds.includes(target.targetId))
    : [];
  const controls = selectedTarget?.controls.filter((control) => control.scopeId === scope) ?? [];
  const activeControl = choice?.kind === "local" ? controls.find((control) => control.property === choice.property) : undefined;
  const activeToken = choice?.kind === "token" ? linkedTokens.find((target) => target.targetId === choice.targetId) : undefined;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const operatorResponse = await fetch("/api/operator/session", { credentials: "same-origin", cache: "no-store" });
        if (!operatorResponse.ok) throw new Error("Operator session unavailable");
        const operator: unknown = await operatorResponse.json();
        const csrf = typeof operator === "object" && operator !== null && "csrfToken" in operator &&
          typeof operator.csrfToken === "string" ? operator.csrfToken : null;
        if (!csrf) throw new Error("Operator session unavailable");
        window.sessionStorage.setItem("stellar.csrf", csrf);
        const key = await pendingApplyKey(csrf, projectId);
        if (!active) return;
        pendingMarkerKeyRef.current = key;
        const raw = window.sessionStorage.getItem(key);
        const marker = parsePendingApply(raw, projectId);
        if (raw && !marker) removePendingMarker(key);
        setRecovered(marker ? { key, marker } : null);
        setRecoveredScope(projectId);
        setRecoveryUnavailable(false);
        setRecoveredMissing(false);
      } catch {
        if (active) {
          setRecoveryUnavailable(true);
          setRecoverNotice("Pending save recovery is unavailable. Reload before editing source.");
        }
      } finally { if (active) setRecovering(false); }
    })();
    return () => { active = false; pendingMarkerKeyRef.current = null; };
  }, [projectId]);

  async function checkRecovered() {
    const pending = recovered;
    if (!pending || recoveredBusy.current) return;
    recoveredBusy.current = true;
    setRecoveredBusyState(true);
    setRecoverNotice("Checking the previous save…");
    try {
      const result = await lookupEdit(projectId, sessionId, pending.marker.request.requestId);
      if (result.status === "applied") {
        if (result.operation !== "apply") throw new Error("Unexpected request outcome");
        send({ type: "recovered-receipt", projectId, requestId: pending.marker.request.requestId,
          receipt: result.receipt, anchor: pending.marker.anchor });
        removePendingMarker(pending.key);
        setRecovered(null);
        setRecoveredMissing(false);
        setRecoverNotice("Previous source save confirmed.");
        onReceiptRef.current(result.receipt);
      } else if (result.status === "unchanged" || result.status === "conflicted") {
        removePendingMarker(pending.key);
        setRecovered(null);
        setRecoveredMissing(false);
        setRecoverNotice(result.status === "conflicted"
          ? "Previous save conflicted with newer source. Review the current source."
          : "The previous request made no source change.");
      } else {
        setRecoveredMissing(false);
        setRecoverNotice("The previous save is still pending. Check again before editing.");
      }
    } catch (error) {
      const failure = apiError(error);
      const absent = failure.detail.code === "UNKNOWN_TARGET";
      setRecoveredMissing(absent);
      setRecoverNotice(absent
        ? "No saved result was found. You may retry only the original request if the source and session still match."
        : "The previous save could not be confirmed. Check again before editing.");
    } finally { recoveredBusy.current = false; setRecoveredBusyState(false); }
  }

  async function retryRecovered() {
    const pending = recovered;
    if (!pending || !recoveredMissing || recoveredBusy.current || externallyBlocked || pendingApplyAgeExpired(pending.marker) ||
      !canRetryPendingApply(pending.marker, { projectId, sessionId, pageId, sourceRevision, model })) return;
    recoveredBusy.current = true;
    setRecoveredBusyState(true);
    setRecoveredMissing(false);
    setRecoverNotice("Retrying the original source request…");
    try {
      const result = await applyEdit(pending.marker.request);
      if (result.status === "applied") {
        send({ type: "recovered-receipt", projectId, requestId: pending.marker.request.requestId,
          receipt: result.receipt, anchor: pending.marker.anchor });
        removePendingMarker(pending.key);
        setRecovered(null);
        setRecoverNotice("Previous source save confirmed.");
        onReceiptRef.current(result.receipt);
      } else {
        removePendingMarker(pending.key);
        setRecovered(null);
        setRecoverNotice("The previous request made no source change.");
      }
    } catch (error) {
      const failure = apiError(error);
      if (!failure.uncertain && failure.detail.code !== "STALE_REVISION") {
        removePendingMarker(pending.key);
        setRecovered(null);
      }
      setRecoverNotice(failure.uncertain
        ? "The previous save is still uncertain. Check its outcome again."
        : failure.detail.message);
    } finally { recoveredBusy.current = false; setRecoveredBusyState(false); }
  }

  function send(action: EditAction): EditState {
    const next = transitionEdit(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    return next;
  }

  function makeDraft(command: Command | null, validationError: string | null,
    description: string, targetId: string, kind: "local" | "token", tokenName?: string) {
    if (!selectedTarget || !sourceCurrent || blocked || recoveryBlocked) return;
    send({ type: "draft", draft: { contextKey, projectId, sessionId, pageId,
      anchor: selectedTarget.anchor, targetId, expectedRevision: sourceRevision,
      command, validationError, description, kind, tokenName } });
    setCheckedPending(false);
  }

  async function prepare(): Promise<"ready" | "unchanged" | "failed"> {
    const before = stateRef.current;
    const draft = before.draft;
    if (busy.current || externallyBlocked || recoveryBlocked || !draft?.command || draft.validationError || !sourceCurrent ||
      draft.contextKey !== contextRef.current ||
      !["draft", "failed"].includes(before.phase)) return "failed";
    busy.current = true;
    const requestId = newRequestId();
    const version = before.version;
    send({ type: "prepare-start", requestId, version });
    try {
      const request: PrepareChange = { protocolVersion: PROTOCOL_VERSION,
        projectId: draft.projectId, sessionId: draft.sessionId, requestId,
        expectedRevision: draft.expectedRevision, targetId: draft.targetId, command: draft.command };
      const result = await prepareEdit(request);
      if (draft.contextKey !== contextRef.current) {
        send({ type: "context-changed", contextKey: contextRef.current, revision: sourceRevision });
        return "failed";
      }
      const next = send({ type: "prepare-result", requestId, version, result });
      return next.phase === "ready-to-apply" ? "ready" : next.phase === "idle" ? "unchanged" : "failed";
    } catch (error) {
      const failure = apiError(error);
      send({ type: "prepare-error", requestId, version, error: failure.detail });
      return "failed";
    } finally { busy.current = false; }
  }

  async function apply(retry = false): Promise<boolean> {
    const before = stateRef.current;
    const draft = before.draft;
    const proposal = before.proposal;
    const allowedPhase = before.phase === "ready-to-apply" ||
      (retry && before.phase === "uncertain" && checkedPending);
    if (busy.current || externallyBlocked || recoveryBlocked || !draft || !proposal || !allowedPhase ||
      draft.contextKey !== contextRef.current || draft.sessionId !== sessionId ||
      draft.expectedRevision !== sourceRevision || !sourceCurrent) return false;
    busy.current = true;
    setCheckedPending(false);
    const requestId = before.applyRequestId ?? newRequestId();
    const version = before.version;
    const request: ApplyChange = { protocolVersion: PROTOCOL_VERSION,
      projectId: draft.projectId, sessionId: draft.sessionId, requestId,
      proposalId: proposal.proposalId, expectedRevision: proposal.baseRevision };
    let markerKey: string;
    try {
      const key = pendingMarkerKeyRef.current;
      if (!key) throw new Error("Missing operator scope");
      markerKey = key;
      if (stateRef.current.version !== version || draft.contextKey !== contextRef.current ||
        !sourceCurrent || sessionId !== request.sessionId || sourceRevision !== request.expectedRevision) {
        busy.current = false;
        return false;
      }
      const marker: PendingApplyMarker = { version: 1, createdAt: new Date().getTime(), request,
        pageId: draft.pageId, targetId: draft.targetId, anchor: draft.anchor, kind: draft.kind };
      window.sessionStorage.setItem(markerKey, JSON.stringify(marker));
    } catch {
      busy.current = false;
      setRecoveryUnavailable(true);
      setRecoverNotice("Pending save recovery is unavailable. Reload before editing source.");
      return false;
    }
    send({ type: "apply-start", requestId, version });
    try {
      const result = await applyEdit(request);
      removePendingMarker(markerKey);
      const next = send({ type: "apply-result", requestId, version, result });
      if (result.status === "applied" && next.receipt?.receiptId === result.receipt.receiptId) {
        onReceiptRef.current(result.receipt);
        return true;
      }
      return next.phase === "idle";
    } catch (error) {
      const failure = apiError(error);
      if (!failure.uncertain) removePendingMarker(markerKey);
      send({ type: "apply-error", requestId, version, error: failure.detail, uncertain: failure.uncertain });
      return false;
    } finally { busy.current = false; }
  }

  async function reconcile(): Promise<boolean> {
    const before = stateRef.current;
    if (busy.current || before.phase !== "uncertain" || !before.applyRequestId ||
      !before.draft || before.draft.projectId !== projectId) return false;
    busy.current = true;
    const version = before.version;
    send({ type: "reconcile-start", version });
    try {
      const result = await lookupEdit(projectId, sessionId, before.applyRequestId);
      if (result.status === "applied" || result.status === "unchanged" || result.status === "conflicted") {
        if (pendingMarkerKeyRef.current) removePendingMarker(pendingMarkerKeyRef.current);
      }
      const next = send({ type: "reconcile-result", version, result });
      setCheckedPending(result.status === "pending");
      if (result.status === "applied" && next.receipt?.receiptId === result.receipt.receiptId) {
        onReceiptRef.current(result.receipt);
        return true;
      }
      return next.phase === "idle";
    } catch (error) {
      const failure = apiError(error);
      send({ type: "reconcile-error", version, error: failure.detail });
      setCheckedPending(failure.detail.code === "UNKNOWN_TARGET");
      return false;
    } finally { busy.current = false; }
  }

  async function guardNavigation(): Promise<boolean> {
    if (!hasPendingEdit(stateRef.current) && !recoveringRef.current && !recoveredRef.current && !recoveryUnavailableRef.current && recoveredScopeRef.current === projectIdRef.current) return true;
    if (recoveringRef.current || recoveredRef.current || recoveryUnavailableRef.current || recoveredScopeRef.current !== projectIdRef.current) return false;
    if (dialogResolver.current) return false;
    return new Promise<boolean>((resolve) => {
      dialogResolver.current = resolve;
      setDialogOpen(true);
    });
  }
  const guardRef = useRef(guardNavigation);
  useEffect(() => { guardRef.current = guardNavigation; });
  useEffect(() => {
    if (!onNavigationGuardChange) return;
    const registered = () => guardRef.current();
    onNavigationGuardChange(registered);
    return () => onNavigationGuardChange(null);
  }, [onNavigationGuardChange]);
  useEffect(() => {
    return () => {
      dialogResolver.current?.(false);
      dialogResolver.current = null;
    };
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingEdit(stateRef.current) && !recoveringRef.current && !recoveredRef.current && !recoveryUnavailableRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  useEffect(() => {
    if (dialogOpen) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialogKeepButton.current?.focus();
    }
  }, [dialogOpen]);

  function closeDialog(allowed: boolean) {
    setDialogOpen(false);
    dialogResolver.current?.(allowed);
    dialogResolver.current = null;
    const target = previousFocus.current;
    window.requestAnimationFrame(() => target?.focus());
  }
  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); closeDialog(false); return; }
    if (event.key !== "Tab") return;
    const focusables = Array.from(dialogElement.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const first = focusables[0];
    const last = focusables.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  async function dialogApply() {
    const phase = stateRef.current.phase;
    if (phase === "ready-to-apply") {
      if (await apply()) closeDialog(true);
    } else if (phase === "uncertain") {
      if (await reconcile()) closeDialog(true);
    } else if (phase === "draft" || phase === "failed") {
      const outcome = await prepare();
      if (outcome === "unchanged") closeDialog(true);
    }
  }
  async function switchWithGuard(action: () => void) {
    if (await guardNavigation()) action();
  }

  function reviewCurrentSource() {
    const previous = stateRef.current.draft;
    if (externallyBlocked || recoveryBlocked || !previous?.command || !selectedTarget || !sourceCurrent || !model ||
      previous.projectId !== projectId || previous.pageId !== pageId || previous.anchor !== selectedTarget.anchor) return;
    let nextTargetId: string | null = null;
    const command = previous.command;
    if (previous.kind === "local" && command.type !== "token.set") {
      const matching = selectedTarget.controls.find((item) => item.property === command.property && item.scopeId === command.scopeId);
      if (matching && command.scopeId === scope && selectedTarget.editable && isLocalCommandAllowed(matching, command))
        nextTargetId = selectedTarget.targetId;
    } else if (previous.kind === "token" && previous.tokenName) {
      const matching = linkedTokens.find((item) => item.tokenName === previous.tokenName);
      if (matching && isTokenCommandAllowed(matching, command)) {
        nextTargetId = matching.targetId;
        setChoice({ kind: "token", targetId: matching.targetId });
      }
    }
    if (!nextTargetId) return;
    const updated: EditDraft = { ...previous, contextKey, sessionId, targetId: nextTargetId,
      expectedRevision: sourceRevision, validationError: null };
    send({ type: "draft", draft: updated });
  }

  const canEdit = !!selectedTarget?.editable && !!sourceCurrent && !recoveryBlocked;
  const canReview = !!state.draft?.command && !state.draft.validationError &&
    !draftStale && canEdit && ["draft", "failed"].includes(state.phase);
  const canApply = state.phase === "ready-to-apply" && !draftStale && canEdit && !blocked;
  const busyForForm = blocked || !canEdit;
  const receipt = state.receipt?.projectId === projectId ? state.receipt : null;

  return <aside className={styles.inspector} aria-label="Style inspector">
    <div className={styles.header}>
      <p className={styles.eyebrow}>Style inspector</p>
      <h2>{selectedTarget?.anchor ?? "Select an element"}</h2>
      {selectedTarget && <p className={styles.meta}>{selectedTarget.source.file} · {pageId}</p>}
      <p className={styles.meta}>Viewport {viewportWidth}px</p>
      <details className={styles.sourceDetails}>
        <summary>Source details</summary>
        <p className={styles.meta}>Revision {sourceRevision}</p>
        <p className={styles.meta}>Preview generation {previewGeneration}</p>
      </details>
    </div>

    {recovering && <p className={styles.warning} role="status">Checking for a previous source save before editing…</p>}
    {recoverNotice && <p className={styles.warning} role="status">{recoverNotice}</p>}
    {recovered && <section className={styles.section} aria-label="Previous source save">
      <h3>Previous save needs a result check</h3>
      <p className={styles.meta}>Target {recovered.marker.anchor} · original request {recovered.marker.request.requestId}</p>
      <p className={styles.hint}>Source editing is paused until the runner confirms this request&apos;s outcome.</p>
      {pendingApplyAgeExpired(recovered.marker) && <p className={styles.warning}>This request is older than eight hours. Check its outcome; do not retry automatically.</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.primaryButton} disabled={recoveredBusyState}
          onClick={() => void checkRecovered()}>Check previous save</button>
        {recoveredMissing && <button type="button" className={styles.secondaryButton}
          disabled={recoveredBusyState || !!externallyBlocked || pendingApplyAgeExpired(recovered.marker) || !canRetryPendingApply(recovered.marker,
            { projectId, sessionId, pageId, sourceRevision, model })}
          onClick={() => void retryRecovered()}>Retry original save request</button>}
      </div>
    </section>}

    {!selectedTarget ? <p className={styles.empty}>Select a source-linked element in the canvas to inspect its supported styles.</p> : <>
      {externallyBlocked && <p className={styles.warning} role="status">A history change is being resolved. Style editing is paused until its outcome is known.</p>}
      {!sourceCurrent && <p className={styles.warning} role="status">The source model is refreshing. Editing is paused until the current revision arrives.</p>}
      {!selectedTarget.editable && <p className={styles.warning}>{readOnlyExplanation(selectedTarget.readOnlyReason)}</p>}

      <section className={styles.section} aria-label="Editing scope">
        <h3>Editing scope</h3>
        <div className={styles.segmented} role="group" aria-label="Source rule scope">
          <button type="button" aria-pressed={scope === "base"} onClick={() => void switchWithGuard(() => { setScope("base"); setChoice(null); })}>Base</button>
          <button type="button" aria-pressed={scope === "mobile"} onClick={() => void switchWithGuard(() => { setScope("mobile"); setChoice(null); })}>Mobile ≤767px</button>
        </div>
        <p className={styles.hint}>Changing viewport width does not change where a source edit is written.</p>
        {scope === "mobile" && viewportWidth > 767 && <div className={styles.warning}>
          This mobile rule is inactive at the current preview width.
          {onRequestMobileViewport && <button type="button" className={styles.textButton} onClick={onRequestMobileViewport}>View mobile width</button>}
        </div>}
      </section>

      <section className={styles.section} aria-label="Local styles">
        <h3>Local styles</h3>
        {controls.length === 0 ? <p className={styles.hint}>No supported controls in this source scope.</p> : <div className={styles.controlList}>
          {controls.map((control) => <button key={`${control.property}-${control.scopeId}`} type="button"
            className={styles.controlButton} aria-pressed={choice?.kind === "local" && choice.property === control.property}
            onClick={() => void switchWithGuard(() => setChoice({ kind: "local", property: control.property }))}>
            <span>{propertyLabel[control.property]}</span><strong>{formatValue(control.authoredValue ?? control.resolvedValue)}</strong>
          </button>)}
        </div>}
        {activeControl && <div className={styles.detail}>
          <h4>{propertyLabel[activeControl.property]} · {scope}</h4>
          <SourceProvenance control={activeControl} computed={computedStyles?.[activeControl.property]} />
          <LocalEditForm key={`${contextKey}-${activeControl.property}`} control={activeControl} disabled={busyForForm}
            onChange={(command, error, description) => makeDraft(command, error, description,
              selectedTarget.targetId, "local")} />
          {activeControl.provenance === "override" && activeControl.authoredValue && <button type="button"
            className={styles.secondaryButton} disabled={busyForForm}
            onClick={() => makeDraft({ type: "style.reset", property: activeControl.property, scopeId: activeControl.scopeId },
              null, `Reset ${activeControl.property} · ${activeControl.scopeId}`, selectedTarget.targetId, "local")}>
            Reset owned override
          </button>}
        </div>}
      </section>

      <section className={styles.section} aria-label="Shared tokens">
        <h3>Shared tokens</h3>
        <p className={styles.hint}>A shared token edit changes its approved base definition across declared uses. It is separate from a local style.</p>
        {linkedTokens.length === 0 ? <p className={styles.hint}>No approved concrete token is linked to this element.</p> : <div className={styles.controlList}>
          {linkedTokens.map((target) => <button key={target.targetId} type="button" className={styles.controlButton}
            aria-pressed={choice?.kind === "token" && choice.targetId === target.targetId}
            onClick={() => void switchWithGuard(() => setChoice({ kind: "token", targetId: target.targetId }))}>
            <span>{target.tokenName}</span><strong>{formatValue(target.authoredValue)}</strong>
          </button>)}
        </div>}
        {activeToken && <div className={styles.detail}>
          <h4>Concrete base definition: {activeToken.tokenName}</h4>
          <p className={styles.meta}>Source: {activeToken.source.file} · {activeToken.source.selector}</p>
          <p className={styles.meta}>Semantic aliases: {activeToken.aliases.length
            ? activeToken.aliases.map((alias) => `${alias} → ${activeToken.tokenName}`).join(", ") : "None"}</p>
          {!activeToken.editable && <p className={styles.warning}>{readOnlyExplanation(activeToken.readOnlyReason)}</p>}
          <Impact target={activeToken} />
          <TokenEditForm key={`${contextKey}-${activeToken.targetId}`} target={activeToken}
            disabled={busyForForm || !activeToken.editable}
            onChange={(command, error, description) => makeDraft(command, error, description,
              activeToken.targetId, "token", activeToken.tokenName)} />
        </div>}
      </section>
    </>}

    {state.draft && <section className={styles.section} aria-label="Pending source change">
      <h3>Unsaved source change</h3>
      <p className={styles.meta}>{state.draft.description}</p>
      {state.draft.validationError && <p className={styles.error} role="alert">{state.draft.validationError}</p>}
      {draftStale && <p className={styles.warning} role="alert">This draft belongs to an earlier selection, scope or source revision. It cannot be applied as-is.</p>}
      {state.issue && <p className={styles.error} role="alert">{state.issue.message}</p>}
      {state.proposal && state.phase === "ready-to-apply" && !draftStale && <div className={styles.proposal}>
        <p><strong>Review before Apply</strong> · {state.proposal.sourcePatch.file}</p>
        <p className={styles.meta}>Declared impact: {state.proposal.impact.pageIds.join(", ")} · {state.proposal.impact.anchors.length} element(s)</p>
        <div className={styles.diff}><div><span>Before</span><pre>{state.proposal.sourcePatch.expectedOldText || "(new declaration)"}</pre></div>
          <div><span>After</span><pre>{state.proposal.sourcePatch.replacementText || "(override removed)"}</pre></div></div>
      </div>}
      {(state.phase === "conflict" || draftStale) && <div className={styles.actions}>
        {onRequestRefresh && <button type="button" className={styles.secondaryButton} onClick={onRequestRefresh}>Refresh source model</button>}
        <button type="button" className={styles.secondaryButton} disabled={!!externallyBlocked || !sourceCurrent || !selectedTarget || selectedTarget.anchor !== state.draft.anchor}
          onClick={reviewCurrentSource}>Review against current source</button>
      </div>}
      <div className={styles.actions}>
        {canReview && <button type="button" className={styles.primaryButton} disabled={blocked} onClick={() => void prepare()}>Review change</button>}
        {canApply && <button type="button" className={styles.primaryButton} onClick={() => void apply()}>Apply to source</button>}
        {state.phase === "uncertain" && <button type="button" className={styles.primaryButton} onClick={() => void reconcile()}>Check saved result</button>}
        {state.phase === "uncertain" && checkedPending && draftStale === false && state.draft.sessionId === sessionId &&
          <button type="button" className={styles.secondaryButton} disabled={!!externallyBlocked || !sourceCurrent}
            onClick={() => void apply(true)}>Retry same save request</button>}
        {!(["saving", "uncertain", "reconciling"].includes(state.phase)) &&
          <button type="button" className={styles.secondaryButton} onClick={() => send({ type: "discard" })}>Discard draft</button>}
      </div>
    </section>}
    {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
    {receipt && <section className={styles.section} aria-label="Durable save receipt">
      <h3>Recent source save</h3>
      <p className={styles.meta}>Target {state.receiptAnchor ?? receipt.targetId} · receipt {receipt.receiptId}</p>
      <p className={styles.meta}>{receipt.changedFile}</p>
      <p className={styles.meta}>Revision {receipt.oldRevision} → {receipt.newRevision}</p>
      <p className={styles.hint}>{receiptPreviewStatus(receipt, sourceRevision, previewRevision)}</p>
    </section>}

    {dialogOpen && <div className={styles.dialogBackdrop}>
      <div className={styles.dialog} ref={dialogElement} role="dialog" aria-modal="true" aria-labelledby="inspector-navigation-title"
        onKeyDown={onDialogKeyDown}>
        <h3 id="inspector-navigation-title">Finish this source change?</h3>
        <p>{state.phase === "uncertain" || state.phase === "reconciling"
          ? "The save may have reached the runner. Check its outcome before leaving."
          : "Apply the reviewed change, discard the draft, or keep editing this target."}</p>
        {state.proposal && <p className={styles.meta}>Patch: {state.proposal.sourcePatch.file} · {state.proposal.impact.pageIds.join(", ")}</p>}
        <div className={styles.actions}>
          <button type="button" ref={dialogKeepButton} className={styles.secondaryButton} onClick={() => closeDialog(false)}>Keep editing</button>
          {!(["saving", "uncertain", "reconciling"].includes(state.phase)) && <button type="button" className={styles.secondaryButton}
            onClick={() => { send({ type: "discard" }); closeDialog(true); }}>Discard</button>}
          <button type="button" className={styles.primaryButton} disabled={state.phase !== "uncertain" &&
            (blocked || draftStale || !!state.draft?.validationError ||
              state.phase === "conflict" || state.phase === "saving" || state.phase === "reconciling")}
            onClick={() => void dialogApply()}>{state.phase === "ready-to-apply" ? "Apply" : state.phase === "uncertain" ? "Check outcome" : "Review for Apply"}</button>
        </div>
      </div>
    </div>}
  </aside>;
}

function SourceProvenance({ control, computed }: { control: StyleControl; computed?: string }) {
  const authored = control.authoredValue;
  const fallbackValue = (control as StyleControl & { fallbackValue?: StyleControl["resolvedValue"] | null }).fallbackValue;
  const reference = authored ?? fallbackValue;
  return <dl className={styles.provenance}>
    <div><dt>Ownership</dt><dd>{control.provenance}</dd></div>
    <div><dt>Owned override</dt><dd>{formatValue(authored)}</dd></div>
    <div><dt>Authored fallback</dt><dd>{formatValue(fallbackValue ?? null)}</dd></div>
    <div><dt>Token reference</dt><dd>{reference?.kind === "token" ? reference.name : "None"}</dd></div>
    <div><dt>Source resolved</dt><dd>{formatValue(control.resolvedValue)}</dd></div>
    <div><dt>Browser computed</dt><dd>{computed ?? "Not reported by preview"}</dd></div>
    <div><dt>Fallback source</dt><dd>{control.fallback.file} · {control.fallback.selector}</dd></div>
    <div><dt>Override</dt><dd>{control.override.file} · {control.override.selector}</dd></div>
  </dl>;
}

function Impact({ target }: { target: TokenDefinition }) {
  return <div className={styles.impact}>
    <strong>Known declared impact</strong>
    <p>Routes: {target.impact.pageIds.join(", ")}</p>
    <p>Elements: {target.impact.anchors.join(", ")}</p>
    <small>This manifest lists known uses; it is not a complete global CSS analysis.</small>
  </div>;
}
