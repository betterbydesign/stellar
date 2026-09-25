import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { AccountConnectionError, AccountConnectionStore } from "./account-connection.js";
import { Registry } from "./registry.js";
import { Runner, type RunnerConfig } from "./server.js";
import { durableJson } from "./storage.js";

const root = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const seed = path.join(root, "fixtures/astro-style-lab");
const operatorId = "operator-account-connection";
const account = { identityNamespace: "client_stellar_test", tenantId: "tenant_test", actorSubject: "user_test" };

function config(data: string): RunnerConfig {
  return { seed, data, url: new URL("http://127.0.0.1:4398/"), secret: "runner-secret-that-is-at-least-32-characters",
    operatorId, appOrigin: "http://127.0.0.1:3298", previewHost: "localhost" };
}

function errorCode(value: unknown): string | undefined {
  return (value as { error?: { code?: string } }).error?.code;
}

test("pairing, exact project binding, revocation, reconnect and restart fail closed", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-account-connection-"));
  const first = new Runner(config(data));
  try {
    await first.initialize();
    const installation = await first.dispatch("installationStatus", { requestId: "installation-1" }, operatorId) as {
      installationId: string;
    };
    assert.match(installation.installationId, /^installation-/);
    const offered = await first.dispatch("offerInstallationChallenge", { requestId: "offer-1", ...account }, operatorId) as {
      installationId: string; challengeId: string; challenge: string;
    };
    assert.equal(offered.installationId, installation.installationId);
    const confirmation = { requestId: "confirm-1", challengeId: offered.challengeId, challenge: offered.challenge, ...account };
    const connected = await first.dispatch("confirmInstallationChallenge", confirmation, operatorId) as {
      connectionId: string; status: string;
    };
    assert.equal(connected.status, "connected");
    const connectionScope = { requestId: "check-connected", installationId: installation.installationId,
      connectionId: connected.connectionId, identityNamespace: account.identityNamespace, tenantId: account.tenantId };
    assert.equal((await first.dispatch("checkInstallationConnection", connectionScope, operatorId) as { status: string }).status, "connected");
    assert.deepEqual(await first.dispatch("confirmInstallationChallenge", confirmation, operatorId), {
      protocolVersion: "stellar.editor.v1", requestId: "confirm-1", installationId: installation.installationId,
      connectionId: connected.connectionId, identityNamespace: account.identityNamespace, tenantId: account.tenantId,
      connectedAt: (await first.dispatch("confirmInstallationChallenge", confirmation, operatorId) as { connectedAt: string }).connectedAt,
      status: "connected",
    });
    assert.equal(errorCode(await first.dispatch("confirmInstallationChallenge", { ...confirmation, requestId: "confirm-reuse" }, operatorId)), "IDEMPOTENCY_CONFLICT");
    const replacementOffer = await first.dispatch("offerInstallationChallenge", { requestId: "offer-replacement", ...account }, operatorId) as {
      challengeId: string; challenge: string;
    };
    const replacementConfirmation = { requestId: "confirm-replacement", challengeId: replacementOffer.challengeId,
      challenge: replacementOffer.challenge, ...account };
    const replacement = await first.dispatch("confirmInstallationChallenge", replacementConfirmation, operatorId) as { connectionId: string };
    assert.notEqual(replacement.connectionId, connected.connectionId);
    assert.equal(errorCode(await first.dispatch("checkInstallationConnection", { ...connectionScope, requestId: "check-replaced" }, operatorId)), "UNAUTHORIZED");
    const activeConnectionId = replacement.connectionId;

    const provision = { requestId: "provision-1", installationId: installation.installationId,
      connectionId: activeConnectionId, identityNamespace: account.identityNamespace, tenantId: account.tenantId,
      accountProjectId: "account-project-test", name: "Test", blueprintId: "astro-style-lab", blueprintVersion: "1.0.0" };
    const ready = await first.dispatch("provisionAccountProject", provision, operatorId) as {
      status: string; registryProjectId: string;
    };
    assert.equal(ready.status, "ready");
    assert.equal(first.registry.list().length, 3);
    const recovered = await first.dispatch("provisionAccountProject", { ...provision, requestId: "provision-after-lost-response" }, operatorId) as {
      status: string; registryProjectId: string;
    };
    assert.equal(recovered.status, "existing");
    assert.equal(recovered.registryProjectId, ready.registryProjectId);
    assert.equal(first.registry.list().length, 3);
    assert.equal(errorCode(await first.dispatch("provisionAccountProject", { ...provision, requestId: "provision-changed", name: "Other" }, operatorId)), "IDEMPOTENCY_CONFLICT");
    assert.equal(errorCode(await first.dispatch("provisionAccountProject", { ...provision,
      accountProjectId: "account-project-other" }, operatorId)), "IDEMPOTENCY_CONFLICT");

    const binding = { installationId: installation.installationId, connectionId: activeConnectionId,
      identityNamespace: account.identityNamespace, tenantId: account.tenantId,
      accountProjectId: provision.accountProjectId, registryProjectId: ready.registryProjectId };
    const getProject = { requestId: "bound-get", binding, method: "getProject",
      params: { requestId: "bound-get", projectId: ready.registryProjectId } };
    const project = await first.dispatch("dispatchAccountProject", getProject, operatorId) as { workspace: { project: { id: string } } };
    assert.equal(project.workspace.project.id, ready.registryProjectId);
    assert.equal(errorCode(await first.dispatch("dispatchAccountProject", { ...getProject, requestId: "swap-account",
      binding: { ...binding, accountProjectId: "account-project-other" }, params: { requestId: "swap-account", projectId: ready.registryProjectId } }, operatorId)), "UNKNOWN_PROJECT");
    assert.equal(errorCode(await first.dispatch("dispatchAccountProject", { ...getProject, requestId: "swap-registry",
      binding: { ...binding, registryProjectId: "project-a" }, params: { requestId: "swap-registry", projectId: "project-a" } }, operatorId)), "UNKNOWN_PROJECT");
    assert.equal(errorCode(await first.dispatch("dispatchAccountProject", { ...getProject, requestId: "wrong-inner",
      params: { requestId: "wrong-inner", projectId: "project-a" } }, operatorId)), "INVALID_SCOPE");

    const revoked = await first.dispatch("revokeInstallationConnection", { requestId: "revoke-1",
      installationId: installation.installationId, connectionId: activeConnectionId,
      identityNamespace: account.identityNamespace, tenantId: account.tenantId }, operatorId) as { status: string };
    assert.equal(revoked.status, "revoked");
    assert.equal(errorCode(await first.dispatch("checkInstallationConnection", { ...connectionScope,
      requestId: "check-revoked", connectionId: activeConnectionId }, operatorId)), "UNAUTHORIZED");
    assert.equal(errorCode(await first.dispatch("dispatchAccountProject", { ...getProject, requestId: "after-revoke",
      params: { requestId: "after-revoke", projectId: ready.registryProjectId } }, operatorId)), "UNAUTHORIZED");
    assert.equal(errorCode(await first.dispatch("confirmInstallationChallenge", confirmation, operatorId)), "UNAUTHORIZED");
    assert.equal(errorCode(await first.dispatch("confirmInstallationChallenge", replacementConfirmation, operatorId)), "UNAUTHORIZED");

    const reconnectOffer = await first.dispatch("offerInstallationChallenge", { requestId: "offer-reconnect", ...account }, operatorId) as {
      challengeId: string; challenge: string;
    };
    const reconnected = await first.dispatch("confirmInstallationChallenge", { requestId: "confirm-reconnect",
      challengeId: reconnectOffer.challengeId, challenge: reconnectOffer.challenge, ...account }, operatorId) as { connectionId: string };
    assert.notEqual(reconnected.connectionId, activeConnectionId);
    const rebound = await first.dispatch("provisionAccountProject", { ...provision, requestId: "provision-reconnect",
      connectionId: reconnected.connectionId }, operatorId) as { registryProjectId: string };
    assert.equal(rebound.registryProjectId, ready.registryProjectId);
    await first.shutdown();

    const restarted = new Runner(config(data));
    try {
      await restarted.initialize();
      const persistent = await restarted.dispatch("installationStatus", { requestId: "installation-after-restart" }, operatorId) as {
        installationId: string;
      };
      assert.equal(persistent.installationId, installation.installationId);
      const restartedBinding = { ...binding, connectionId: reconnected.connectionId };
      const reopened = await restarted.dispatch("dispatchAccountProject", { requestId: "bound-after-restart",
        binding: restartedBinding, method: "getProject", params: { requestId: "bound-after-restart", projectId: ready.registryProjectId } }, operatorId) as {
        workspace: { project: { id: string } };
      };
      assert.equal(reopened.workspace.project.id, ready.registryProjectId);
    } finally { await restarted.shutdown(); }
  } finally {
    await first.shutdown();
    await rm(data, { recursive: true, force: true });
  }
});

