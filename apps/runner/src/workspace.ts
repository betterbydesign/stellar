import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  ApplyChangeSchema, ChangeProposalSchema, HistoryCommandSchema, IdentifierSchema, OpenSessionRequestSchema,
  PrepareChangeSchema, ProjectManifestSchema, PROTOCOL_VERSION, ReconcileRequestSchema, SourceModelSchema,
  validateApplyChange, validateHistoryCommand, makeError,
  type ApplyChange, type ApplyChangeResponse, type ChangeProposal, type ChangeReceipt,
  type ErrorCode, type ErrorEnvelope, type HistoryCommand, type HistoryEntry, type HistoryResponse, type SourcePatch,
  type PrepareChangeResponse,
  type RequestOutcome, type Session, type SourceModel,
} from "@stellar/contracts";
import { applySourcePatch, createInversePatch, createSourceModel, prepareSourceChange } from "@stellar/editor-core";
import { PreviewError, PreviewProcess } from "./preview.js";
import type { RegisteredProject } from "./registry.js";
import { digest, durableJson, durableReplace, newId, readJson, safeSourcePath, snapshotFingerprint, sourceSnapshot } from "./storage.js";

type Ledger = { version: 1; revision: string; fingerprint: string };
type PreparedOperation = {
  version: 1; kind: "prepare"; operatorId: string; sessionId: string; intentHash: string;
  requestId: string; status: "prepared" | "unchanged"; proposal: ChangeProposal | null;
};
type AppliedOperation = {
  version: 1; kind: "apply"; operatorId: string; sessionId: string; intentHash: string;
  requestId: string; status: "intent" | "applied" | "conflicted" | "unchanged" | "unapplied";
  proposal: ChangeProposal; receipt: ChangeReceipt | null;
  sequence: number;
  beforeBase64: string | null; afterBase64: string | null;
  beforeFingerprint: string | null; afterFingerprint: string | null;
  display?: HistoryEntry["display"];
};
type HistoryOperation = {
  version: 1; kind: "undo" | "redo"; operatorId: string; sessionId: string; intentHash: string;
  requestId: string; status: "intent" | "applied" | "conflicted" | "unapplied";
  sourceEntryId: string; patch: SourcePatch; receipt: ChangeReceipt;
  sequence: number;
  beforeBase64: string; afterBase64: string;
  beforeFingerprint: string; afterFingerprint: string;
};
type WrittenOperation = AppliedOperation | HistoryOperation;
type Operation = PreparedOperation | WrittenOperation;
const writtenPatch = (operation: WrittenOperation): SourcePatch => operation.kind === "apply" ? operation.proposal.sourcePatch : operation.patch;

function displayFor(proposal: ChangeProposal): NonNullable<HistoryEntry["display"]> {
  const patch = proposal.sourcePatch;
  const before = proposal.command.type === "style.reset"
    ? patch.expectedOldText.replace(/^.*?:\s*/, "").replace(/;\s*$/, "").trim()
    : patch.expectedOldText.trim() || "Inherited";
  const after = proposal.command.type === "style.reset" ? "Inherited" : patch.replacementText.trim();
  return { timestamp: new Date().toISOString(), before: before.slice(0, 160), after: after.slice(0, 160) };
}

const id = (value: unknown): value is string => IdentifierSchema.safeParse(value).success;
const scopeOf = (input: unknown): { projectId: string | undefined; sessionId: string | undefined; requestId: string | undefined } => {
  if (!input || typeof input !== "object") return { projectId: undefined, sessionId: undefined, requestId: undefined };
  const object = input as Record<string, unknown>;
  return { projectId: id(object.projectId) ? object.projectId : undefined,
    sessionId: id(object.sessionId) ? object.sessionId : undefined,
    requestId: id(object.requestId) ? object.requestId : undefined };
};
const error = (input: unknown, code: ErrorCode): ErrorEnvelope => {
  const scope = scopeOf(input);
  return makeError({ ...(scope.projectId ? { projectId: scope.projectId } : {}),
    ...(scope.sessionId ? { sessionId: scope.sessionId } : {}),
    ...(scope.requestId ? { requestId: scope.requestId } : {}) }, code);
};
const responseScope = (session: Session, requestId: string) => ({
  protocolVersion: PROTOCOL_VERSION, projectId: session.projectId, sessionId: session.id, requestId,
});

export class WorkspaceRuntime {
  private ledger!: Ledger;
  private session: Session | null = null;
  private preview: PreviewProcess | null = null;
  private generationCounter = 0;
  private nextSequence = 0;
  private watcher: NodeJS.Timeout | null = null;
  private startEpoch = 0;
  private mutex: Promise<unknown> = Promise.resolve();

