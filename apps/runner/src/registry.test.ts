import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { PROTOCOL_VERSION, type CreateProjectRequest } from "@stellar/contracts";
import { Registry, RegistryError } from "./registry.js";

const repo = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const seed = path.join(repo, "fixtures/astro-style-lab");
const legacyV1 = { version: 1, entries: [
  { id: "project-a", workspaceId: "workspace-a", label: "Working copy A", directory: "a" },
  { id: "project-b", workspaceId: "workspace-b", label: "Working copy B", directory: "b" },
] };
const request = (requestId: string, name: string): CreateProjectRequest => ({
  protocolVersion: PROTOCOL_VERSION, requestId, name, blueprintId: "astro-style-lab", blueprintVersion: "1.0.0",
});
const json = async (file: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;

test("v1 migration preserves legacy source and metadata while adding blueprint identity", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-registry-migrate-"));
  try {
    const initial = new Registry(seed, data);
    await initial.initialize();
    const css = path.join(initial.get("project-a")!.root, "src/styles/site.css");
    const metadataMarker = path.join(initial.get("project-a")!.metadata, "preserved.json");
    const changed = `${await readFile(css, "utf8")}\n/* preserved legacy change */\n`;
    await writeFile(css, changed);
    await writeFile(metadataMarker, "legacy-history");
    await writeFile(path.join(data, "registry.json"), JSON.stringify(legacyV1));

    const migrated = new Registry(seed, data);
    await migrated.initialize();
    assert.equal(await readFile(css, "utf8"), changed);
    assert.equal(await readFile(metadataMarker, "utf8"), "legacy-history");
    assert.deepEqual(migrated.list().map((project) => project.id), ["project-a", "project-b"]);
    assert.equal(migrated.get("project-a")!.workspace.project.name, "Fieldnote Studio style lab A");
    assert.deepEqual(migrated.get("project-a")!.workspace.project.blueprint, { id: "astro-style-lab", version: "1.0.0" });
    assert.equal((await json(path.join(data, "registry.json"))).version, 2);
  } finally { await rm(data, { recursive: true, force: true }); }
});

test("named creation is isolated, persistent and idempotent with changed-intent refusal", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-registry-create-"));
  try {
    const registry = new Registry(seed, data);
    await registry.initialize();
    const first = await registry.create(request("create-garden", "Client garden"));
    const retry = await registry.create(request("create-garden", "Client garden"));
    const second = await registry.create(request("create-orchard", "Client orchard"));
    assert.equal(first.status, "created");
    assert.equal(retry.status, "existing");
    assert.equal(retry.project.id, first.project.id);
    assert.notEqual(second.project.id, first.project.id);
    assert.match(path.basename(first.project.root), /^project-[a-f0-9]{24}$/);
    assert.notEqual(first.project.metadata, second.project.metadata);
    await assert.rejects(registry.create(request("create-garden", "Changed name")), (error: unknown) =>
      error instanceof RegistryError && error.code === "IDEMPOTENCY_CONFLICT");

    const firstCss = path.join(first.project.root, "src/styles/site.css");
    const secondCss = path.join(second.project.root, "src/styles/site.css");
    const secondBefore = await readFile(secondCss, "utf8");
    await writeFile(firstCss, `${await readFile(firstCss, "utf8")}\n/* first-only */\n`);
    assert.equal(await readFile(secondCss, "utf8"), secondBefore);

    const restarted = new Registry(seed, data);
    await restarted.initialize();
    assert.match(await readFile(path.join(restarted.get(first.project.id)!.root, "src/styles/site.css"), "utf8"), /first-only/);
    assert.equal((await restarted.create(request("create-garden", "Client garden"))).status, "existing");
  } finally { await rm(data, { recursive: true, force: true }); }
});

