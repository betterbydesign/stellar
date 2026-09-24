import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const supervisor = fileURLToPath(new URL("./managed-child.mjs", import.meta.url));
const require = createRequire(import.meta.url);
const children = [];
let stopping = false;
let expectedStop = false;
const parent = process.ppid;

function stop(expected = false) {
  expectedStop ||= expected;
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.process.connected) child.process.send({ type: "stop" }, () => {});
  }
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => stop(true));
// npm/shell parents can disappear without forwarding a signal to this process.
const parentWatch = setInterval(() => { if (process.ppid !== parent) stop(true); }, 750);
parentWatch.unref();

function port(value, fallback) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1024 || number > 65535) throw new Error("Local service ports must be integers from 1024 to 65535.");
  return number;
}

async function assertPortAvailable(portNumber) {
  const probe = createServer();
  try {
    await new Promise((resolve, reject) => probe.once("error", reject).listen(portNumber, "127.0.0.1", resolve));
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      throw new Error(`Port ${portNumber} is already in use. If Stellar is already running, use its existing window. To restart, stop its launcher with Ctrl-C first. No second workspace was started.`);
    }
    throw new Error("Cannot open the local listener. Check local network permissions.");
  } finally { if (probe.listening) await new Promise(resolve => probe.close(resolve)); }
}

function start(args, cwd, env) {
  if (stopping) throw new Error("Local startup cancelled.");
  const processChild = spawn(process.execPath, [supervisor, process.execPath, ...args], {
    cwd, env, stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const child = { process: processChild, ended: false, code: null, runnerReady: false, done: null };
  child.done = new Promise(resolve => {
    processChild.once("error", () => { child.ended = true; child.code = 1; stop(); resolve(); });
    processChild.once("exit", code => { child.ended = true; child.code = code ?? 1; stop(); resolve(); });
  });
  processChild.on("message", message => { if (message?.type === "stellar-runner-ready") child.runnerReady = true; });
  children.push(child);
  return child;
}

async function waitFor(check, message, milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (stopping) throw new Error("Local startup stopped before both services were ready. See the service diagnostic above.");
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

async function main() {
  const appPort = port(process.env.STELLAR_APP_PORT, 3210);
  const runnerPort = port(process.env.STELLAR_RUNNER_PORT, 4310);
  if (appPort === runnerPort) throw new Error("The app and runner need different local ports.");
  await assertPortAvailable(appPort);
  await assertPortAvailable(runnerPort);
  const data = path.resolve(process.env.STELLAR_DATA_DIR ?? path.join(repoRoot, ".stellar-local"));
  await mkdir(data, { recursive: true, mode: 0o700 });
  const operatorFile = path.join(data, "operator-id");
  let operatorId;
  try { operatorId = (await readFile(operatorFile, "utf8")).trim(); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    operatorId = `operator-${randomUUID()}`;
    await writeFile(operatorFile, operatorId, { flag: "wx", mode: 0o600 });
  }
  if (!/^operator-[0-9a-f-]{36}$/.test(operatorId)) throw new Error("Invalid local operator identity; preserve the data directory and inspect its configuration.");
  const nonce = randomBytes(32).toString("base64url");
  const appOrigin = `http://127.0.0.1:${appPort}`;
  const env = {
    ...process.env,
    STELLAR_LOCAL_MODE: "1", STELLAR_APP_ORIGIN: appOrigin,
    STELLAR_RUNNER_URL: `http://127.0.0.1:${runnerPort}`,
    STELLAR_RUNNER_SECRET: randomBytes(48).toString("base64url"),
    STELLAR_OPERATOR_ID: operatorId, STELLAR_BOOTSTRAP_NONCE: nonce,
    STELLAR_PREVIEW_HOST: "localhost",
    STELLAR_FIXTURE_SEED: path.join(repoRoot, "fixtures/astro-style-lab"),
    STELLAR_DATA_DIR: data,
  };
  const runner = start([path.join(repoRoot, "apps/runner/dist/server.js")], repoRoot, env);
  await waitFor(() => runner.runnerReady, "Runner startup timed out; check the fixture and local permissions.", 30_000);
  // Direct Node invocation avoids extra npm/shell parents inside the service tree.
  start([require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(appPort)], path.join(repoRoot, "apps/web"), env);
  await waitFor(async () => {
    try {
      return (await fetch(`${appOrigin}/connect`, { redirect: "manual", signal: AbortSignal.timeout(1500) })).status === 200;
    } catch { return false; }
  }, "The web app did not become ready. Check its startup output.", 60_000);
  if (stopping) return;
  process.stdout.write(`Stellar is ready. Keep this terminal open; Ctrl-C stops the app, runner and previews.\nConnect the local operator at ${appOrigin}/connect#${nonce}\n`);
  await Promise.all(children.map(child => child.done));
  if (!expectedStop && children.some(child => child.code !== 0)) process.exitCode = 1;
}

try { await main(); }
catch (failure) {
  if (!expectedStop) {
    const message = failure?.code ? "Cannot prepare the local workspace. Check file permissions and the installation; preserve .stellar-local." : failure.message;
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
} finally {
  stop();
  await Promise.all(children.map(child => child.done));
  clearInterval(parentWatch);
}
