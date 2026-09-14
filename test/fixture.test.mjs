import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fixtureRoot, validateFixture } from "../scripts/check-fixture.mjs";

async function withFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "stellar-fixture-test-"));
  try {
    await cp(fixtureRoot, root, { recursive: true, filter: (path) => !/(?:^|\/)(?:node_modules|dist|\.astro)(?:\/|$)/.test(path) });
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function updateManifest(root, change) {
  const path = join(root, ".stellar/project.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  change(manifest);
  await writeFile(path, JSON.stringify(manifest));
}

test("fixture manifest agrees with actual authored source", async () => {
  const result = await validateFixture();
  assert.deepEqual(result.errors, []);
  assert.equal(result.pages, 2);
  assert.ok(result.targets >= 6 && result.rules >= 6);
});

test("schema-valid CSS identity cannot silently select a different element", () => withFixture(async (root) => {
  await updateManifest(root, (manifest) => { manifest.styleRules[0].override.selector = "#different-element"; });
  assert.match((await validateFixture(root)).errors.join("\n"), /do not bind to target owner/);
}));

test("missing fallback and additional token definition fail source validation", () => withFixture(async (root) => {
  const manifest = JSON.parse(await readFile(join(root, ".stellar/project.json"), "utf8"));
  const ref = manifest.styleRules[0].fallback;
  const path = join(root, ref.file);
  await writeFile(path, (await readFile(path, "utf8")).replace(ref.selector, ".fallback-was-removed") + "\n@media (max-width: 600px) { :root { --lab-space-action: 3rem; } }\n");
  const errors = (await validateFixture(root)).errors.join("\n");
  assert.match(errors, /CSS identity must match one rule/);
  assert.match(errors, /exactly one authored definition/);
}));

test("alias source must retain the manifest's declared reference", () => withFixture(async (root) => {
  const path = join(root, "src/styles/tokens.css");
  await writeFile(path, (await readFile(path, "utf8")).replace("var(--lab-color-action-base)", "#ffffff"));
  assert.match((await validateFixture(root)).errors.join("\n"), /Alias source differs/);
}));

test("CSS media identity includes the actual authored condition", () => withFixture(async (root) => {
  const path = join(root, "src/styles/site.css");
  await writeFile(path, (await readFile(path, "utf8")).replace("(max-width: 767px)", "(max-width: 766px)"));
  assert.match((await validateFixture(root)).errors.join("\n"), /CSS identity must match one rule/);
}));

test("source symlink cannot escape the fixture root", () => withFixture(async (root) => {
  const path = join(root, "src/styles/tokens.css");
  await rm(path);
  await symlink(join(fixtureRoot, "src/styles/tokens.css"), path);
  assert.match((await validateFixture(root)).errors.join("\n"), /Source path escapes fixture/);
}));
