import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CreateProjectResponseSchema, ListBlueprintsResponseSchema, PROTOCOL_VERSION } from "@stellar/contracts";
import { Runner } from "./server.js";

const root = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
test("runner authenticates creation and replays concurrent creation into one usable runtime", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-project-dispatch-"));
  const runner = new Runner({ seed: path.join(root, "fixtures/astro-style-lab"), data,
    url: new URL("http://127.0.0.1:4399"), secret: "test-secret-that-is-at-least-32-chars", operatorId: "operator-create",
    appOrigin: "http://127.0.0.1:3299", previewHost: "localhost" });
  try {
    await runner.initialize();
    const catalog = ListBlueprintsResponseSchema.parse(await runner.dispatch("listBlueprints", { requestId: "catalog-proof" }, "operator-create"));
    assert.equal(catalog.blueprints.length, 1);
    const blueprint = catalog.blueprints[0]!;
    const command = { protocolVersion: PROTOCOL_VERSION, requestId: "creation-proof", name: "Client garden",
      blueprintId: blueprint.blueprint.id, blueprintVersion: blueprint.blueprint.version };
    const denied = await runner.dispatch("createProject", command, "other-operator") as { error: { code: string } };
    assert.equal(denied.error.code, "UNAUTHORIZED");
    for (const bad of [{ ...command, name: "../escape" }, { ...command, sourcePath: "/tmp/remote" }, { ...command, requestId: "../../id" }]) {
      const result = await runner.dispatch("createProject", bad, "operator-create") as { error: { code: string } };
      assert.equal(result.error.code, "INVALID_REQUEST");
    }
    assert.equal(runner.registry.list().length, 2);
    const [a, b] = await Promise.all([runner.dispatch("createProject", command, "operator-create"), runner.dispatch("createProject", command, "operator-create")]);
    const created = CreateProjectResponseSchema.parse(a);
    const retry = CreateProjectResponseSchema.parse(b);
    assert.equal(created.workspace.project.id, retry.workspace.project.id);
    assert.equal(runner.registry.list().length, 3);
    assert.equal(runner.workspaces.size, 3);
    assert.ok(runner.workspaces.get(created.workspace.project.id)?.currentRevision());
  } finally { await runner.shutdown(); await rm(data, { recursive: true, force: true }); }
});
