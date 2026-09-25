"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  PROTOCOL_VERSION, ProjectNameSchema,
  type BlueprintCatalogEntry, type RegisteredWorkspace,
} from "@stellar/contracts";
import { createProject, listBlueprints, listProjects, requestId, StudioApiError } from "./api";
import { startTiming, finishTiming, moveTiming } from "./timing";
import styles from "./projects.module.css";

type PendingCreate = { requestId: string; name: string; blueprintId: string; blueprintVersion: string };
type CreationIssue = { message: string; uncertain: boolean };
const PENDING_CREATE_KEY = "stellar.pending-project-create";

function loadMessage(cause: unknown): string {
  if (cause instanceof StudioApiError && cause.code === "UNAUTHORIZED")
    return "Connect to your local workspace before opening or creating projects.";
  if (cause instanceof StudioApiError && cause.code === "RUNNER_UNAVAILABLE")
    return "The local runner is offline. Restart the local workspace, then try again.";
  return cause instanceof Error ? cause.message : "The local workspace is unavailable.";
}

function creationMessage(cause: unknown): CreationIssue {
  if (!(cause instanceof StudioApiError)) return {
    message: "Stellar could not confirm the result. Retry to check the same creation request safely.", uncertain: true,
  };
  if (cause.code === "UNAUTHORIZED") return {
    message: "Your local connection expired. Reconnect, then retry this same creation request.", uncertain: false,
  };
  if (cause.code === "IDEMPOTENCY_CONFLICT") return {
    message: "This request no longer matches its saved name or template. Check the saved websites below and reopen the original website.", uncertain: false,
  };
  if (cause.code === "INVALID_REQUEST" || cause.code === "INVALID_VALUE")
    return { message: cause.message || "Check the project name and try again.", uncertain: false };
  if (["UNCERTAIN_RESULT", "INVALID_RESPONSE", "HTTP_ERROR", "RUNNER_UNAVAILABLE"].includes(cause.code))
    return { message: cause.message, uncertain: true };
  return { message: cause.message, uncertain: false };
}

function readPendingCreate(): PendingCreate | null {
  try {
    const saved = window.sessionStorage.getItem(PENDING_CREATE_KEY);
    if (!saved) return null;
    const value = JSON.parse(saved) as Partial<PendingCreate>;
    return typeof value.requestId === "string" && typeof value.name === "string" &&
      typeof value.blueprintId === "string" && typeof value.blueprintVersion === "string"
      ? value as PendingCreate : null;
  } catch { return null; }
}

function identity(workspace: RegisteredWorkspace) {
  const { blueprint, designSystem } = workspace.project;
  return `${blueprint.id} v${blueprint.version} · ${designSystem.id} v${designSystem.version}`;
}

