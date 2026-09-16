import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, readdir, rename, rm, symlink } from "node:fs/promises";
import path from "node:path";
import {
  BlueprintManifestSchema, CreateProjectRequestSchema, ProjectManifestSchema,
  type BlueprintCatalogEntry, type BlueprintManifest, type CreateProjectRequest,
  type ProjectManifest, type RegisteredWorkspace,
} from "@stellar/contracts";
import { copySeedFile, digest, durableJson, readJson } from "./storage.js";

export type RegisteredProject = {
  id: string;
  workspaceId: string;
  label: string;
  root: string;
  metadata: string;
  manifest: ProjectManifest;
  workspace: RegisteredWorkspace;
  kind: "legacy" | "blueprint";
};

export type RegistryErrorCode = "INVALID_REQUEST" | "UNKNOWN_BLUEPRINT" | "IDEMPOTENCY_CONFLICT" | "REGISTRY_CORRUPT";
export class RegistryError extends Error {
  constructor(readonly code: RegistryErrorCode, message: string) { super(message); this.name = "RegistryError"; }
}

type RegistryEntry = {
  kind: "legacy" | "blueprint";
  id: string;
  workspaceId: string;
  name: string;
  label: string;
  directory: string;
  blueprintId: string;
  blueprintVersion: string;
  designSystemId: string;
  designSystemVersion: string;
  createdAt: string | null;
  creationRequestId: string | null;
};
type CreationRecord = {
  requestId: string;
  name: string;
  blueprintId: string;
  blueprintVersion: string;
  projectId: string;
  workspaceId: string;
  directory: string;
  createdAt: string;
  status: "pending" | "completed";
};
type RegistryRecord = { version: 2; entries: RegistryEntry[]; creations: CreationRecord[] };

const legacyDefinitions = [
  { id: "project-a", workspaceId: "workspace-a", label: "Working copy A", directory: "a", name: "Fieldnote Studio style lab A" },
  { id: "project-b", workspaceId: "workspace-b", label: "Working copy B", directory: "b", name: "Fieldnote Studio style lab B" },
] as const;
const legacyV1Entries = legacyDefinitions.map((entry) => ({
  id: entry.id, workspaceId: entry.workspaceId, label: entry.label, directory: entry.directory,
}));
const supportedBlueprint = { id: "astro-style-lab", version: "1.0.0" } as const;
const supportedBlueprintManifestSha256 = "6f4a4c77418450fa926f59f5e9e562f315803195163047ed8257ef3c788f17b3";
const legacyProtectedFiles = new Set(["package.json", "package-lock.json", "astro.config.mjs", ".nvmrc"]);
const maxProjects = 100;

async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("|") === [...expected].sort().join("|");
}
function string(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function isIso(value: unknown): value is string {
  return string(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function parseEntry(value: unknown): RegistryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!exactKeys(item, ["kind", "id", "workspaceId", "name", "label", "directory", "blueprintId", "blueprintVersion", "designSystemId", "designSystemVersion", "createdAt", "creationRequestId"])) return null;
  if (item.kind !== "legacy" && item.kind !== "blueprint" ||
    ![item.id, item.workspaceId, item.name, item.label, item.directory, item.blueprintId, item.blueprintVersion, item.designSystemId, item.designSystemVersion].every(string) ||
    item.createdAt !== null && !isIso(item.createdAt) || item.creationRequestId !== null && !string(item.creationRequestId)) return null;
  return item as RegistryEntry;
}
function parseCreation(value: unknown): CreationRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (!exactKeys(item, ["requestId", "name", "blueprintId", "blueprintVersion", "projectId", "workspaceId", "directory", "createdAt", "status"])) return null;
  if (![item.requestId, item.name, item.blueprintId, item.blueprintVersion, item.projectId, item.workspaceId, item.directory].every(string) ||
    !isIso(item.createdAt) || item.status !== "pending" && item.status !== "completed") return null;
  return item as CreationRecord;
}
function parseRegistryV2(value: unknown): RegistryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!exactKeys(record, ["version", "entries", "creations"]) || record.version !== 2 ||
    !Array.isArray(record.entries) || !Array.isArray(record.creations)) return null;
  const entries = record.entries.map(parseEntry);
  const creations = record.creations.map(parseCreation);
  if (entries.some((item) => item === null) || creations.some((item) => item === null)) return null;
  return { version: 2, entries: entries as RegistryEntry[], creations: creations as CreationRecord[] };
}
function creationIds(requestId: string): { projectId: string; workspaceId: string } {
  const hash = createHash("sha256").update(`stellar.project.v1\0${requestId}`).digest("hex");
  return { projectId: `project-${hash.slice(0, 24)}`, workspaceId: `workspace-${hash.slice(24, 48)}` };
}

