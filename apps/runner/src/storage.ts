import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, lstat, mkdir, open, readdir, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { RelativePathSchema, type ProjectManifest } from "@stellar/contracts";

export const digest = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
export const newId = (prefix: string): string => `${prefix}-${randomUUID()}`;

export async function durableJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
  await syncDirectory(path.dirname(file));
}

export async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function durableReplace(file: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, file);
  await syncDirectory(path.dirname(file));
}

export async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function safeSourcePath(root: string, relative: string): Promise<string> {
  if (!RelativePathSchema.safeParse(relative).success) throw new Error("Unsafe source path");
  const canonicalRoot = await realpath(root);
  if (canonicalRoot !== path.resolve(root)) throw new Error("Symlinked working copy");
  let current = canonicalRoot;
  for (const component of relative.split("/")) {
    current = path.join(current, component);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("Symlinked source path");
  }
  const resolved = await realpath(current);
  if (!resolved.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error("Source path escaped working copy");
  if (!(await stat(resolved)).isFile()) throw new Error("Source path is not a file");
  return resolved;
}

export async function snapshotPaths(root: string, manifest: ProjectManifest): Promise<string[]> {
  const paths = new Set<string>([".stellar/project.json"]);
  async function visit(relative: string): Promise<void> {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error("Symlinked source tree");
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && /\.(?:astro|css|js|mjs|ts|tsx|json)$/.test(entry.name)) paths.add(child);
    }
  }
  await visit("src");
  for (const relative of [...manifest.pages.map((page) => page.sourceFile), ...manifest.allowedCssFiles]) {
    if (!paths.has(relative)) throw new Error("Manifest source missing from snapshot");
  }
  return [...paths].sort();
}

export async function sourceSnapshot(root: string, manifest: ProjectManifest): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  let total = 0;
  for (const relative of await snapshotPaths(root, manifest)) {
    const file = await safeSourcePath(root, relative);
    const bytes = await readFile(file);
    total += bytes.length;
    if (bytes.length > 2_000_000 || total > 8_000_000) throw new Error("Source snapshot exceeds limit");
    result[relative] = bytes;
  }
  return result;
}

export function snapshotFingerprint(snapshot: Record<string, Uint8Array>): string {
  const hash = createHash("sha256");
  for (const relative of Object.keys(snapshot).sort()) {
    hash.update(relative); hash.update("\0"); hash.update(snapshot[relative]!); hash.update("\0");
  }
  return hash.digest("hex");
}

export async function copySeedFile(source: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await copyFile(source, destination, constants.COPYFILE_EXCL);
}

export async function removeIfExists(file: string): Promise<void> {
  try { await unlink(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