export function ProjectList() {
  const router = useRouter();
  const createInFlight = useRef(false);
  const pendingRestored = useRef(false);
  const [projects, setProjects] = useState<RegisteredWorkspace[] | null>(null);
  const [blueprints, setBlueprints] = useState<BlueprintCatalogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState("");
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [creationIssue, setCreationIssue] = useState<CreationIssue | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listProjects(controller.signal), listBlueprints(controller.signal)])
      .then(([nextProjects, nextBlueprints]) => {
        setProjects(nextProjects);
        setBlueprints(nextBlueprints);
        if (!pendingRestored.current) {
          pendingRestored.current = true;
          const saved = readPendingCreate();
          if (saved) {
            setPendingCreate(saved);
            setName(saved.name);
            setBlueprintId(saved.blueprintId);
            setCreationIssue({
              message: "A previous creation request needs confirmation. Retry to recover its result without making a duplicate.",
              uncertain: true,
            });
          } else setBlueprintId(nextBlueprints[0]?.blueprint.id ?? null);
        } else setBlueprintId((current) => current ?? nextBlueprints[0]?.blueprint.id ?? null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadMessage(cause));
      });
    return () => controller.abort();
  }, [attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createInFlight.current) return;
    const parsedName = ProjectNameSchema.safeParse(name.trim());
    if (!parsedName.success) {
      setCreationIssue({ message: "Enter a project name between 1 and 80 characters.", uncertain: false });
      return;
    }
    const blueprint = blueprints?.find((entry) => entry.blueprint.id === blueprintId);
    if (!blueprint) {
      setCreationIssue({ message: "Choose an available reviewed blueprint.", uncertain: false });
      return;
    }
    const sameIntent = pendingCreate?.name === parsedName.data && pendingCreate.blueprintId === blueprint.blueprint.id &&
      pendingCreate.blueprintVersion === blueprint.blueprint.version;
    const request = sameIntent ? pendingCreate : {
      requestId: requestId(), name: parsedName.data,
      blueprintId: blueprint.blueprint.id, blueprintVersion: blueprint.blueprint.version,
    };
    setPendingCreate(request);
    try { window.sessionStorage.setItem(PENDING_CREATE_KEY, JSON.stringify(request)); }
    catch {
      setCreationIssue({ message: "Allow browser session storage, then retry. No creation request was sent.", uncertain: false });
      return;
    }
    setCreationIssue(null);
    createInFlight.current = true;
    setCreating(true);
    try {
      startTiming("creation");
      startTiming("allocation");
      const result = await createProject({ protocolVersion: PROTOCOL_VERSION, ...request });
      finishTiming("allocation", sameIntent ? "creation-recovery-ack" : "creation-ack");
      moveTiming("creation", `${sameIntent ? "recovery" : "create"}:${result.workspace.project.id}`);
      try { window.sessionStorage.removeItem(PENDING_CREATE_KEY); } catch { /* A retained receipt safely replays. */ }
      router.push(`/projects/${encodeURIComponent(result.workspace.project.id)}/studio`);
    } catch (cause) {
      setCreationIssue(creationMessage(cause));
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  }

  function updateName(value: string) {
    if (pendingCreate) return;
    setName(value);
    setCreationIssue(null);

  }

  const connected = !error && projects !== null && blueprints !== null;
  const loadedBlueprints = blueprints ?? [];

  return <main className={styles.page}>
    <header className={styles.header}>
      <span className={styles.brand}>Stellar<span aria-hidden="true">✳</span></span>
      <span className={`${styles.modeBadge} ${error ? styles.modeBadgeError : connected ? "" : styles.modeBadgePending}`} role="status">
        <span className={styles.statusDot} /> {error ? "Connection needed" : connected ? "Computer connected" : "Connecting…"}
      </span>
    </header>

    <section className={styles.intro}>
      <p className={styles.eyebrow}>On this computer</p>
      <h1>Your websites</h1>
      <p>Create an independent site from a reviewed blueprint, or reopen a working copy with its source and history intact.</p>
    </section>

    {error ? <section className={styles.loadError} role="alert">
      <div><span className={styles.issueIndex}>Connection</span><strong>Workspace unavailable</strong><p>{error}</p></div>
      <div className={styles.errorActions}>
        <button type="button" onClick={() => { setError(null); setProjects(null); setBlueprints(null); setAttempt((value) => value + 1); }}>Try again</button>
        <Link href="/connect">Connect workspace</Link>
      </div>
    </section> : <>
      <section className={styles.createSection} aria-labelledby="create-heading">
        <div className={styles.createHeading}>
          <div><p className={styles.eyebrow}>New website</p><h2 id="create-heading">Start from a reviewed template</h2></div>
          <span>{blueprints === null ? "Loading catalog…" : `${blueprints.length} available`}</span>
        </div>
        <form className={styles.createForm} onSubmit={submit}>
          <div className={styles.nameColumn}>
            <label htmlFor="project-name">Project name</label>
            <input id="project-name" name="name" value={name} maxLength={80} autoComplete="off" disabled={creating || (!!pendingCreate)}
              placeholder="e.g. Northstar campaign" onChange={(event) => updateName(event.target.value)} />
            <p>Choose a clear display name. Your new project will be an independent working copy.</p>
            <button type="submit" disabled={creating || loadedBlueprints.length === 0}>
              {creating ? "Preparing website…" : pendingCreate ? "Retry creation" : "Create project"}<span aria-hidden="true">→</span>
            </button>
            {creationIssue ? <div className={`${styles.creationIssue} ${creationIssue.uncertain ? styles.uncertainIssue : ""}`} role="alert">
              <strong>{creationIssue.uncertain ? "Result needs confirmation" : "Project not created"}</strong>
              <p>{creationIssue.message}</p>
              {pendingCreate ? <small>Retry checks the original request, so it will not create a duplicate.</small> : null}
            </div> : null}
          </div>

          <fieldset className={styles.catalog}>
            <legend className={styles.visuallyHidden}>Reviewed blueprint</legend>
            {blueprints === null ? <div className={styles.blueprintLoading}>Loading the reviewed catalog…</div>
              : loadedBlueprints.length === 0 ? <div className={styles.blueprintLoading}>No compatible blueprints are registered in this workspace.</div>
                : loadedBlueprints.map((entry) => <label className={styles.blueprintCard} key={`${entry.blueprint.id}:${entry.blueprint.version}`}>
                  <input type="radio" name="blueprint" value={entry.blueprint.id} checked={blueprintId === entry.blueprint.id} disabled={creating || (!!pendingCreate)}
                    onChange={() => {
                      setBlueprintId(entry.blueprint.id);
                      setCreationIssue(null);

                    }} />
                  <span className={styles.blueprintVisual} aria-hidden="true"><i /><i /><b>f<span>.</span></b></span>
                  <span className={styles.blueprintCopy}>
                    <span className={styles.blueprintTitle}><strong>{entry.name}</strong><small>Reviewed</small></span>
                    <span className={styles.blueprintDescription}>{entry.description}</span>
                    <span className={styles.blueprintIdentity}>
                      <span>Blueprint <b>{entry.blueprint.id}</b> v{entry.blueprint.version}</span>
                      <span>Renderer <b>{entry.renderer.toUpperCase()}</b></span>
                      <span>Design system <b>{entry.designSystem.id}</b> v{entry.designSystem.version}</span>
                      <span><b>{entry.pageCount}</b> {entry.pageCount === 1 ? "page" : "pages"}</span>
                    </span>
                    <span className={styles.capabilities}>
                      {entry.capabilities.styleEdits ? <em>Style edits</em> : null}
                      {entry.capabilities.tokenEdits ? <em>Token edits</em> : null}
                    </span>
                  </span>
                </label>)}
          </fieldset>
        </form>
      </section>

      <section className={styles.projectSection} aria-labelledby="project-heading">
        <div className={styles.sectionHeading}><h2 id="project-heading">Your websites on this computer</h2><span>{projects?.length ?? "—"} available</span></div>
        {projects === null ? <div className={styles.projectEmpty} role="status">Loading registered projects…</div>
          : projects.length === 0 ? <div className={styles.projectEmpty}><strong>No working copies yet</strong><p>Name a project above to create the first independent copy.</p></div>
            : <div className={styles.projectGrid}>{projects.map((workspace, index) => <Link className={styles.projectCard} href={`/projects/${encodeURIComponent(workspace.project.id)}/studio`} key={workspace.id}>
              <span className={styles.cardTop}><span className={styles.cardNumber}>{String(index + 1).padStart(2, "0")} / SITE</span><span aria-hidden="true">↗</span></span>
              <span className={styles.cardArtwork} aria-hidden="true"><span className={styles.artRingOne} /><span className={styles.artRingTwo} /><span className={styles.artLetter}>f<span>.</span></span></span>
              <span className={styles.cardBottom}>
                <span><strong>{workspace.project.name}</strong><small>{workspace.label} · {workspace.project.pageCount} pages · {workspace.project.renderer.toUpperCase()}</small><small className={styles.cardIdentity}>{identity(workspace)}</small></span>
                <span className={styles.cardArrow} aria-hidden="true">→</span>
              </span>
            </Link>)}</div>}
      </section>
    </>}

    <footer className={styles.footer}><span>Stellar / local editor preview</span><span>Each working copy keeps independent source and history</span></footer>
  </main>;
}