test("pending journal recovery removes only owned staging and binds one creation to one entry", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-registry-recovery-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "stellar-registry-outside-"));
  try {
    const registry = new Registry(seed, data);
    await registry.initialize();
    const created = await registry.create(request("recover-request", "Recovered project"));
    const registryFile = path.join(data, "registry.json");
    const record = await json(registryFile) as { entries: Array<Record<string, unknown>>; creations: Array<Record<string, unknown>> } & Record<string, unknown>;
    record.entries = record.entries.filter((entry) => entry.id !== created.project.id);
    record.creations[0]!.status = "pending";
    await writeFile(registryFile, JSON.stringify(record));
    const sentinel = path.join(outside, "sentinel.txt");
    await writeFile(sentinel, "safe");
    const staging = path.join(data, "copies", `.staging-${created.project.id}`);
    await symlink(outside, staging, "dir");

    const recovered = new Registry(seed, data);
    await recovered.initialize();
    assert.ok(recovered.get(created.project.id));
    assert.equal(await readFile(sentinel, "utf8"), "safe");

    const corrupt = await json(registryFile) as { entries: Array<Record<string, unknown>> } & Record<string, unknown>;
    const original = corrupt.entries.find((entry) => entry.id === created.project.id)!;
    corrupt.entries.push({ ...original, id: "project-corrupt", workspaceId: "workspace-corrupt", directory: "project-corrupt" });
    await writeFile(registryFile, JSON.stringify(corrupt));
    await assert.rejects(new Registry(seed, data).initialize(), (error: unknown) =>
      error instanceof RegistryError && error.code === "REGISTRY_CORRUPT");
  } finally {
    await rm(data, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("a pending request with only partial staging resumes without duplicating the project", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-registry-partial-"));
  try {
    const registry = new Registry(seed, data);
    await registry.initialize();
    const creationRequest = request("partial-request", "Partial recovery");
    const created = await registry.create(creationRequest);
    const registryFile = path.join(data, "registry.json");
    const record = await json(registryFile) as { entries: Array<Record<string, unknown>>; creations: Array<Record<string, unknown>> } & Record<string, unknown>;
    record.entries = record.entries.filter((entry) => entry.id !== created.project.id);
    record.creations[0]!.status = "pending";
    await writeFile(registryFile, JSON.stringify(record));
    await rm(created.project.root, { recursive: true, force: true });
    const staging = path.join(data, "copies", `.staging-${created.project.id}`);
    await mkdir(path.join(staging, "src/pages"), { recursive: true });
    await writeFile(path.join(staging, "src/pages/index.astro"), "partial");

    const restarted = new Registry(seed, data);
    await restarted.initialize();
    assert.equal(restarted.get(created.project.id), undefined);
    const resumed = await restarted.create(creationRequest);
    assert.equal(resumed.status, "created");
    assert.equal(resumed.project.id, created.project.id);
    assert.equal(restarted.list().filter((project) => project.id === created.project.id).length, 1);
  } finally { await rm(data, { recursive: true, force: true }); }
});

test("same-process retry registers a durably completed creation after metadata setup fails", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-registry-register-retry-"));
  try {
    const registry = new Registry(seed, data);
    await registry.initialize();
    const creationRequest = request("register-retry", "Registration retry");
    const hash = createHash("sha256").update(`stellar.project.v1\0${creationRequest.requestId}`).digest("hex");
    const projectId = `project-${hash.slice(0, 24)}`;
    const blockedMetadata = path.join(data, "metadata", projectId);
    await writeFile(blockedMetadata, "not-a-directory");
    await assert.rejects(registry.create(creationRequest), (error: unknown) =>
      error instanceof RegistryError && error.code === "REGISTRY_CORRUPT");
    assert.equal(registry.get(projectId), undefined);
    await unlink(blockedMetadata);
    const retry = await registry.create(creationRequest);
    assert.equal(retry.status, "existing");
    assert.equal(retry.project.id, projectId);
    assert.equal(registry.list().filter((project) => project.id === projectId).length, 1);
  } finally { await rm(data, { recursive: true, force: true }); }
});

test("registry, copies and metadata symlinks are refused without touching targets", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-registry-links-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "stellar-registry-links-outside-"));
  try {
    await symlink(outside, path.join(data, "copies"), "dir");
    await assert.rejects(new Registry(seed, data).initialize(), /copies directory must not be a symlink/);
    await unlink(path.join(data, "copies"));

    const registry = new Registry(seed, data);
    await registry.initialize();
    const created = await registry.create(request("link-project", "Link project"));
    await rm(created.project.metadata, { recursive: true, force: true });
    await symlink(outside, created.project.metadata, "dir");
    await assert.rejects(new Registry(seed, data).initialize(), /metadata directory must not be a symlink/);
    await unlink(created.project.metadata);

    const registryFile = path.join(data, "registry.json");
    await unlink(registryFile);
    const externalRegistry = path.join(outside, "registry.json");
    await writeFile(externalRegistry, JSON.stringify(legacyV1));
    await symlink(externalRegistry, registryFile);
    await assert.rejects(new Registry(seed, data).initialize(), /Registry file must not be a symlink/);
    assert.equal((await json(externalRegistry)).version, 1);
  } finally {
    await rm(data, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("created projects refuse source files outside the reviewed blueprint inventory", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-registry-inventory-"));
  try {
    const registry = new Registry(seed, data);
    await registry.initialize();
    const created = await registry.create(request("inventory-project", "Inventory project"));
    await writeFile(path.join(created.project.root, "src/pages/extra.astro"), "<h1>Unreviewed</h1>");
    await assert.rejects(registry.validateExecutableFiles(created.project), /unreviewed file/);
    await assert.rejects(new Registry(seed, data).initialize(), /unreviewed file/);
  } finally { await rm(data, { recursive: true, force: true }); }
});