  constructor(readonly project: RegisteredProject, readonly seed: string, readonly data: string,
    readonly operatorId: string, readonly previewPort?: number,
    readonly faultPoint?: "after-intent" | "after-replace", readonly appOrigin?: string) {}

  private async serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.mutex.then(task, task);
    this.mutex = result.catch(() => undefined);
    return result;
  }

  async initialize(): Promise<void> {
    await mkdir(this.project.metadata, { recursive: true, mode: 0o700 });
    await mkdir(this.operationsDir(), { recursive: true, mode: 0o700 });
    const snapshot = await sourceSnapshot(this.project.root, this.project.manifest);
    const fingerprint = snapshotFingerprint(snapshot);
    try {
      const persisted = await readJson(this.ledgerFile()) as Ledger;
      if (persisted.version !== 1 || !id(persisted.revision) || !/^[a-f0-9]{64}$/.test(persisted.fingerprint)) throw new Error("Invalid revision ledger");
      this.ledger = persisted;
    } catch (failure) {
      if ((failure as NodeJS.ErrnoException).code !== "ENOENT") throw failure;
      this.ledger = { version: 1, revision: newId("revision"), fingerprint };
      await durableJson(this.ledgerFile(), this.ledger);
    }
    await this.refreshSource();
    for (const name of await readdir(this.operationsDir())) {
      if (!name.endsWith(".json")) continue;
      const operation = await this.loadOperation(name.slice(0, -5));
      if (operation && operation.kind !== "prepare") this.nextSequence = Math.max(this.nextSequence, operation.sequence ?? 0);
    }
  }

  private ledgerFile(): string { return path.join(this.project.metadata, "revision.json"); }
  private operationsDir(): string { return path.join(this.project.metadata, "operations"); }
  private operationFile(requestId: string): string { return path.join(this.operationsDir(), `${requestId}.json`); }

  private async loadOperation(requestId: string): Promise<Operation | null> {
    if (!id(requestId)) return null;
    try {
      const operation = await readJson(this.operationFile(requestId)) as Operation;
      if (operation.version !== 1 || operation.requestId !== requestId || !["prepare", "apply", "undo", "redo"].includes(operation.kind)) throw new Error("Invalid operation record");
      return operation;
    } catch (failure) {
      if ((failure as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw failure;
    }
  }

  private async storeOperation(operation: Operation): Promise<void> { await durableJson(this.operationFile(operation.requestId), operation); }

  private async recoverOperations(): Promise<void> {
    const files = (await readdir(this.operationsDir())).filter((name) => name.endsWith(".json")).sort();
    for (const name of files) {
      const operation = await this.loadOperation(name.slice(0, -5));
      if (!operation || operation.kind === "prepare" || operation.status !== "intent" || !operation.receipt ||
        !operation.beforeBase64 || !operation.afterBase64 || !operation.afterFingerprint) continue;
      let bytes: Uint8Array;
      try { bytes = await readFile(await safeSourcePath(this.project.root, writtenPatch(operation).file)); }
      catch { operation.status = "conflicted"; await this.storeOperation(operation); continue; }
      const current = digest(bytes);
      const before = digest(Buffer.from(operation.beforeBase64, "base64"));
      const after = digest(Buffer.from(operation.afterBase64, "base64"));
      if (current === after) {
        this.ledger = { version: 1, revision: operation.receipt.newRevision, fingerprint: operation.afterFingerprint };
        await durableJson(this.ledgerFile(), this.ledger);
        if (this.session) this.session.sourceRevision = this.ledger.revision;
        operation.status = "applied";
        await this.storeOperation(operation);
      } else if (current === before) {
        const snapshot = await sourceSnapshot(this.project.root, this.project.manifest);
        if (snapshotFingerprint(snapshot) !== operation.beforeFingerprint) {
          operation.status = "conflicted";
          await this.storeOperation(operation);
        } else if (!this.session || this.session.id !== operation.sessionId || this.session.state === "stopped" || this.session.state === "failed") {
          operation.status = "unapplied";
          await this.storeOperation(operation);
        }
      } else {
        operation.status = "conflicted";
        await this.storeOperation(operation);
      }
    }
  }

  private async refreshSource(): Promise<Record<string, Uint8Array>> {
    await this.recoverOperations();
    const snapshot = await sourceSnapshot(this.project.root, this.project.manifest);
    const fingerprint = snapshotFingerprint(snapshot);
    if (fingerprint !== this.ledger.fingerprint) {
      this.ledger = { version: 1, revision: newId("revision"), fingerprint };
      await durableJson(this.ledgerFile(), this.ledger);
      if (this.session) this.session.sourceRevision = this.ledger.revision;
    }
    const manifest = ProjectManifestSchema.parse(JSON.parse(Buffer.from(snapshot[".stellar/project.json"]!).toString("utf8")));
    if (JSON.stringify(manifest) !== JSON.stringify(this.project.manifest)) throw new Error("Fixture manifest changed");
    return snapshot;
  }

  private async hasPendingIntent(exceptRequestId?: string): Promise<boolean> {
    for (const name of await readdir(this.operationsDir())) {
      if (!name.endsWith(".json")) continue;
      const operation = await this.loadOperation(name.slice(0, -5));
      if (operation && operation.kind !== "prepare" && operation.status === "intent" && operation.requestId !== exceptRequestId) return true;
    }
    return false;
  }

  private startWatcher(): void {
    if (this.watcher) return;
    this.watcher = setInterval(() => { void this.serial(async () => { await this.refreshSource(); }).catch(() => {
      if (this.session) { this.session.state = "failed"; this.session.previewUrl = null;
        this.session.statusMessage = "The project source could not be read. Retry after checking the working copy."; }
      this.stopWatcher();
      void this.preview?.stop();
    }); }, 400);
    this.watcher.unref();
  }
  private stopWatcher(): void { if (this.watcher) clearInterval(this.watcher); this.watcher = null; }

  private checkSession(input: unknown): ErrorEnvelope | null {
    const scope = scopeOf(input);
    if (scope.projectId !== this.project.id) return error(input, "UNKNOWN_PROJECT");
    if (!this.session || scope.sessionId !== this.session.id) return error(input, "INVALID_SCOPE");
    return null;
  }
  private requireReady(input: unknown): ErrorEnvelope | null {
    return this.checkSession(input) ?? (this.session?.state === "ready" ? null : error(input, "NOT_READY"));
  }

  async open(input: unknown): Promise<Session | ErrorEnvelope> {
    if (!OpenSessionRequestSchema.safeParse(input).success || scopeOf(input).projectId !== this.project.id) return error(input, "INVALID_REQUEST");
    return this.serial(async () => {
      await this.refreshSource();
      if (this.session?.state === "starting" || this.session?.state === "ready") return this.session;
      await this.beginStart();
      return this.session!;
    });
  }

  private async beginStart(): Promise<void> {
    const epoch = ++this.startEpoch;
    const previous = this.preview;
    if (previous) await previous.stop();
    const generation = newId(`generation${++this.generationCounter}`);
    const session: Session = { id: newId("session"), projectId: this.project.id, state: "starting",
      sourceRevision: this.ledger.revision, previewGeneration: generation, previewUrl: null,
      statusMessage: "Starting local preview…" };
    this.session = session;
    this.startWatcher();
    const preview = new PreviewProcess(this.project, this.seed, this.data, () => {
      // During startup, start() owns failure classification and publishes it once.
      if (this.session === session && session.state === "ready") {
        session.state = "failed"; session.previewUrl = null; session.statusMessage = "The preview process stopped. Retry the session.";
      }
    }, this.appOrigin);
    this.preview = preview;
    void (async () => {
      try {
        await this.projectValidation();
        if (epoch !== this.startEpoch || this.session !== session || session.state === "stopped") return;
        const url = await preview.start(this.previewPort);
        if (epoch !== this.startEpoch || this.session !== session) { await preview.stop(); return; }
        session.state = "ready"; session.previewUrl = url; session.statusMessage = null;
      } catch (failure) {
        if (epoch !== this.startEpoch || this.session !== session) return;
        session.state = "failed"; session.previewUrl = null;
        session.statusMessage = failure instanceof PreviewError && failure.code === "PORT_BUSY"
          ? "The preview port is occupied. Stop the other process, then retry."
          : failure instanceof PreviewError && failure.code === "COMPILER_ERROR"
            ? "The Astro preview did not compile. Fix the page source, then retry."
            : failure instanceof PreviewError && failure.code === "START_TIMEOUT"
              ? "The preview did not respond in time. Retry the session."
              : failure instanceof Error && failure.message === "Pinned Astro dependencies are missing"
                ? "Project dependencies are missing. Install the pinned fixture packages, then retry."
                : "The preview process stopped. Retry the session.";
      }
    })();
  }

  private async projectValidation(): Promise<void> {
    // Executable files are compared to the reviewed seed before every launch.
    const { Registry } = await import("./registry.js");
    await new Registry(this.seed, this.data).validateExecutableFiles(this.project);
  }

  getSession(input: unknown): Session | ErrorEnvelope {
    const invalid = this.checkSession(input);
    return invalid ?? this.session!;
  }

  async close(input: unknown): Promise<Session | ErrorEnvelope> {
    return this.serial(async () => {
      const invalid = this.checkSession(input);
      if (invalid) return invalid;
      ++this.startEpoch;
      this.stopWatcher();
      await this.preview?.stop();
      this.preview = null;
      this.session!.state = "stopped";
      this.session!.previewUrl = null;
      this.session!.statusMessage = "Preview stopped. Source changes were kept.";
      return this.session!;
    });
  }

  async restart(input: unknown): Promise<Session | ErrorEnvelope> {
    return this.serial(async () => {
      const invalid = this.checkSession(input);
      if (invalid) return invalid;
      await this.refreshSource();
      await this.beginStart();
      return this.session!;
    });
  }

  async shutdown(): Promise<void> { await this.serial(async () => { ++this.startEpoch; this.stopWatcher(); await this.preview?.stop(); this.preview = null; }); }

  private async model(snapshot: Record<string, Uint8Array>, pageId: string, requestId: string): Promise<SourceModel> {
    return SourceModelSchema.parse(await createSourceModel({ snapshot, manifest: this.project.manifest,
      projectId: this.project.id, sessionId: this.session!.id, requestId,
      projectRevision: this.ledger.revision, pageId }));
  }

  private async modelForTarget(snapshot: Record<string, Uint8Array>, targetId: string, requestId: string): Promise<SourceModel | null> {
    for (const page of this.project.manifest.pages) {
      const model = await this.model(snapshot, page.id, requestId);
      if (model.targets.some((target) => target.targetId === targetId)) return model;
    }
    return null;
  }

  async sourceModel(input: unknown): Promise<SourceModel | ErrorEnvelope> {
    if (!input || typeof input !== "object") return error(input, "INVALID_REQUEST");
    const body = input as Record<string, unknown>;
    if (!id(body.requestId) || !id(body.pageId) || !this.project.manifest.pages.some((page) => page.id === body.pageId)) return error(input, "INVALID_REQUEST");
    return this.serial(async () => {
      const invalid = this.requireReady(input);
      if (invalid) return invalid;
      const snapshot = await this.refreshSource();
      return this.model(snapshot, body.pageId as string, body.requestId as string);
    });
  }

  async prepare(input: unknown): Promise<PrepareChangeResponse | ErrorEnvelope> {
    const parsed = PrepareChangeSchema.safeParse(input);
    if (!parsed.success) return error(input, "INVALID_REQUEST");
    return this.serial(async () => {
      const invalid = this.requireReady(input);
      if (invalid) return invalid;
      const request = parsed.data;
      const snapshot = await this.refreshSource();
      const existing = await this.loadOperation(request.requestId);
      const intentHash = digest(JSON.stringify({ operatorId: this.operatorId, operation: "prepare", request }));
      if (existing) {
        if (existing.kind !== "prepare" || existing.operatorId !== this.operatorId || existing.intentHash !== intentHash) return error(input, "IDEMPOTENCY_CONFLICT");
        if (existing.status === "unchanged") return { ...responseScope(this.session!, request.requestId), status: "unchanged", reason: "Source already has this value." };
        return { ...responseScope(this.session!, request.requestId), status: "ready", proposal: existing.proposal! };
      }
      if (await this.hasPendingIntent()) return error(input, "HISTORY_CONFLICT");
      if (request.expectedRevision !== this.ledger.revision) return error(input, "STALE_REVISION");
      const model = await this.modelForTarget(snapshot, request.targetId, request.requestId);
      if (!model) return error(input, "UNKNOWN_TARGET");
      const result = await prepareSourceChange({ snapshot, manifest: this.project.manifest, model, request });
      if (result.status === "refused") return result;
      const record: PreparedOperation = { version: 1, kind: "prepare", operatorId: this.operatorId,
        sessionId: this.session!.id, requestId: request.requestId, intentHash,
        status: result.status === "ready" ? "prepared" : "unchanged",
        proposal: result.status === "ready" ? ChangeProposalSchema.parse(result.proposal) : null };
      await this.storeOperation(record);
      return result;
    });
  }

  async apply(input: unknown): Promise<ApplyChangeResponse | ErrorEnvelope> {
    const parsed = ApplyChangeSchema.safeParse(input);
    if (!parsed.success) return error(input, "INVALID_REQUEST");
    return this.serial(async () => {
      const invalid = this.requireReady(input);
      if (invalid) return invalid;
      await this.refreshSource();
      if (await this.hasPendingIntent(parsed.data.requestId)) return error(input, "HISTORY_CONFLICT");
      return this.applyLocked(parsed.data);
    });
  }

  private async applyLocked(request: ApplyChange): Promise<ApplyChangeResponse | ErrorEnvelope> {
    const intentHash = digest(JSON.stringify({ operatorId: this.operatorId, operation: "apply", request }));
    const existing = await this.loadOperation(request.requestId);
    if (existing) {
      if (existing.kind !== "apply" || existing.operatorId !== this.operatorId || existing.intentHash !== intentHash) return error(request, "IDEMPOTENCY_CONFLICT");
      if (existing.status === "applied") return { ...responseScope(this.session!, request.requestId), status: "applied", receipt: existing.receipt! };
      if (existing.status === "unchanged") return { ...responseScope(this.session!, request.requestId), status: "unchanged", reason: "Source already has this value." };
      if (existing.status === "unapplied") return { ...responseScope(this.session!, request.requestId), status: "unchanged", reason: "The interrupted write did not change the source." };
      if (existing.status === "conflicted") return error(request, "HISTORY_CONFLICT");
      await this.recoverOperations();
      const recovered = await this.loadOperation(request.requestId) as AppliedOperation;
      if (recovered.status === "applied") return { ...responseScope(this.session!, request.requestId), status: "applied", receipt: recovered.receipt! };
      if (recovered.status === "conflicted") return error(request, "HISTORY_CONFLICT");
      if (recovered.sessionId !== this.session!.id || !recovered.receipt || !recovered.beforeBase64 ||
        !recovered.afterBase64 || !recovered.afterFingerprint) return error(request, "INVALID_SCOPE");
      await this.refreshSource();
      if (this.ledger.revision !== recovered.receipt.oldRevision) return error(request, "STALE_REVISION");
      const pendingPath = await safeSourcePath(this.project.root, recovered.proposal.sourcePatch.file);
      if (digest(await readFile(pendingPath)) !== digest(Buffer.from(recovered.beforeBase64, "base64"))) return error(request, "STALE_REVISION");
      await durableReplace(pendingPath, Buffer.from(recovered.afterBase64, "base64"));
      this.ledger = { version: 1, revision: recovered.receipt.newRevision, fingerprint: recovered.afterFingerprint };
      await durableJson(this.ledgerFile(), this.ledger);
      this.session!.sourceRevision = recovered.receipt.newRevision;
      recovered.status = "applied";
      await this.storeOperation(recovered);
      return { ...responseScope(this.session!, request.requestId), status: "applied", receipt: recovered.receipt };
    }
    const proposal = await this.findProposal(request.proposalId);
    if (!proposal) return error(request, "UNKNOWN_TARGET");
    if (proposal.sessionId !== this.session!.id) return error(request, "INVALID_SCOPE");
    const snapshot = await this.refreshSource();
    if (request.expectedRevision !== this.ledger.revision) return error(request, "STALE_REVISION");
    const model = await this.modelForTarget(snapshot, proposal.targetId, request.requestId);
    if (!model) return error(request, "UNKNOWN_TARGET");
    const validation = validateApplyChange(request, { projectId: this.project.id, sessionId: this.session!.id,
      sourceRevision: this.ledger.revision, previewGeneration: this.session!.previewGeneration,
      targets: model.targets }, proposal, this.project.manifest);
    if (!validation.ok) return validation.error;
    const file = proposal.sourcePatch.file;
    if (!this.project.manifest.allowedCssFiles.includes(file)) return error(request, "UNSUPPORTED_TARGET");
    const sourcePath = await safeSourcePath(this.project.root, file);
    const before = await readFile(sourcePath);
    if (!snapshot[file] || digest(before) !== digest(snapshot[file]) || digest(before) !== proposal.sourcePatch.expectedFileSha256) return error(request, "STALE_REVISION");
    let after: Uint8Array;
    try { after = applySourcePatch(before, proposal.sourcePatch); }
    catch { return error(request, "STALE_REVISION"); }
    if (digest(before) === digest(after)) {
      const record: AppliedOperation = { version: 1, kind: "apply", operatorId: this.operatorId,
        sessionId: this.session!.id, requestId: request.requestId, intentHash, status: "unchanged",
        proposal, sequence: ++this.nextSequence, receipt: null, beforeBase64: null, afterBase64: null, beforeFingerprint: null, afterFingerprint: null };
      await this.storeOperation(record);
      return { ...responseScope(this.session!, request.requestId), status: "unchanged", reason: "Source already has this value." };
    }
    const afterSnapshot = { ...snapshot, [file]: after };
    const afterFingerprint = snapshotFingerprint(afterSnapshot);
    const receipt: ChangeReceipt = { receiptId: newId("receipt"), projectId: this.project.id,
      sessionId: this.session!.id, requestId: request.requestId, proposalId: proposal.proposalId,
      operation: "apply", targetId: proposal.targetId, oldRevision: this.ledger.revision,
      newRevision: newId("revision"), changedFile: file };
    const record: AppliedOperation = { version: 1, kind: "apply", operatorId: this.operatorId,
      sessionId: this.session!.id, requestId: request.requestId, intentHash, status: "intent",
      proposal, sequence: ++this.nextSequence, receipt, beforeBase64: Buffer.from(before).toString("base64"),
      afterBase64: Buffer.from(after).toString("base64"), beforeFingerprint: this.ledger.fingerprint, afterFingerprint,
      display: displayFor(proposal) };
    if (!existing) await this.storeOperation(record);
    if (this.faultPoint === "after-intent") throw new Error("Injected interruption after durable intent");
    // Recheck immediately before atomic replacement; an uncooperative external writer can still race rename.
    const observed = await readFile(await safeSourcePath(this.project.root, file));
    if (digest(observed) !== digest(before)) return error(request, "STALE_REVISION");
    await durableReplace(sourcePath, after);
    if (this.faultPoint === "after-replace") throw new Error("Injected interruption after atomic replacement");
    this.ledger = { version: 1, revision: receipt.newRevision, fingerprint: afterFingerprint };
    await durableJson(this.ledgerFile(), this.ledger);
    this.session!.sourceRevision = receipt.newRevision;
    record.status = "applied";
    await this.storeOperation(record);
    return { ...responseScope(this.session!, request.requestId), status: "applied", receipt };
  }

  private async findProposal(proposalId: string): Promise<ChangeProposal | null> {
    if (!id(proposalId)) return null;
    for (const name of await readdir(this.operationsDir())) {
      if (!name.endsWith(".json")) continue;
      const operation = await this.loadOperation(name.slice(0, -5));
      if (operation?.kind === "prepare" && operation.operatorId === this.operatorId && operation.status === "prepared" &&
        operation.proposal?.proposalId === proposalId) return operation.proposal;
    }
    return null;
  }

  private async historyState(): Promise<{
    entries: { sequence: number; entry: HistoryEntry; original: AppliedOperation }[];
    undoStack: string[]; redoStack: string[]; lastRevision: string | null;
  }> {
    const written: WrittenOperation[] = [];
    for (const name of await readdir(this.operationsDir())) {
      if (!name.endsWith(".json")) continue;
      const operation = await this.loadOperation(name.slice(0, -5));
      if (operation && operation.kind !== "prepare" && operation.status === "applied" && operation.receipt) written.push(operation);
    }
    written.sort((left, right) => left.sequence - right.sequence || left.requestId.localeCompare(right.requestId));
    const entries: { sequence: number; entry: HistoryEntry; original: AppliedOperation }[] = [];
    const byId = new Map<string, (typeof entries)[number]>();
    const undoStack: string[] = [];
    const redoStack: string[] = [];
    let lastRevision: string | null = null;
    for (const operation of written) {
      if (operation.kind === "apply") {
        if (lastRevision && operation.receipt!.oldRevision !== lastRevision) { undoStack.length = 0; redoStack.length = 0; }
        const receipt = operation.receipt!;
        const item = { sequence: operation.sequence, original: operation,
          entry: { entryId: receipt.receiptId, receipt, command: operation.proposal.command,
            state: "applied" as const, impact: operation.proposal.impact,
            ...(operation.display ? { display: operation.display } : {}) } };
        entries.push(item);
        byId.set(item.entry.entryId, item);
        undoStack.push(item.entry.entryId);
        redoStack.length = 0;
      } else if (operation.kind === "undo") {
        if (undoStack.at(-1) !== operation.sourceEntryId) throw new Error("Invalid undo journal order");
        undoStack.pop();
        redoStack.push(operation.sourceEntryId);
        const item = byId.get(operation.sourceEntryId);
        if (!item) throw new Error("Missing undo source entry");
        item.entry.state = "undone";
      } else {
        if (redoStack.at(-1) !== operation.sourceEntryId) throw new Error("Invalid redo journal order");
        redoStack.pop();
        undoStack.push(operation.sourceEntryId);
        const item = byId.get(operation.sourceEntryId);
        if (!item) throw new Error("Missing redo source entry");
        item.entry.state = "applied";
      }
      lastRevision = operation.receipt!.newRevision;
    }
    return { entries, undoStack, redoStack, lastRevision };
  }

  async historyCommand(input: unknown): Promise<ApplyChangeResponse | ErrorEnvelope> {
    const parsed = HistoryCommandSchema.safeParse(input);
    if (!parsed.success) return error(input, "INVALID_REQUEST");
    return this.serial(async () => {
      const invalid = this.requireReady(input);
      if (invalid) return invalid;
      await this.refreshSource();
      if (await this.hasPendingIntent(parsed.data.requestId)) return error(input, "HISTORY_CONFLICT");
      return this.historyCommandLocked(parsed.data);
    });
  }

  private async commitHistoryRecord(record: HistoryOperation, before: Uint8Array, after: Uint8Array): Promise<ApplyChangeResponse | ErrorEnvelope> {
    const request = { projectId: this.project.id, sessionId: this.session!.id, requestId: record.requestId };
    if (this.faultPoint === "after-intent") throw new Error("Injected interruption after durable intent");
    if (this.ledger.revision !== record.receipt.oldRevision || this.ledger.fingerprint !== record.beforeFingerprint) return error(request, "STALE_REVISION");
    const sourcePath = await safeSourcePath(this.project.root, record.patch.file);
    const observed = await readFile(sourcePath);
    if (digest(observed) !== digest(before)) return error(request, "STALE_REVISION");
    try { if (digest(applySourcePatch(observed, record.patch)) !== digest(after)) return error(request, "HISTORY_CONFLICT"); }
    catch { return error(request, "STALE_REVISION"); }
    await durableReplace(sourcePath, after);
    if (this.faultPoint === "after-replace") throw new Error("Injected interruption after atomic replacement");
    this.ledger = { version: 1, revision: record.receipt.newRevision, fingerprint: record.afterFingerprint };
    await durableJson(this.ledgerFile(), this.ledger);
    this.session!.sourceRevision = record.receipt.newRevision;
    record.status = "applied";
    await this.storeOperation(record);
    return { ...responseScope(this.session!, record.requestId), status: "applied", receipt: record.receipt };
  }

  private async historyCommandLocked(request: HistoryCommand): Promise<ApplyChangeResponse | ErrorEnvelope> {
    const intentHash = digest(JSON.stringify({ operatorId: this.operatorId, operation: request.operation, request }));
    const existing = await this.loadOperation(request.requestId);
    if (existing) {
      if (existing.kind !== request.operation || existing.operatorId !== this.operatorId || existing.intentHash !== intentHash) return error(request, "IDEMPOTENCY_CONFLICT");
      if (existing.status === "applied") return { ...responseScope(this.session!, request.requestId), status: "applied", receipt: existing.receipt };
      if (existing.status === "unapplied") return { ...responseScope(this.session!, request.requestId), status: "unchanged", reason: "The interrupted write did not change the source." };
      if (existing.status === "conflicted") return error(request, "HISTORY_CONFLICT");
      await this.recoverOperations();
      const recovered = await this.loadOperation(request.requestId) as HistoryOperation;
      if (recovered.status === "applied") return { ...responseScope(this.session!, request.requestId), status: "applied", receipt: recovered.receipt };
      if (recovered.status === "unapplied") return { ...responseScope(this.session!, request.requestId), status: "unchanged", reason: "The interrupted write did not change the source." };
      if (recovered.status === "conflicted") return error(request, "HISTORY_CONFLICT");
      if (recovered.sessionId !== this.session!.id) return error(request, "INVALID_SCOPE");
      await this.refreshSource();
      if (this.ledger.revision !== recovered.receipt.oldRevision || this.ledger.fingerprint !== recovered.beforeFingerprint) return error(request, "STALE_REVISION");
      const before = Buffer.from(recovered.beforeBase64, "base64");
      const after = Buffer.from(recovered.afterBase64, "base64");
      return this.commitHistoryRecord(recovered, before, after);
    }
    const validated = validateHistoryCommand(request, { projectId: this.project.id, sessionId: this.session!.id,
      sourceRevision: this.ledger.revision, previewGeneration: this.session!.previewGeneration });
    if (!validated.ok) return validated.error;
    const state = await this.historyState();
    if (state.lastRevision !== this.ledger.revision) return error(request, "HISTORY_CONFLICT");
    const expectedEntryId = request.operation === "undo" ? state.undoStack.at(-1) : state.redoStack.at(-1);
    if (!expectedEntryId || expectedEntryId !== request.entryId) return error(request, "HISTORY_CONFLICT");
    const original = state.entries.find((item) => item.entry.entryId === request.entryId)?.original;
    if (!original || original.operatorId !== this.operatorId || !original.receipt || !original.beforeBase64 || !original.afterBase64 ||
      original.receipt.proposalId !== original.proposal.proposalId || original.receipt.changedFile !== original.proposal.sourcePatch.file) return error(request, "HISTORY_CONFLICT");
    const file = original.proposal.sourcePatch.file;
    if (!this.project.manifest.allowedCssFiles.includes(file)) return error(request, "UNSUPPORTED_TARGET");
    const originalBefore = Buffer.from(original.beforeBase64, "base64");
    const originalAfter = Buffer.from(original.afterBase64, "base64");
    if (digest(originalBefore) !== original.proposal.sourcePatch.expectedFileSha256) return error(request, "HISTORY_CONFLICT");
    let patch: SourcePatch;
    try {
      patch = request.operation === "undo" ? createInversePatch(original.proposal.sourcePatch, originalAfter) : original.proposal.sourcePatch;
    } catch { return error(request, "HISTORY_CONFLICT"); }
    const snapshot = await this.refreshSource();
    const sourcePath = await safeSourcePath(this.project.root, file);
    const before = await readFile(sourcePath);
    if (!snapshot[file] || digest(before) !== digest(snapshot[file]) || digest(before) !== patch.expectedFileSha256) return error(request, "STALE_REVISION");
    let after: Uint8Array;
    try { after = applySourcePatch(before, patch); } catch { return error(request, "STALE_REVISION"); }
    if (digest(before) === digest(after)) return error(request, "HISTORY_CONFLICT");
    const receipt: ChangeReceipt = { receiptId: newId("receipt"), projectId: this.project.id, sessionId: this.session!.id,
      requestId: request.requestId, proposalId: null, operation: request.operation, targetId: original.proposal.targetId,
      oldRevision: this.ledger.revision, newRevision: newId("revision"), changedFile: file };
    const record: HistoryOperation = { version: 1, kind: request.operation, operatorId: this.operatorId,
      sessionId: this.session!.id, requestId: request.requestId, intentHash, status: "intent", sourceEntryId: request.entryId,
      patch, receipt, sequence: ++this.nextSequence, beforeBase64: Buffer.from(before).toString("base64"),
      afterBase64: Buffer.from(after).toString("base64"), beforeFingerprint: this.ledger.fingerprint,
      afterFingerprint: snapshotFingerprint({ ...snapshot, [file]: after }) };
    await this.storeOperation(record);
    return this.commitHistoryRecord(record, before, after);
  }

  async outcome(input: unknown): Promise<RequestOutcome | ErrorEnvelope> {
    const parsed = ReconcileRequestSchema.safeParse(input);
    if (!parsed.success) return error(input, "INVALID_REQUEST");
    return this.serial(async () => {
      const invalid = this.checkSession(input);
      if (invalid) return invalid;
      await this.refreshSource();
      const record = await this.loadOperation(parsed.data.lookupRequestId);
      if (!record || record.operatorId !== this.operatorId) return error(input, "UNKNOWN_TARGET");
      const base = { ...responseScope(this.session!, parsed.data.requestId), originalRequestId: record.requestId,
        operation: record.kind };
      if (record.kind === "prepare") {
        if (record.status === "prepared") return { ...base, operation: "prepare", status: "prepared", proposal: record.proposal! };
        return { ...base, operation: "prepare", status: "unchanged" };
      }
      if (record.status === "applied") return { ...base, operation: record.kind, status: "applied", receipt: record.receipt! };
      if (record.status === "unapplied" || record.kind === "apply" && record.status === "unchanged") return { ...base, operation: record.kind, status: "unchanged" };
      if (record.status === "conflicted") return { ...base, operation: record.kind, status: "conflicted", error: error(input, "HISTORY_CONFLICT").error };
      return { ...base, operation: record.kind, status: "pending" };
    });
  }

  async history(input: unknown): Promise<HistoryResponse | ErrorEnvelope> {
    const scope = scopeOf(input);
    const requestId = scope.requestId;
    if (!requestId) return error(input, "INVALID_REQUEST");
    return this.serial(async () => {
      const invalid = this.checkSession(input);
      if (invalid) return invalid;
      await this.refreshSource();
      const state = await this.historyState();
      const fresh = state.lastRevision === this.ledger.revision && !(await this.hasPendingIntent());
      const recent = state.entries.slice(-200).map((item) => item.entry);
      const topUndo = state.undoStack.at(-1);
      const topRedo = state.redoStack.at(-1);
      const undoEntryId = fresh && recent.some((item) => item.entryId === topUndo) ? topUndo! : null;
      const redoEntryId = fresh && recent.some((item) => item.entryId === topRedo) ? topRedo! : null;
      return { ...responseScope(this.session!, requestId), projectRevision: this.ledger.revision,
        entries: recent, canUndo: undoEntryId !== null, canRedo: redoEntryId !== null, undoEntryId, redoEntryId };
    });
  }

  async pages(input: unknown): Promise<{ protocolVersion: typeof PROTOCOL_VERSION; projectId: string; sessionId: string; requestId: string; pages: { id: string; route: string; label: string }[] } | ErrorEnvelope> {
    const invalid = this.checkSession(input);
    if (invalid) return invalid;
    const scope = scopeOf(input);
    if (!scope.requestId) return error(input, "INVALID_REQUEST");
    return { ...responseScope(this.session!, scope.requestId), pages: this.project.manifest.pages.map(({ id, route, label }) => ({ id, route, label })) };
  }

  currentRevision(): string { return this.ledger.revision; }
  currentSession(): Session | null { return this.session; }
  diagnosticTail(): string { return this.preview?.diagnosticTail() ?? ""; }
}
