import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { RunnerInUseError } from "./lease.js";
import { freePort } from "./preview.js";
import { startupErrorMessage } from "./startup-error.js";

const root = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const supervisor = path.join(root, "apps/runner/src/managed-child.mjs");
const launcher = path.join(root, "apps/runner/src/launcher.mjs");
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) { if (await check()) return; await pause(50); }
  assert.fail("Process lifecycle condition timed out");
}
function capture(child: ChildProcess): () => string {
  let output = "";
  child.stdout?.on("data", chunk => { output += chunk; });
  child.stderr?.on("data", chunk => { output += chunk; });
  return () => output;
}
async function released(port: number): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolve, reject) => server.once("error", reject).listen(port, "127.0.0.1", resolve));
    return true;
  } catch { return false; }
  finally { if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); }
}

for (const termination of ["disconnect", "SIGTERM", "SIGHUP", "parent-death"] as const) {
  test(`managed service retires its child and descendant after ${termination}`, async (t) => {
    const portA = await freePort();
    let portB = await freePort();
    while (portB === portA) portB = await freePort();
    const descendant = `require('node:net').createServer().listen(${portB}, '127.0.0.1', () => process.send('ready'));`;
    const service = `
      const { spawn } = require('node:child_process');
      const server = require('node:net').createServer();
      server.listen(${portA}, '127.0.0.1', () => {
        const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio:['ignore','ignore','ignore','ipc']});
        child.on('message', () => console.log(JSON.stringify({pid:process.pid, ready:true})));
      });`;
    const args = [supervisor, process.execPath, "-e", service];
    const outer = `const {spawn}=require('node:child_process');spawn(process.execPath, ${JSON.stringify(args)}, {stdio:['ignore','inherit','inherit','ipc']});`;
    const child = spawn(process.execPath, termination === "parent-death" ? ["-e", outer] : args, {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const done = once(child, "exit");
    const output = capture(child);
    const owned = { pid: undefined as number | undefined };
    t.after(() => {
      child.kill("SIGKILL");
      if (owned.pid) { try { process.kill(-owned.pid, "SIGKILL"); } catch { /* gone */ } }
    });
    await until(() => output().includes('"ready":true'));
    owned.pid = (JSON.parse(output().trim()) as { pid: number }).pid;
    if (termination === "disconnect") child.disconnect();
    else child.kill(termination === "parent-death" ? "SIGKILL" : termination);
    await done;
    await until(async () => await released(portA) && await released(portB));
  });
}

test("startup diagnostics identify the lease owner and never print unknown values", () => {
  assert.match(startupErrorMessage(new RunnerInUseError(12345)), /PID 12345.*Stop its launcher/);
  assert.match(startupErrorMessage(Object.assign(new Error("private source"), { code: "EADDRINUSE" })), /port is already occupied/);
  assert.doesNotMatch(startupErrorMessage(new Error("secret=do-not-print")), /secret=|do-not-print/);
});

test("duplicate app port refuses startup before touching saved data or printing a link", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "stellar-duplicate-launch-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const data = path.join(directory, "untouched");
  const child = spawn(process.execPath, [launcher], { env: { ...process.env, STELLAR_APP_PORT: String(address.port), STELLAR_DATA_DIR: data }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { child.kill("SIGKILL"); });
  const output = capture(child);
  const [code] = await once(child, "exit");
  assert.equal(code, 1);
  assert.match(output(), /already in use/);
  assert.doesNotMatch(output(), /\/connect#/);
  await assert.rejects(access(data), { code: "ENOENT" });
});

test("runner initialization failure prevents the web server and connection link", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "stellar-bad-registration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const data = path.join(directory, "data"); await mkdir(data);
  await writeFile(path.join(data, "registry.json"), JSON.stringify({ unsupported: true }));
  const appPort = await freePort();
  let runnerPort = await freePort(); while (appPort === runnerPort) runnerPort = await freePort();
  const child = spawn(process.execPath, [launcher], { env: { ...process.env,
    STELLAR_APP_PORT: String(appPort), STELLAR_RUNNER_PORT: String(runnerPort), STELLAR_DATA_DIR: data,
  }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { child.kill("SIGKILL"); });
  const output = capture(child);
  const [code] = await once(child, "exit");
  assert.equal(code, 1);
  assert.match(output(), /Unknown project registration/);
  assert.doesNotMatch(output(), /\/connect#|Next.js/);
  assert.ok(await released(appPort));
  assert.ok(await released(runnerPort));
  await assert.rejects(access(path.join(data, ".runner-lease")), { code: "ENOENT" });
});
