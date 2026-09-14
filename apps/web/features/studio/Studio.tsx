"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeReceipt, ElementSourceTarget, Page, RegisteredWorkspace, Session, SourceModel } from "@stellar/contracts";
import { PROTOCOL_VERSION } from "@stellar/contracts";
import { Inspector } from "../inspector/Inspector";
import { HistoryControls } from "../history/HistoryControls";
import { acceptFrameMessage, isFrameHello, previewOrigin } from "./bridge";
import { closeSession, getProject, getSession, listPages, openSession, restartSession, sourceModel, StudioApiError } from "./api";
import styles from "./studio.module.css";

type Mode = "inspect" | "interact";
type ScaleMode = "fit" | "actual";
type Frame = { id: string; route: string };
type Selected = { target: ElementSourceTarget; occurrenceId: string; geometry: { x: number; y: number; width: number; height: number }; computedStyles?: Partial<Record<"color" | "background-color" | "padding-inline" | "padding-block" | "gap" | "border-radius", string>> };
const PRESETS = [390, 768, 1440];
const WIDTH_MIN = 320;
const WIDTH_MAX = 1920;
const preferred = (key: string, fallback: string) => typeof window === "undefined" ? fallback : window.sessionStorage.getItem(key) ?? fallback;
const errorText = (cause: unknown) => cause instanceof StudioApiError && cause.code === "UNAUTHORIZED"
  ? "Connect to the local workspace before opening this project."
  : cause instanceof Error ? cause.message : "The local workspace is unavailable.";