export class Registry {
  readonly projects = new Map<string, RegisteredProject>();
  private blueprintManifest: BlueprintManifest | null = null;
  private projectManifest: ProjectManifest | null = null;
  private record: RegistryRecord | null = null;
  private dataReal: string | null = null;
  private serialCreation: Promise<void> = Promise.resolve();

  constructor(readonly seed: string, readonly data: string) {}

  async initialize(): Promise<void> {
    this.projects.clear();
    const { blueprint, project } = await this.loadBlueprint();
    await this.ensureDirectory(this.data, "Registry data directory must not be a symlink");
    this.dataReal = await realpath(this.data);
    await this.ensureDirectory(path.join(this.dataReal, "copies"), "Registry copies directory must not be a symlink");
    await this.ensureDirectory(path.join(this.dataReal, "metadata"), "Registry metadata directory must not be a symlink");

    const registryFile = path.join(this.dataReal, "registry.json");
    if (!(await exists(registryFile))) {
      await this.ensureLegacyRoots();
      this.record = this.initialRecord(blueprint);
      await durableJson(registryFile, this.record);
    } else {
      const registryInfo = await lstat(registryFile);
      if (registryInfo.isSymbolicLink() || !registryInfo.isFile()) throw new RegistryError("REGISTRY_CORRUPT", "Registry file must not be a symlink");
      const raw = await readJson(registryFile);
      if (this.isLegacyV1(raw)) {
        await this.ensureLegacyRoots();
        this.record = this.initialRecord(blueprint);
        await durableJson(registryFile, this.record);
      } else {
        this.record = parseRegistryV2(raw);
        if (!this.record) throw new RegistryError("REGISTRY_CORRUPT", "Unknown project registration");
      }
    }
    this.validateRecord(blueprint);
    await this.recoverPending();
    for (const entry of this.record.entries) {
      const registered = await this.register(entry, project);
      this.projects.set(registered.id, registered);
    }
  }

  catalog(): BlueprintCatalogEntry[] {
    if (!this.blueprintManifest) throw new RegistryError("REGISTRY_CORRUPT", "Registry is not initialized");
    const { blueprint, name, description, renderer, designSystem, capabilities, pageCount } = this.blueprintManifest;
    return [{ blueprint, name, description, renderer, designSystem, capabilities, pageCount }];
  }