test("expired challenges cannot be confirmed and offer retries do not mint replacements", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-account-challenge-"));
  let now = Date.parse("2026-09-24T12:00:00.000Z");
  try {
    const registry = new Registry(seed, data);
    await registry.initialize();
    const store = new AccountConnectionStore(data, registry, () => now, 1_000);
    await store.initialize();
    const offered = await store.offerChallenge({ requestId: "offer-expiring", ...account }) as { challengeId: string; challenge: string };
    now += 1_001;
    await assert.rejects(store.confirmChallenge({ requestId: "confirm-expired", challengeId: offered.challengeId,
      challenge: offered.challenge, ...account }), (error: unknown) =>
      error instanceof AccountConnectionError && error.code === "INVALID_SCOPE");
    await assert.rejects(store.offerChallenge({ requestId: "offer-expiring", ...account }), (error: unknown) =>
      error instanceof AccountConnectionError && error.code === "INVALID_SCOPE");
  } finally { await rm(data, { recursive: true, force: true }); }
});

test("an ambiguous post-rename write failure disables account authority until disk is reloaded", async () => {
  const data = await mkdtemp(path.join(os.tmpdir(), "stellar-account-ambiguous-write-"));
  try {
    const registry = new Registry(seed, data); await registry.initialize();
    let inject = false;
    const store = new AccountConnectionStore(data, registry, Date.now, 5 * 60_000, async (file, value) => {
      await durableJson(file, value);
      if (inject) throw new Error("injected directory sync ambiguity");
    });
    await store.initialize();
    const installation = store.installationStatus({ requestId: "ambiguous-installation" }) as { installationId: string };
    const offered = await store.offerChallenge({ requestId: "ambiguous-offer", ...account }) as { challengeId: string; challenge: string };
    inject = true;
    await assert.rejects(store.confirmChallenge({ requestId: "ambiguous-confirm", challengeId: offered.challengeId,
      challenge: offered.challenge, ...account }), /sync ambiguity/);
    assert.throws(() => store.installationStatus({ requestId: "ambiguous-live-check" }), (error: unknown) =>
      error instanceof AccountConnectionError && error.code === "RUNNER_UNAVAILABLE");

    const reloaded = new AccountConnectionStore(data, registry); await reloaded.initialize();
    const replay = await reloaded.confirmChallenge({ requestId: "ambiguous-confirm", challengeId: offered.challengeId,
      challenge: offered.challenge, ...account }) as { installationId: string; status: string };
    assert.equal(replay.installationId, installation.installationId);
    assert.equal(replay.status, "connected");
  } finally { await rm(data, { recursive: true, force: true }); }
});