export function Studio({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<RegisteredWorkspace | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState<string | null>(null);
  const [model, setModel] = useState<SourceModel | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [previewRevision, setPreviewRevision] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(() => preferred(`stellar.mode.${projectId}`, "inspect") === "interact" ? "interact" : "inspect");
  const [width, setWidth] = useState(() => {
    const candidate = Number(preferred(`stellar.width.${projectId}`, "1440"));
    return Number.isInteger(candidate) && candidate >= WIDTH_MIN && candidate <= WIDTH_MAX ? candidate : 1440;
  });
  const [widthInput, setWidthInput] = useState(() => String(Number(preferred(`stellar.width.${projectId}`, "1440")) || 1440));
  const [scaleMode, setScaleMode] = useState<ScaleMode>(() => preferred(`stellar.scale.${projectId}`, "fit") === "actual" ? "actual" : "fit");
  const [availableWidth, setAvailableWidth] = useState(900);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const [modelRefreshCount, setModelRefreshCount] = useState(0);
  const [historyBlocked, setHistoryBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef(0);
  const selectionRequestRef = useRef(0);
  const guardRef = useRef<(() => Promise<boolean>) | null>(null);
  const selectedRef = useRef<Selected | null>(null);
  const skipGuardOccurrenceRef = useRef<string | null>(null);
  const initializedFrameIdRef = useRef<string | null>(null);
  const pendingRemapRef = useRef<{ projectId: string; pageId: string; anchor: string } | null>(null);
  const historyBlockedRef = useRef(false);
  const activeScopeRef = useRef("");
  const frameOrigin = session?.previewUrl ? previewOrigin(session.previewUrl) : null;
  const page = pages.find((item) => item.id === pageId) ?? null;
  const ready = previewRevision === session?.sourceRevision && model?.projectRevision === session?.sourceRevision &&
    model?.sessionId === session?.id && model?.pageId === pageId;
  const activeScope = `${projectId}|${session?.id ?? ""}|${session?.previewGeneration ?? ""}|${session?.sourceRevision ?? ""}|${pageId ?? ""}|${frame?.id ?? ""}`;
  const scale = scaleMode === "fit" ? Math.min(1, Math.max(1, availableWidth - 40) / width) : 1;
  const frameHeight = 850;

  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useLayoutEffect(() => { activeScopeRef.current = activeScope; }, [activeScope]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (historyBlockedRef.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  const registerGuard = useCallback((guard: (() => Promise<boolean>) | null) => { guardRef.current = guard; }, []);
  const registerHistoryBlocked = useCallback((blocked: boolean) => { historyBlockedRef.current = blocked; setHistoryBlocked(blocked); }, []);
  useEffect(() => { window.sessionStorage.setItem(`stellar.width.${projectId}`, String(width)); }, [projectId, width]);
  useEffect(() => { window.sessionStorage.setItem(`stellar.mode.${projectId}`, mode); }, [projectId, mode]);
  useEffect(() => { window.sessionStorage.setItem(`stellar.scale.${projectId}`, scaleMode); }, [projectId, scaleMode]);

  useEffect(() => {
    const run = ++runRef.current;
    let active = true;
    void (async () => {
      try {
        const project = await getProject(projectId);
        if (!active || run !== runRef.current) return;
        setWorkspace(project);
        const opened = await openSession(projectId);
        if (!active || run !== runRef.current) return;
        setSession(opened);
        const projectPages = await listPages(projectId, opened.id);
        if (!active || run !== runRef.current) return;
        setPages(projectPages);
        const savedPage = preferred(`stellar.page.${projectId}`, "");
        setPageId(projectPages.some((candidate) => candidate.id === savedPage) ? savedPage : projectPages[0]?.id ?? null);
      } catch (cause) { if (active && run === runRef.current) setError(errorText(cause)); }
    })();
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    let polling = false;
    const expectedId = session.id;
    const expectedGeneration = session.previewGeneration;
    const poll = async () => {
      if (polling || !active) return;
      polling = true;
      try {
        const latest = await getSession(projectId, expectedId);
        if (!active || latest.id !== expectedId || latest.previewGeneration !== expectedGeneration) return;
        setSession((current) => current?.id === expectedId && current.previewGeneration === expectedGeneration &&
          (current.state !== latest.state || current.sourceRevision !== latest.sourceRevision || current.previewUrl !== latest.previewUrl)
          ? latest : current);
      } catch (cause) {
        if (active && cause instanceof StudioApiError && cause.code !== "NOT_READY") setError(errorText(cause));
      } finally { polling = false; }
    };
    const interval = window.setInterval(() => { void poll(); }, session.state === "starting" ? 700 : 2500);
    return () => { active = false; window.clearInterval(interval); };
  }, [projectId, session]);

  useEffect(() => {
    ++selectionRequestRef.current;
    queueMicrotask(() => { setSelected(null); setDiagnostic(null); setModel(null); setFrame(null); setPreviewRevision(null); });
    if (!session || session.state !== "ready" || !pageId) return;
    let active = true;
    void sourceModel(projectId, session.id, pageId).then((fresh) => {
      if (active && fresh.sessionId === session.id && fresh.pageId === pageId && fresh.projectRevision === session.sourceRevision) setModel(fresh);
    }).catch((cause: unknown) => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [projectId, pageId, session, modelRefreshCount]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setAvailableWidth(element.clientWidth));
    observer.observe(element);
    setAvailableWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const invalidate = useCallback(() => {
    ++selectionRequestRef.current;
    selectedRef.current = null;
    setSelected(null); setPreviewRevision(null); setFrame(null); setDiagnostic(null);
    initializedFrameIdRef.current = null;
  }, []);
  const acceptNavigation = useCallback(async () => !historyBlockedRef.current && (!guardRef.current || await guardRef.current()), []);
  const goPage = useCallback(async (nextPageId: string): Promise<boolean> => {
    if (nextPageId === pageId) return true;
    if (!pages.some((item) => item.id === nextPageId) || !await acceptNavigation()) return false;
    invalidate();
    window.sessionStorage.setItem(`stellar.page.${projectId}`, nextPageId);
    setPageId(nextPageId);
    setPagesOpen(false);
    return true;
  }, [acceptNavigation, invalidate, pageId, pages, projectId]);

  const leaveStudio = useCallback(async () => {
    if (await acceptNavigation()) router.push("/projects");
  }, [acceptNavigation, router]);

  useEffect(() => {
    if (!session || !page || !frameOrigin) return;
    const handle = (event: MessageEvent) => {
      const route = isFrameHello(event, frameOrigin, iframeRef.current?.contentWindow ?? null);
      if (route !== null) {
        const matchingPage = pages.find((item) => item.route === route);
        if (!matchingPage) { setDiagnostic("This page is not registered for source inspection."); invalidate(); return; }
        if (matchingPage.id !== page.id) {
          void goPage(matchingPage.id).then((allowed) => { if (!allowed) setRefreshCount((count) => count + 1); });
          return;
        }
        setFrame({ id: `frame-${crypto.randomUUID()}`, route });
        setPreviewRevision(null);
        setSelected(null);
        return;
      }
      if (!frame || !model) return;
      const accepted = acceptFrameMessage(event, {
        origin: frameOrigin, frameWindow: iframeRef.current?.contentWindow ?? null,
        projectId, sessionId: session.id, previewGeneration: session.previewGeneration,
        frameId: frame.id, pageId: page.id, sourceRevision: session.sourceRevision, route: page.route, model,
      });
      if (!accepted) return;
      const { envelope, target } = accepted;
      if (envelope.type === "ready") { setPreviewRevision(envelope.sourceRevision); setDiagnostic(null); return; }
      if (envelope.type === "clear") { ++selectionRequestRef.current; selectedRef.current = null; setSelected(null); return; }
      if (envelope.type === "diagnostic") {
        ++selectionRequestRef.current; selectedRef.current = null; setSelected(null); setDiagnostic(envelope.payload.message); return;
      }
      if (envelope.type === "geometry") {
        setSelected((current) => current?.occurrenceId === envelope.payload.occurrenceId ? { ...current, geometry: envelope.payload.geometry } : current);
        return;
      }
      if (envelope.type === "selection" && target && mode === "inspect") {
        const request = ++selectionRequestRef.current;
        const selectionScope = activeScope;
        const occurrenceId = envelope.payload.occurrenceId;
        const skip = skipGuardOccurrenceRef.current === occurrenceId;
        skipGuardOccurrenceRef.current = null;
        void (async () => {
          if (!skip && selectedRef.current?.occurrenceId !== occurrenceId && !await acceptNavigation()) {
            if (selectedRef.current) {
              skipGuardOccurrenceRef.current = selectedRef.current.occurrenceId;
              iframeRef.current?.contentWindow?.postMessage({
                protocolVersion: PROTOCOL_VERSION, projectId, sessionId: session.id,
                previewGeneration: session.previewGeneration, frameId: frame.id,
                pageId: page.id, sourceRevision: session.sourceRevision,
                type: "stellar:select", occurrenceId: selectedRef.current.occurrenceId,
              }, frameOrigin);
            }
            return;
          }
          if (request !== selectionRequestRef.current || selectionScope !== activeScopeRef.current) return;
          const next: Selected = { target, occurrenceId, geometry: envelope.payload.geometry,
            computedStyles: "computedStyles" in envelope.payload ? envelope.payload.computedStyles as Selected["computedStyles"] : undefined };
          selectedRef.current = next;
          setSelected(next);
          setDiagnostic(null);
          setInspectorOpen(true);
        })();
      }
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, [acceptNavigation, activeScope, frame, frameOrigin, goPage, invalidate, mode, model, page, pages, projectId, session]);

  useEffect(() => {
    if (!frame || !frameOrigin || !model || !session || !page || !iframeRef.current?.contentWindow ||
      frame.route !== page.route || model.projectRevision !== session.sourceRevision) return;
    if (initializedFrameIdRef.current === frame.id) return;
    initializedFrameIdRef.current = frame.id;
    iframeRef.current.contentWindow.postMessage({
      type: "stellar:init", protocolVersion: PROTOCOL_VERSION, projectId, sessionId: session.id,
      previewGeneration: session.previewGeneration, frameId: frame.id, pageId: page.id,
      sourceRevision: session.sourceRevision, route: page.route, mode,
      targets: model.targets.filter((item): item is ElementSourceTarget => item.kind === "element")
        .map((target) => ({ anchor: target.anchor, sourceKey: target.targetId })),
    }, frameOrigin);
  }, [frame, frameOrigin, model, mode, page, projectId, session]);

  const postFrame = useCallback((payload: Record<string, unknown>) => {
    if (!frame || !frameOrigin || !session || !page || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({
      protocolVersion: PROTOCOL_VERSION, projectId, sessionId: session.id,
      previewGeneration: session.previewGeneration, frameId: frame.id,
      pageId: page.id, sourceRevision: session.sourceRevision, ...payload,
    }, frameOrigin);
  }, [frame, frameOrigin, page, projectId, session]);

  useEffect(() => { postFrame({ type: "stellar:mode", mode }); }, [mode, postFrame]);

  useEffect(() => {
    const pending = pendingRemapRef.current;
    if (!pending || !model || !ready || !frame || pending.projectId !== projectId || pending.pageId !== pageId) return;
    const matches = model.targets.filter((item): item is ElementSourceTarget => item.kind === "element" && item.anchor === pending.anchor);
    pendingRemapRef.current = null;
    if (matches.length === 1) {
      skipGuardOccurrenceRef.current = `${pending.anchor}:1`;
      postFrame({ type: "stellar:select", occurrenceId: `${pending.anchor}:1` });
    }
  }, [frame, model, pageId, postFrame, projectId, ready]);

  const chooseMode = async (next: Mode) => {
    if (next === mode || !await acceptNavigation()) return;
    setMode(next);
    if (next === "interact") setInspectorOpen(false);
  };
  const chooseWidth = (next: number) => {
    if (!Number.isInteger(next) || next < WIDTH_MIN || next > WIDTH_MAX) return;
    setWidth(next); setWidthInput(String(next));
  };
  const chooseTarget = async (target: ElementSourceTarget) => {
    if (!await acceptNavigation()) return;
    const occurrenceId = `${target.anchor}:1`;
    skipGuardOccurrenceRef.current = occurrenceId;
    postFrame({ type: "stellar:select", occurrenceId });
  };
  const refreshPreview = async () => {
    if (!await acceptNavigation()) return;
    invalidate();
    setRefreshCount((count) => count + 1);
  };
  const refreshAfterReceipt = useCallback((receipt: ChangeReceipt) => {
    if (receipt.projectId !== projectId || !session) return;
    if (selectedRef.current && pageId) pendingRemapRef.current = { projectId, pageId, anchor: selectedRef.current.target.anchor };
    invalidate();
    setRefreshCount((current) => current + 1);
    void getSession(projectId, session.id).then((latest) => {
      // A reconciled save may belong to a previous, now-expired session. Only
      // the current authenticated session establishes fresh source authority.
      if (latest.id === session.id) {
        setSession((current) => current?.id === latest.id &&
          (current.sourceRevision !== latest.sourceRevision || current.state !== latest.state || current.previewGeneration !== latest.previewGeneration)
          ? latest : current);
        setModelRefreshCount((count) => count + 1);
      }
    }).catch((cause: unknown) => setError(errorText(cause)));
  }, [invalidate, pageId, projectId, session]);
  const refreshSource = useCallback(() => {
    if (!session) return;
    invalidate();
    void getSession(projectId, session.id).then((latest) => {
      if (latest.id !== session.id) return;
      setSession(latest);
      setModelRefreshCount((count) => count + 1);
      setRefreshCount((count) => count + 1);
    }).catch((cause: unknown) => setError(errorText(cause)));
  }, [invalidate, projectId, session]);
  const beforeHistoryMutation = useCallback(async () => {
    if (!await acceptNavigation()) return false;
    ++selectionRequestRef.current;
    selectedRef.current = null;
    setSelected(null);
    postFrame({ type: "stellar:clear" });
    return true;
  }, [acceptNavigation, postFrame]);
  const retry = async () => {
    if (!await acceptNavigation()) return;
    setError(null); invalidate();
    const run = ++runRef.current;
    try {
      const next = session ? await restartSession(projectId, session.id) : await openSession(projectId);
      if (run !== runRef.current) return;
      setSession(next);
      if (!pages.length) {
        const loaded = await listPages(projectId, next.id);
        if (run === runRef.current) { setPages(loaded); setPageId(loaded[0]?.id ?? null); }
      }
    } catch (cause) { if (run === runRef.current) setError(errorText(cause)); }
  };
  const stop = async () => {
    if (!session || !await acceptNavigation()) return;
    invalidate();
    const run = ++runRef.current;
    try { const closed = await closeSession(projectId, session.id); if (run === runRef.current) setSession(closed); }
    catch (cause) { if (run === runRef.current) setError(errorText(cause)); }
  };
  const previewUrl = session?.state === "ready" && session.previewUrl && page ? new URL(page.route, session.previewUrl).href : null;

  return <main className={styles.studio}>
    <header className={styles.studioHeader}>
      <div className={styles.headerIdentity}><Link href="/projects" onClick={(event) => { event.preventDefault(); void leaveStudio(); }} className={styles.brand} aria-label="Back to projects">Stellar<span aria-hidden="true">✳</span></Link><span className={styles.headerDivider} /><div className={styles.projectIdentity}><span className={styles.headerEyebrow}>Working copy / Design</span><strong>{workspace?.project.name ?? "Opening project…"}</strong></div></div>
      <div className={styles.headerActions}><span className={`${styles.connection} ${session?.state === "ready" ? styles.connectionReady : ""}`}><span className={styles.statusDot} />{session?.state ?? "connecting"}</span><button type="button" onClick={() => setPagesOpen((current) => !current)} className={styles.mobilePanelButton} aria-expanded={pagesOpen}>Pages</button><button type="button" onClick={() => setInspectorOpen((current) => !current)} className={styles.mobilePanelButton} aria-expanded={inspectorOpen}>Inspect</button><Link href="/projects" onClick={(event) => { event.preventDefault(); void leaveStudio(); }} className={styles.allProjects}>All projects ↗</Link></div>
    </header>
    <div className={styles.studioBody}>
      <aside className={`${styles.pagesPanel} ${pagesOpen ? styles.panelOpen : ""}`} aria-label="Project pages">
        <div className={styles.panelTitle}><span className={styles.eyebrow}>Project explorer</span><button type="button" className={styles.mobileClose} onClick={() => setPagesOpen(false)} aria-label="Close pages">×</button></div>
        <h2>Pages <span>{pages.length.toString().padStart(2, "0")}</span></h2>
        <nav aria-label="Pages" className={styles.pageList}>{pages.map((item, index) => <button key={item.id} type="button" className={`${styles.pageItem} ${item.id === pageId ? styles.pageItemActive : ""}`} aria-current={item.id === pageId ? "page" : undefined} onClick={() => { void goPage(item.id); }}><span className={styles.pageIcon}>◫</span><span className={styles.pageName}>{item.label}<small>{item.route}</small></span><span className={styles.pageIndex}>0{index + 1}</span></button>)}</nav>
        <div className={styles.targetSection}><span className={styles.eyebrow}>On this page</span><p>Source targets</p><div className={styles.targetList}>{model?.targets.filter((item): item is ElementSourceTarget => item.kind === "element").map((target) => <button type="button" key={target.targetId} className={`${styles.targetItem} ${selected?.target.targetId === target.targetId ? styles.targetItemActive : ""}`} onClick={() => { void chooseTarget(target); }} disabled={!ready || mode !== "inspect"}><span className={styles.targetIcon}>{target.editable ? "◇" : "⊘"}</span><span>{target.anchor}</span></button>) ?? <span className={styles.targetLoading}>Select a page to see targets.</span>}</div></div>
        <div className={styles.panelFootnote}>Only mapped source targets can be edited. Shared component instances remain read-only.</div>
      </aside>
      <section className={styles.canvasColumn} aria-label="Website canvas">
        <div className={styles.toolbar}>
          <div className={styles.toolbarGroup}><span className={styles.eyebrow}>Viewport</span><div className={styles.segmented}>{PRESETS.map((preset) => <button key={preset} type="button" aria-pressed={width === preset} className={width === preset ? styles.activeSegment : ""} onClick={() => chooseWidth(preset)}>{preset === 390 ? "Mobile" : preset === 768 ? "Tablet" : "Desktop"}<small>{preset}</small></button>)}</div><label className={styles.widthField}><span className={styles.visuallyHidden}>Custom viewport width in pixels</span><input type="number" min={WIDTH_MIN} max={WIDTH_MAX} step="1" value={widthInput} onChange={(event) => setWidthInput(event.target.value)} onBlur={() => { const parsed = Number(widthInput); if (Number.isInteger(parsed) && parsed >= WIDTH_MIN && parsed <= WIDTH_MAX) chooseWidth(parsed); else setWidthInput(String(width)); }} onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); } }} /> px</label></div>
          <div className={styles.toolbarGroup}><span className={styles.eyebrow}>View</span><div className={styles.segmented}><button type="button" aria-pressed={scaleMode === "fit"} className={scaleMode === "fit" ? styles.activeSegment : ""} onClick={() => setScaleMode("fit")}>Fit</button><button type="button" aria-pressed={scaleMode === "actual"} className={scaleMode === "actual" ? styles.activeSegment : ""} onClick={() => setScaleMode("actual")}>100%</button></div></div>
          <div className={styles.toolbarGroup}><span className={styles.eyebrow}>Mode</span><div className={styles.segmented}><button type="button" aria-pressed={mode === "inspect"} className={mode === "inspect" ? styles.activeSegment : ""} onClick={() => { void chooseMode("inspect"); }}>Inspect</button><button type="button" aria-pressed={mode === "interact"} className={mode === "interact" ? styles.activeSegment : ""} onClick={() => { void chooseMode("interact"); }}>Interact</button></div></div>
          {session && <div className={styles.historySlot}><HistoryControls projectId={projectId} sessionId={session.id} sourceRevision={session.sourceRevision} previewGeneration={session.previewGeneration} sessionReady={session.state === "ready"} onMutationStart={beforeHistoryMutation} onOperationStateChange={registerHistoryBlocked} onReceipt={refreshAfterReceipt} /></div>}
        </div>
        <div className={styles.canvasMeta}><div><span className={styles.eyebrow}>Live preview</span><strong>{page?.label ?? "Page"}</strong><span className={styles.canvasRoute}>{page?.route ?? "/"}</span></div><div className={styles.metaRight}><span>{width} CSS px</span><span>{Math.round(scale * 100)}% scale</span><span className={ready ? styles.previewFresh : styles.previewWaiting}>{ready ? "Preview current" : "Waiting for preview"}</span>{previewUrl && <button type="button" className={styles.refreshPreview} onClick={() => { void refreshPreview(); }}>Refresh preview</button>}</div></div>
        <div className={styles.canvasArea} ref={canvasRef}>
          {previewUrl ? <div className={styles.previewSpace} style={{ width: width * scale, minHeight: frameHeight * scale + 34 }}><div className={styles.browserFrame} style={{ width, transform: `scale(${scale})` }}><div className={styles.browserChrome}><span className={styles.browserDots}><i /><i /><i /></span><span className={styles.browserAddress}>{new URL(previewUrl).host}{page?.route}</span><span className={styles.browserWidth}>{width} px</span></div><iframe key={`${session?.id}-${session?.previewGeneration}-${pageId}-${session?.sourceRevision}-${refreshCount}`} ref={iframeRef} src={previewUrl} title={`${page?.label} website preview`} width={width} height={frameHeight} style={{ pointerEvents: historyBlocked ? "none" : "auto" }} onLoad={() => { invalidate(); if (frameOrigin) window.setTimeout(() => { iframeRef.current?.contentWindow?.postMessage({ type: "stellar:hello-request" }, frameOrigin); }, 0); }} /></div></div>
            : <div className={styles.canvasState} role="status"><span className={styles.canvasStateGlyph}>✳</span><h2>{session?.state === "failed" ? "Preview needs attention" : session?.state === "stopped" ? "Preview is stopped" : "Opening your site"}</h2><p>{error ?? session?.statusMessage ?? "Preparing a live view of the working copy."}</p>{session?.state === "failed" || session?.state === "stopped" || error ? <button type="button" onClick={() => { void retry(); }}>Retry preview</button> : null}</div>}
        </div>
        <div className={styles.canvasStatus}><span>{mode === "inspect" ? "Inspect mode · click a marked source target or choose one from the list" : "Interact mode · links and forms work normally"}</span><span>Revision {session?.sourceRevision?.slice(0, 14) ?? "—"}</span></div>
      </section>
      <aside className={`${styles.inspectorPanel} ${inspectorOpen ? styles.panelOpen : ""}`} aria-label="Style inspector"><div className={styles.inspectorHeading}><span className={styles.eyebrow}>Contextual inspector</span><button type="button" className={styles.mobileClose} onClick={() => setInspectorOpen(false)} aria-label="Close inspector">×</button></div>{diagnostic && <p className={styles.diagnostic} role="status">{diagnostic}</p>}
        {session && pageId ? <Inspector projectId={projectId} sessionId={session.id} pageId={pageId} sourceRevision={session.sourceRevision} previewGeneration={session.previewGeneration} model={session.state === "ready" ? model : null} selectedTarget={session.state === "ready" ? selected?.target ?? null : null} viewportWidth={width} previewRevision={previewRevision} computedStyles={selected?.computedStyles} externallyBlocked={historyBlocked} onRequestMobileViewport={() => chooseWidth(390)} onRequestRefresh={refreshSource} onNavigationGuardChange={registerGuard} onReceipt={refreshAfterReceipt} /> : <div className={styles.inspectorEmpty}><span>◇</span><h2>Nothing selected</h2><p>Open a preview to inspect its source and style options.</p></div>}
      </aside>
    </div>
    {error && previewUrl && <div className={styles.errorToast} role="alert"><span>{error}</span><button type="button" onClick={() => { setError(null); void retry(); }}>Retry</button></div>}
    {session?.state === "ready" && <button type="button" className={styles.stopButton} onClick={() => { void stop(); }}>Stop preview</button>}
  </main>;
}
