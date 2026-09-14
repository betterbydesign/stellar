import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { root } from "./runtime.mjs";

export const evidenceDirectory = join(root, "output/playwright/m1-editor");
export async function sourceIdentity() {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0").filter((file) => /^(apps\/|packages\/|fixtures\/|scripts\/|test\/|package(?:-lock)?\.json$)/.test(file)).sort();
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update("\0").update(await readFile(join(root, file))).update("\0");
  return { baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), sourceSha256: hash.digest("hex"), fileCount: files.length };
}
export async function writeEvidence(name, value) {
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(join(evidenceDirectory, name), typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
}
export async function filesBelow(directory) {
  const files = [];
  async function visit(current) {
    for (const item of await readdir(current, { withFileTypes: true })) {
      if (item.isDirectory()) await visit(join(current, item.name));
      else if (item.isFile()) files.push(join(current, item.name));
    }
  }
  await visit(directory);
  return files.sort();
}
export async function assertCleanOutput(directory) {
  const forbidden = /data-stellar-|stellar:hello|stellar:init|__STELLAR_APP_ORIGIN__|stellar\.editor\.v1|STELLAR_RUNNER_SECRET/;
  for (const file of await filesBelow(directory)) {
    if (!/\.(?:html|js|css|json)$/.test(file)) continue;
    if (forbidden.test(await readFile(file, "utf8"))) throw new Error("Editor instrumentation leaked into " + relative(directory, file));
  }
}
