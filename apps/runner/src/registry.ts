import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, rename, symlink } from "node:fs/promises";
import path from "node:path";
import { ProjectManifestSchema, type ProjectManifest, type RegisteredWorkspace } from "@stellar/contracts";
import { copySeedFile, digest, durableJson, readJson } from "./storage.js";

export type RegisteredProject = {
  id: string;
  workspaceId: string;
  label: string;
  root: string;
  metadata: string;
  manifest: ProjectManifest;
  workspace: RegisteredWorkspace;
};

const definitions = [
  { id: "project-a", workspaceId: "workspace-a", label: "Working copy A", directory: "a" },
  { id: "project-b", workspaceId: "workspace-b", label: "Working copy B", directory: "b" },
] as const;
const protectedFiles = ["package.json", "package-lock.json", "astro.config.mjs", ".nvmrc"];
const reviewedFiles = [
  ...protectedFiles, ".stellar/project.json", "src/components/ContactMethod.astro",
  "src/components/FeatureCard.astro", "src/layouts/SiteLayout.astro",
  "src/pages/contact.astro", "src/pages/index.astro",
  "src/styles/site.css", "src/styles/tokens.css",
];

async function exists(file: string): Promise<boolean> {
  try { await lstat(file); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export class Registry {
  readonly projects = new Map<string, RegisteredProject>();

  constructor(readonly seed: string, readonly data: string) {}

  async initialize(): Promise<void> {
    const seedReal = await realpath(this.seed);
    if ((await lstat(this.seed)).isSymbolicLink()) throw new Error("Fixture seed must not be a symlink");
    const seedManifest = ProjectManifestSchema.parse(JSON.parse(await readFile(path.join(seedReal, ".stellar/project.json"), "utf8")));
    if (seedManifest.manifestVersion !== 1 || seedManifest.renderer !== "astro" || seedManifest.project.slug !== "astro-style-lab") {
      throw new Error("Unsupported fixture manifest");
    }
    await mkdir(path.join(this.data, "copies"), { recursive: true, mode: 0o700 });
    await mkdir(path.join(this.data, "metadata"), { recursive: true, mode: 0o700 });
    const dataReal = await realpath(this.data);
    const registryFile = path.join(this.data, "registry.json");
    if (await exists(registryFile)) {
      const record = await readJson(registryFile);
      if (JSON.stringify(record) !== JSON.stringify({ version: 1, entries: definitions })) throw new Error("Unknown project registration");
    }
    for (const definition of definitions) {
      const root = path.join(dataReal, "copies", definition.directory);
      if (!(await exists(root))) {
        const staging = `${root}.${randomUUID()}.tmp`;
        for (const relative of reviewedFiles) await copySeedFile(path.join(seedReal, relative), path.join(staging, relative));
        await rename(staging, root);
      }
      const rootReal = await realpath(root);
      if (rootReal !== root || path.dirname(rootReal) !== path.join(dataReal, "copies")) throw new Error("Working copy escaped registry");
      await this.ensurePinnedDependencies(root);
      const manifest = ProjectManifestSchema.parse(JSON.parse(await readFile(path.join(root, ".stellar/project.json"), "utf8")));
      if (JSON.stringify(manifest) !== JSON.stringify(seedManifest)) throw new Error("Working copy fixture manifest changed");
      const project = { id: definition.id, name: `${manifest.project.name} ${definition.directory.toUpperCase()}`, renderer: "astro" as const,
        capabilities: manifest.capabilities, pageCount: manifest.pages.length };
      this.projects.set(definition.id, {
        id: definition.id, workspaceId: definition.workspaceId, label: definition.label, root,
        metadata: path.join(dataReal, "metadata", definition.directory), manifest,
        workspace: { id: definition.workspaceId, project, label: definition.label, sourceKind: "trusted-local-copy" },
      });
    }
    if (!(await exists(registryFile))) await durableJson(registryFile, { version: 1, entries: definitions });
  }

  private async ensurePinnedDependencies(root: string): Promise<void> {
    const seedModules = path.join(this.seed, "node_modules");
    const link = path.join(root, "node_modules");
    if (!(await exists(seedModules))) return;
    if (!(await exists(link))) {
      await symlink(seedModules, link, "dir");
      return;
    }
    const linkInfo = await lstat(link);
    if (!linkInfo.isSymbolicLink() || await realpath(link) !== await realpath(seedModules)) throw new Error("Unreviewed project dependencies");
  }

  async validateExecutableFiles(project: RegisteredProject): Promise<void> {
    for (const relative of protectedFiles) {
      const source = path.join(this.seed, relative);
      const destination = path.join(project.root, relative);
      const info = await lstat(destination);
      if (!info.isFile() || info.isSymbolicLink() || digest(await readFile(source)) !== digest(await readFile(destination))) {
        throw new Error("Executable fixture files changed");
      }
    }
    const liveManifest = ProjectManifestSchema.parse(JSON.parse(await readFile(path.join(project.root, ".stellar/project.json"), "utf8")));
    if (JSON.stringify(liveManifest) !== JSON.stringify(project.manifest)) throw new Error("Fixture manifest changed");
    if ((await readdir(project.root)).some((name) => name === ".env" || name.startsWith(".env."))) throw new Error("Unreviewed project environment file");
    await this.ensurePinnedDependencies(project.root);
    const astroPackage = path.join(this.seed, "node_modules", "astro", "package.json");
    if (!(await exists(astroPackage))) throw new Error("Pinned Astro dependencies are missing");
    const installed = JSON.parse(await readFile(astroPackage, "utf8")) as { version?: string };
    if (installed.version !== "7.3.2") throw new Error("Pinned Astro dependencies are missing");
  }

  get(projectId: string): RegisteredProject | undefined { return this.projects.get(projectId); }
  list(): RegisteredProject[] { return [...this.projects.values()]; }
}