  async create(input: CreateProjectRequest): Promise<{ project: RegisteredProject; status: "created" | "existing" }> {
    let release!: () => void;
    const previous = this.serialCreation;
    this.serialCreation = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await this.createSerial(input); } finally { release(); }
  }

  private async createSerial(input: CreateProjectRequest): Promise<{ project: RegisteredProject; status: "created" | "existing" }> {
    const parsed = CreateProjectRequestSchema.safeParse(input);
    if (!parsed.success) throw new RegistryError("INVALID_REQUEST", "Invalid project creation request");
    if (!this.record || !this.dataReal || !this.projectManifest || !this.blueprintManifest) throw new RegistryError("REGISTRY_CORRUPT", "Registry is not initialized");
    const request = parsed.data;
    if (request.blueprintId !== supportedBlueprint.id || request.blueprintVersion !== supportedBlueprint.version) throw new RegistryError("UNKNOWN_BLUEPRINT", "Unknown or unsupported blueprint version");
    let creation = this.record.creations.find((item) => item.requestId === request.requestId);
    let addedCreation = false;
    if (creation) {
      if (creation.name !== request.name || creation.blueprintId !== request.blueprintId || creation.blueprintVersion !== request.blueprintVersion) throw new RegistryError("IDEMPOTENCY_CONFLICT", "Request ID was already used for a different project");
      if (creation.status === "completed") {
        const completedRequestId = creation.requestId;
        let existing = this.projects.get(creation.projectId);
        if (!existing) {
          const entry = this.record.entries.find((item) => item.creationRequestId === completedRequestId);
          if (!entry) throw new RegistryError("REGISTRY_CORRUPT", "Completed creation has no registered project");
          existing = await this.register(entry, this.projectManifest);
          this.projects.set(existing.id, existing);
        }
        return { project: existing, status: "existing" };
      }
    } else {
      if (this.record.entries.length >= maxProjects) throw new RegistryError("INVALID_REQUEST", "Project limit reached");
      const ids = creationIds(request.requestId);
      creation = { requestId: request.requestId, name: request.name, blueprintId: request.blueprintId,
        blueprintVersion: request.blueprintVersion, projectId: ids.projectId, workspaceId: ids.workspaceId,
        directory: ids.projectId, createdAt: new Date().toISOString(), status: "pending" };
      this.record.creations.push(creation);
      addedCreation = true;
    }
    try { await this.saveRecord(); } catch (failure) {
      if (addedCreation) this.record.creations.pop();
      throw failure;
    }
    const root = this.projectRoot(creation.directory);
    await this.materializeCreation(creation, root);
    const entry = this.entryForCreation(creation);
    this.record.entries.push(entry);
    creation.status = "completed";
    try { await this.saveRecord(); } catch (failure) {
      this.record.entries.pop();
      creation.status = "pending";
      throw failure;
    }
    const registered = await this.register(entry, this.projectManifest);
    this.projects.set(registered.id, registered);
    return { project: registered, status: "created" };
  }

  private async loadBlueprint(): Promise<{ blueprint: BlueprintManifest; project: ProjectManifest }> {
    const seedPath = path.resolve(this.seed);
    const seedInfo = await lstat(seedPath);
    if (seedInfo.isSymbolicLink() || !seedInfo.isDirectory() || await realpath(seedPath) !== seedPath) throw new RegistryError("REGISTRY_CORRUPT", "Fixture seed must be a real directory");
    const blueprintFile = path.join(seedPath, ".stellar/blueprint.json");
    const blueprintInfo = await lstat(blueprintFile);
    const blueprintBytes = await readFile(blueprintFile);
    if (blueprintInfo.isSymbolicLink() || !blueprintInfo.isFile() || digest(blueprintBytes) !== supportedBlueprintManifestSha256) throw new RegistryError("REGISTRY_CORRUPT", "Unsupported blueprint manifest");
    const blueprint = BlueprintManifestSchema.parse(JSON.parse(blueprintBytes.toString("utf8")));
    if (blueprint.blueprint.id !== supportedBlueprint.id || blueprint.blueprint.version !== supportedBlueprint.version) throw new RegistryError("REGISTRY_CORRUPT", "Unsupported blueprint identity");
    for (const reviewed of blueprint.reviewedFiles) {
      const file = await this.safeExistingFile(seedPath, reviewed.path);
      if (digest(await readFile(file)) !== reviewed.sha256) throw new RegistryError("REGISTRY_CORRUPT", `Reviewed blueprint file changed: ${reviewed.path}`);
    }
    const projectBytes = await readFile(path.join(seedPath, ".stellar/project.json"));
    const project = ProjectManifestSchema.parse(JSON.parse(projectBytes.toString("utf8")));
    if (digest(projectBytes) !== blueprint.projectManifestSha256 || project.renderer !== blueprint.renderer ||
      project.pages.length !== blueprint.pageCount || JSON.stringify(project.capabilities) !== JSON.stringify(blueprint.capabilities)) throw new RegistryError("REGISTRY_CORRUPT", "Blueprint and project manifest disagree");
    this.blueprintManifest = blueprint;
    this.projectManifest = project;
    return { blueprint, project };
  }

  private async ensureDirectory(directory: string, message: string): Promise<void> {
    if (await exists(directory)) {
      const info = await lstat(directory);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new RegistryError("REGISTRY_CORRUPT", message);
      return;
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new RegistryError("REGISTRY_CORRUPT", message);
  }

  private initialRecord(blueprint: BlueprintManifest): RegistryRecord {
    return { version: 2, entries: legacyDefinitions.map((legacy) => ({
      kind: "legacy", ...legacy, blueprintId: blueprint.blueprint.id, blueprintVersion: blueprint.blueprint.version,
      designSystemId: blueprint.designSystem.id, designSystemVersion: blueprint.designSystem.version,
      createdAt: null, creationRequestId: null,
    })), creations: [] };
  }
  private isLegacyV1(value: unknown): boolean { return JSON.stringify(value) === JSON.stringify({ version: 1, entries: legacyV1Entries }); }

  private validateRecord(blueprint: BlueprintManifest): void {
    if (!this.record || this.record.entries.length > maxProjects) throw new RegistryError("REGISTRY_CORRUPT", "Invalid project count");
    const ids = new Set<string>(); const workspaces = new Set<string>(); const directories = new Set<string>();
    const requests = new Set<string>(); const entryRequests = new Set<string>();
    for (const entry of this.record.entries) {
      if (ids.has(entry.id) || workspaces.has(entry.workspaceId) || directories.has(entry.directory)) throw new RegistryError("REGISTRY_CORRUPT", "Duplicate project registration");
      ids.add(entry.id); workspaces.add(entry.workspaceId); directories.add(entry.directory);
      if (entry.blueprintId !== blueprint.blueprint.id || entry.blueprintVersion !== blueprint.blueprint.version || entry.designSystemId !== blueprint.designSystem.id || entry.designSystemVersion !== blueprint.designSystem.version) throw new RegistryError("REGISTRY_CORRUPT", "Unsupported registered blueprint");
      if (entry.kind === "legacy") {
        const expected = legacyDefinitions.find((item) => item.id === entry.id);
        if (!expected || entry.workspaceId !== expected.workspaceId || entry.name !== expected.name || entry.label !== expected.label || entry.directory !== expected.directory || entry.createdAt !== null || entry.creationRequestId !== null) throw new RegistryError("REGISTRY_CORRUPT", "Unknown legacy registration");
      } else {
        if (!entry.createdAt || !entry.creationRequestId || entry.directory !== entry.id || entryRequests.has(entry.creationRequestId)) throw new RegistryError("REGISTRY_CORRUPT", "Invalid blueprint registration");
        entryRequests.add(entry.creationRequestId);
      }
    }
    if (!legacyDefinitions.every((legacy) => ids.has(legacy.id))) throw new RegistryError("REGISTRY_CORRUPT", "Legacy registration is missing");
    for (const creation of this.record.creations) {
      if (requests.has(creation.requestId)) throw new RegistryError("REGISTRY_CORRUPT", "Duplicate creation request");
      requests.add(creation.requestId);
      const expected = creationIds(creation.requestId);
      if (creation.projectId !== expected.projectId || creation.workspaceId !== expected.workspaceId || creation.directory !== creation.projectId || creation.blueprintId !== blueprint.blueprint.id || creation.blueprintVersion !== blueprint.blueprint.version) throw new RegistryError("REGISTRY_CORRUPT", "Invalid creation record");
      const matchingEntries = this.record.entries.filter((item) => item.creationRequestId === creation.requestId);
      if (creation.status === "completed") {
        const entry = matchingEntries[0];
        if (matchingEntries.length !== 1 || !entry || entry.kind !== "blueprint" || entry.id !== creation.projectId ||
          entry.workspaceId !== creation.workspaceId || entry.name !== creation.name || entry.label !== creation.name ||
          entry.directory !== creation.directory || entry.createdAt !== creation.createdAt ||
          entry.blueprintId !== creation.blueprintId || entry.blueprintVersion !== creation.blueprintVersion) {
          throw new RegistryError("REGISTRY_CORRUPT", "Creation status does not match registration");
        }
      } else if (matchingEntries.length) throw new RegistryError("REGISTRY_CORRUPT", "Creation status does not match registration");
    }
    for (const entry of this.record.entries.filter((item) => item.kind === "blueprint")) {
      if (!this.record.creations.some((item) => item.requestId === entry.creationRequestId && item.status === "completed")) throw new RegistryError("REGISTRY_CORRUPT", "Blueprint registration has no completed creation");
    }
  }

  private async ensureLegacyRoots(): Promise<void> {
    if (!this.dataReal) this.dataReal = await realpath(this.data);
    for (const legacy of legacyDefinitions) {
      const root = this.projectRoot(legacy.directory);
      if (!(await exists(root))) await this.copyBlueprint(root, `legacy-${legacy.id}`, false);
      await this.validateRoot(root, false, this.blueprintManifest!);
    }
  }

  private async recoverPending(): Promise<void> {
    if (!this.record) return;
    let changed = false;
    for (const creation of this.record.creations.filter((item) => item.status === "pending")) {
      const root = this.projectRoot(creation.directory);
      await this.removeStaging(creation.projectId);
      if (!(await exists(root))) continue;
      await this.validateRoot(root, true, this.blueprintManifest!);
      this.record.entries.push(this.entryForCreation(creation)); creation.status = "completed"; changed = true;
    }
    if (changed) await this.saveRecord();
  }

  private entryForCreation(creation: CreationRecord): RegistryEntry {
    const blueprint = this.blueprintManifest!;
    return { kind: "blueprint", id: creation.projectId, workspaceId: creation.workspaceId, name: creation.name, label: creation.name,
      directory: creation.directory, blueprintId: creation.blueprintId, blueprintVersion: creation.blueprintVersion,
      designSystemId: blueprint.designSystem.id, designSystemVersion: blueprint.designSystem.version,
      createdAt: creation.createdAt, creationRequestId: creation.requestId };
  }
  private async materializeCreation(creation: CreationRecord, root: string): Promise<void> {
    await this.removeStaging(creation.projectId);
    if (!(await exists(root))) await this.copyBlueprint(root, creation.projectId, true);
    await this.validateRoot(root, true, this.blueprintManifest!);
  }
  private async copyBlueprint(root: string, stagingId: string, includeBlueprintManifest: boolean): Promise<void> {
    const staging = this.stagingRoot(stagingId);
    await this.removeStaging(stagingId);
    try {
      for (const reviewed of this.blueprintManifest!.reviewedFiles) await copySeedFile(path.join(this.seed, reviewed.path), path.join(staging, reviewed.path));
      if (includeBlueprintManifest) await copySeedFile(path.join(this.seed, ".stellar/blueprint.json"), path.join(staging, ".stellar/blueprint.json"));
      await rename(staging, root);
    } catch (failure) { await this.removeStaging(stagingId); throw failure; }
  }

  private async validateRoot(root: string, expectBlueprintManifest: boolean, blueprint: BlueprintManifest): Promise<void> {
    await this.assertOwnedDirectory(path.join(this.dataReal!, "copies"), "Registry copies directory changed location");
    const info = await lstat(root); const copies = path.join(this.dataReal!, "copies");
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(root) !== root || path.dirname(root) !== copies) throw new RegistryError("REGISTRY_CORRUPT", "Working copy escaped registry");
    for (const reviewed of blueprint.reviewedFiles) {
      const file = await this.safeExistingFile(root, reviewed.path);
      const pinned = expectBlueprintManifest ? reviewed.executable : legacyProtectedFiles.has(reviewed.path);
      if (pinned && digest(await readFile(file)) !== reviewed.sha256) throw new RegistryError("REGISTRY_CORRUPT", `Executable blueprint file changed: ${reviewed.path}`);
    }
    const localBlueprint = path.join(root, ".stellar/blueprint.json");
    if (expectBlueprintManifest) {
      const file = await this.safeExistingFile(root, ".stellar/blueprint.json");
      if (digest(await readFile(file)) !== supportedBlueprintManifestSha256) throw new RegistryError("REGISTRY_CORRUPT", "Blueprint identity changed");
      await this.validateSourceInventory(root, blueprint);
    } else if (await exists(localBlueprint)) throw new RegistryError("REGISTRY_CORRUPT", "Legacy source gained an unsupported blueprint manifest");
  }

  private async register(entry: RegistryEntry, manifest: ProjectManifest): Promise<RegisteredProject> {
    const root = this.projectRoot(entry.directory);
    await this.validateRoot(root, entry.kind === "blueprint", this.blueprintManifest!);
    await this.ensurePinnedDependencies(root);
    const liveManifest = ProjectManifestSchema.parse(JSON.parse(await readFile(path.join(root, ".stellar/project.json"), "utf8")));
    if (JSON.stringify(liveManifest) !== JSON.stringify(manifest)) throw new RegistryError("REGISTRY_CORRUPT", "Working copy project manifest changed");
    const workspace: RegisteredWorkspace = { id: entry.workspaceId, project: {
      id: entry.id, name: entry.name, renderer: "astro", capabilities: manifest.capabilities, pageCount: manifest.pages.length,
      blueprint: { id: entry.blueprintId, version: entry.blueprintVersion }, designSystem: { id: entry.designSystemId, version: entry.designSystemVersion },
    }, label: entry.label, sourceKind: "trusted-local-copy" };
    const metadata = path.join(this.dataReal!, "metadata", entry.directory);
    await this.assertOwnedDirectory(path.join(this.dataReal!, "metadata"), "Registry metadata directory changed location");
    await this.ensureDirectory(metadata, "Project metadata directory must not be a symlink");
    return { id: entry.id, workspaceId: entry.workspaceId, label: entry.label, root,
      metadata, manifest, workspace, kind: entry.kind };
  }

  private projectRoot(directory: string): string {
    if (!this.dataReal || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(directory)) throw new RegistryError("REGISTRY_CORRUPT", "Unsafe project directory");
    const root = path.join(this.dataReal, "copies", directory);
    if (path.dirname(root) !== path.join(this.dataReal, "copies")) throw new RegistryError("REGISTRY_CORRUPT", "Project directory escaped registry");
    return root;
  }
  private stagingRoot(id: string): string {
    if (!this.dataReal || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new RegistryError("REGISTRY_CORRUPT", "Unsafe staging directory");
    return path.join(this.dataReal, "copies", `.staging-${id}`);
  }
  private async removeStaging(id: string): Promise<void> {
    await this.assertOwnedDirectory(path.join(this.dataReal!, "copies"), "Registry copies directory changed location");
    const staging = this.stagingRoot(id);
    if (path.dirname(staging) !== path.join(this.dataReal!, "copies") || !path.basename(staging).startsWith(".staging-")) throw new RegistryError("REGISTRY_CORRUPT", "Unsafe staging cleanup");
    await rm(staging, { recursive: true, force: true });
  }
  private async assertOwnedDirectory(directory: string, message: string): Promise<void> {
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(directory) !== directory) throw new RegistryError("REGISTRY_CORRUPT", message);
  }
  private async safeExistingFile(root: string, relative: string): Promise<string> {
    let current = root;
    for (const part of relative.split("/")) { current = path.join(current, part); const info = await lstat(current); if (info.isSymbolicLink()) throw new RegistryError("REGISTRY_CORRUPT", "Blueprint path must not contain symlinks"); }
    const canonical = await realpath(current);
    if (!canonical.startsWith(`${root}${path.sep}`) || !(await lstat(canonical)).isFile()) throw new RegistryError("REGISTRY_CORRUPT", "Blueprint path escaped its root");
    return canonical;
  }
  private async validateSourceInventory(root: string, blueprint: BlueprintManifest): Promise<void> {
    const reviewed = new Set(blueprint.reviewedFiles.map((file) => file.path).filter((file) => file.startsWith("src/")));
    const actual = new Set<string>();
    const visit = async (relative: string): Promise<void> => {
      for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
        const child = `${relative}/${entry.name}`;
        if (entry.isSymbolicLink()) throw new RegistryError("REGISTRY_CORRUPT", "Blueprint source must not contain symlinks");
        if (entry.isDirectory()) await visit(child);
        else if (entry.isFile()) actual.add(child);
        else throw new RegistryError("REGISTRY_CORRUPT", "Blueprint source contains an unsupported entry");
      }
    };
    await visit("src");
    if (actual.size !== reviewed.size || [...actual].some((file) => !reviewed.has(file))) {
      throw new RegistryError("REGISTRY_CORRUPT", "Blueprint source contains an unreviewed file");
    }
  }
  private async saveRecord(): Promise<void> {
    if (!this.record || !this.dataReal) throw new RegistryError("REGISTRY_CORRUPT", "Registry is not initialized");
    this.validateRecord(this.blueprintManifest!);
    await this.assertOwnedDirectory(this.dataReal, "Registry data directory changed location");
    const registryFile = path.join(this.dataReal, "registry.json");
    if (await exists(registryFile)) {
      const info = await lstat(registryFile);
      if (info.isSymbolicLink() || !info.isFile()) throw new RegistryError("REGISTRY_CORRUPT", "Registry file must not be a symlink");
    }
    await durableJson(registryFile, this.record);
  }
  private async ensurePinnedDependencies(root: string): Promise<void> {
    const seedModules = path.join(this.seed, "node_modules"); const link = path.join(root, "node_modules");
    if (!(await exists(seedModules))) return;
    if (!(await exists(link))) { await symlink(seedModules, link, "dir"); return; }
    const linkInfo = await lstat(link);
    if (!linkInfo.isSymbolicLink() || await realpath(link) !== await realpath(seedModules)) throw new RegistryError("REGISTRY_CORRUPT", "Unreviewed project dependencies");
  }

  async validateExecutableFiles(project: RegisteredProject): Promise<void> {
    const { blueprint } = await this.loadBlueprint();
    const root = path.resolve(project.root); const info = await lstat(root);
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(root) !== root) throw new Error("Working copy escaped registry");
    const pinned = blueprint.reviewedFiles.filter((file) => project.kind === "blueprint" ? file.executable : legacyProtectedFiles.has(file.path));
    for (const reviewed of pinned) {
      const destination = await this.safeExistingFile(root, reviewed.path);
      if (digest(await readFile(destination)) !== reviewed.sha256) throw new Error("Executable fixture files changed");
    }
    const liveManifest = ProjectManifestSchema.parse(JSON.parse(await readFile(path.join(root, ".stellar/project.json"), "utf8")));
    if (JSON.stringify(liveManifest) !== JSON.stringify(project.manifest)) throw new Error("Fixture manifest changed");
    if (project.kind === "blueprint") {
      const localBlueprint = await this.safeExistingFile(root, ".stellar/blueprint.json");
      if (digest(await readFile(localBlueprint)) !== supportedBlueprintManifestSha256) throw new Error("Blueprint identity changed");
      await this.validateSourceInventory(root, blueprint);
    }
    if ((await readdir(root)).some((name) => name === ".env" || name.startsWith(".env."))) throw new Error("Unreviewed project environment file");
    await this.ensurePinnedDependencies(root);
    const astroPackage = path.join(this.seed, "node_modules", "astro", "package.json");
    if (!(await exists(astroPackage))) throw new Error("Pinned Astro dependencies are missing");
    const installed = JSON.parse(await readFile(astroPackage, "utf8")) as { version?: string };
    if (installed.version !== "7.3.2") throw new Error("Pinned Astro dependencies are missing");
  }

  get(projectId: string): RegisteredProject | undefined { return this.projects.get(projectId); }
  list(): RegisteredProject[] { return [...this.projects.values()]; }
}
