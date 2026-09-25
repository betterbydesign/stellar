"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Workspace } from "../../lib/platform/http";
import { failureMessage } from "./client";
import { connectedRequest } from "./connected-client";
import { moveTiming, startTiming } from "../studio/timing";
import styles from "./platform.module.css";

type Blueprint = {
  blueprint: { id: string; version: string };
  name: string;
  description: string;
  renderer: string;
  pageCount: number;
};
type BlueprintEnvelope = { blueprints: Blueprint[] };
type WebsiteResult = { projectId: string; name: string; sourceState: "ready"; registryProjectId: string };
type PreparationIntent = {
  requestId: string;
  name: string;
  blueprintId: string;
  blueprintVersion: string;
  projectId?: string;
};

function storageKey(workspace: Workspace, existingProjectId?: string) {
  return `stellar.connected.website:${encodeURIComponent(workspace.actor.subject)}:${encodeURIComponent(workspace.tenant._id)}:${encodeURIComponent(existingProjectId ?? "new")}`;
}
function parseIntent(raw: string | null): PreparationIntent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (typeof value.requestId !== "string" || typeof value.name !== "string" || typeof value.blueprintId !== "string" || typeof value.blueprintVersion !== "string") return null;
    if (value.projectId !== undefined && typeof value.projectId !== "string") return null;
    return value as PreparationIntent;
  } catch { return null; }
}

export function WebsiteSetup({ workspace, existingProject }: {
  workspace: Workspace;
  existingProject?: { projectId: string; name: string; requestId?: string; blueprintId?: string; blueprintVersion?: string };
}) {
  const inFlight = useRef(false);
  const router = useRouter();
  const serverIntent = useMemo(() => existingProject?.requestId && existingProject.blueprintId && existingProject.blueprintVersion ? {
    requestId: existingProject.requestId, name: existingProject.name,
    blueprintId: existingProject.blueprintId, blueprintVersion: existingProject.blueprintVersion,
    projectId: existingProject.projectId,
  } : null, [existingProject]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [name, setName] = useState(existingProject?.name ?? "");
  const [blueprintKey, setBlueprintKey] = useState(serverIntent ? `${serverIntent.blueprintId}@${serverIntent.blueprintVersion}` : "");
  const [intent, setIntent] = useState<PreparationIntent | null>(serverIntent);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const key = storageKey(workspace, existingProject?.projectId);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const pending = parseIntent(sessionStorage.getItem(key));
        if (pending) { setIntent(pending); setName(pending.name); setBlueprintKey(`${pending.blueprintId}@${pending.blueprintVersion}`); }
        else if (serverIntent) sessionStorage.setItem(key, JSON.stringify(serverIntent));
      } catch { setMessage("Allow session storage so interrupted website preparation can recover safely."); }
    });
    void connectedRequest<BlueprintEnvelope>("blueprints").then((result) => {
      setBlueprints(result.blueprints);
      setBlueprintKey((current) => current || (result.blueprints[0] ? `${result.blueprints[0].blueprint.id}@${result.blueprints[0].blueprint.version}` : ""));
    }).catch((error) => setMessage(failureMessage(error))).finally(() => setBusy(false));
  }, [key, serverIntent]);

  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const blueprint = blueprints.find((item) => `${item.blueprint.id}@${item.blueprint.version}` === blueprintKey);
    if (!blueprint && !intent) { setMessage("Choose an available reviewed template."); return; }
    const pending = intent ?? {
      requestId: `website-${crypto.randomUUID()}`,
      name: name.trim(),
      blueprintId: blueprint!.blueprint.id,
      blueprintVersion: blueprint!.blueprint.version,
      ...(existingProject ? { projectId: existingProject.projectId } : {}),
    };
    try { sessionStorage.setItem(key, JSON.stringify(pending)); }
    catch { setMessage("Allow session storage so this request can be retried without creating another website."); return; }
    setIntent(pending); setBusy(true); setMessage(""); inFlight.current = true;
    try {
      const timingKey = intent ? "recovery" : "create";
      startTiming(timingKey);
      const result = await connectedRequest<WebsiteResult>("websites", { method: "POST", body: pending });
      moveTiming(timingKey, `${timingKey}:${result.registryProjectId}`);
      sessionStorage.removeItem(key);
      router.push(`/platform/projects/${encodeURIComponent(result.projectId)}/studio`);
    } catch (error) { setMessage(`${failureMessage(error)} The same preparation request is retained for retry.`); }
    finally { inFlight.current = false; setBusy(false); }
  }

  return <form className={styles.form} onSubmit={(event) => void prepare(event)}>
    <div className={styles.formHeading}>
      <div><p className={styles.eyebrow}>{existingProject ? "Finish setup" : "New website"}</p>
        <h2>{existingProject ? `Prepare ${existingProject.name}` : "Start with reviewed source"}</h2></div>
      {intent && <span className={styles.badge}>Recovery ready</span>}
    </div>
    <label htmlFor={`website-name-${existingProject?.projectId ?? "new"}`}>Website name</label>
    <input id={`website-name-${existingProject?.projectId ?? "new"}`} value={intent?.name ?? name} onChange={(event) => setName(event.target.value)} disabled={Boolean(existingProject) || Boolean(intent) || busy} required maxLength={80} />
    <label htmlFor={`website-blueprint-${existingProject?.projectId ?? "new"}`}>Reviewed template</label>
    <select id={`website-blueprint-${existingProject?.projectId ?? "new"}`} value={blueprintKey} onChange={(event) => setBlueprintKey(event.target.value)} disabled={Boolean(intent) || busy || !blueprints.length}>
      {blueprints.map((item) => <option key={`${item.blueprint.id}@${item.blueprint.version}`} value={`${item.blueprint.id}@${item.blueprint.version}`}>{item.name} · {item.pageCount} pages</option>)}
    </select>
    {blueprints.find((item) => `${item.blueprint.id}@${item.blueprint.version}` === blueprintKey) && <p className={styles.muted}>{blueprints.find((item) => `${item.blueprint.id}@${item.blueprint.version}` === blueprintKey)!.description}</p>}
    <button className={styles.primary} type="submit" disabled={busy || !name.trim() || (!intent && !blueprintKey)}>
      {busy ? "Preparing website…" : intent ? "Retry website preparation" : existingProject ? "Finish website setup" : "Prepare website"}
    </button>
    {intent && <p className={styles.muted}>The name and template are locked while this request is unresolved. Retrying resumes the same source allocation.</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
  </form>;
}
