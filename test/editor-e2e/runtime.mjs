import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";

export const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export async function waitFor(check, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(150);
  }
  throw new Error(`${description}: timed out`);
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
export async function fingerprint(directory) {
  const hash = createHash("sha256");
  async function walk(current, prefix = "") {
    for (const item of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (["node_modules", "dist", ".astro"].includes(item.name)) continue;
      const relative = prefix + item.name;
      if (item.isDirectory()) await walk(join(current, item.name), relative + "/");
      else if (item.isFile()) hash.update(relative).update("\0").update(await readFile(join(current, item.name))).update("\0");
    }
  }
  await walk(directory);
  return hash.digest("hex");
}
export async function startRuntime() {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), "stellar-editor-proof-")));
  const runnerPort = await freePort();
  let appPort = await freePort();
  while (runnerPort === appPort) appPort = await freePort();
  const appOrigin = `http://127.0.0.1:${appPort}`;
  const runnerOrigin = `http://127.0.0.1:${runnerPort}`;
  const nonce = randomBytes(32).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const seed = join(root, "fixtures/astro-style-lab");
  const data = join(temporary, "state");
  const children = new Set();
  const env = {
    PATH: dirname(process.execPath), HOME: temporary, TMPDIR: tmpdir(), NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1", STELLAR_LOCAL_MODE: "1", STELLAR_APP_ORIGIN: appOrigin,
    STELLAR_RUNNER_URL: runnerOrigin, STELLAR_RUNNER_SECRET: secret,
    STELLAR_BOOTSTRAP_NONCE: nonce, STELLAR_OPERATOR_ID: "operator-editor-proof",
    STELLAR_PREVIEW_HOST: "localhost", STELLAR_FIXTURE_SEED: seed, STELLAR_DATA_DIR: data,
  };
  function start(args, cwd = root) {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    child.log = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
      child.log = (child.log + chunk.toString()).slice(-12000).replaceAll(secret, "[redacted]").replaceAll(nonce, "[redacted]");
    });
    child.on("error", (error) => { child.failure = error; });
    child.on("exit", () => children.delete(child));
    children.add(child);
    return child;
  }
  async function stop(child) {
    if (!children.has(child)) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    await Promise.race([exited, sleep(5000)]);
    if (children.has(child)) { child.kill("SIGKILL"); await exited; }
  }
  async function ready(child, check, label) {
    await waitFor(async () => {
      if (!children.has(child) || child.failure) throw new Error(`${label} exited: ${child.log}`);
      try { return await check(); } catch { return false; }
    }, label);
  }
  let runner;
  async function startRunner() {
    runner = start([join(root, "apps/runner/dist/server.js")]);
    await ready(runner, async () => (await fetch(runnerOrigin + "/rpc", {
      method: "POST", headers: { authorization: `Bearer ${secret}`, "x-stellar-operator": env.STELLAR_OPERATOR_ID, "content-type": "application/json" },
      body: JSON.stringify({ method: "listProjects", params: { requestId: "proof-ready" } }), signal: AbortSignal.timeout(1500),
    })).status === 200, "Runner startup");
  }
  async function close() {
    for (const child of [...children]) await stop(child);
    await rm(temporary, { recursive: true, force: true });
    await rm(join(tmpdir(), `stellar-bootstrap-${createHash("sha256").update(nonce).digest("hex")}.used`), { force: true });
  }
  try {
    await startRunner();
    const app = start([join(root, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(appPort)], join(root, "apps/web"));
    await ready(app, async () => (await fetch(appOrigin + "/connect", { signal: AbortSignal.timeout(1500) })).status === 200, "App startup");
    return {
      appOrigin, connectUrl: appOrigin + "/connect#" + nonce, seed, data,
      async restartRunner() { await stop(runner); await startRunner(); },
      async stopServices() { for (const child of [...children]) await stop(child); },
      async buildEdited(directory = "a") {
        if (!/^(?:a|b|project-[a-zA-Z0-9-]+)$/.test(directory)) throw new Error("Invalid registered build directory");
        const child = start([join(seed, "node_modules/astro/bin/astro.mjs"), "build"], join(data, "copies", directory));
        const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
        if (code !== 0) throw new Error(`Independent edited build failed: ${child.log}`);
        return join(data, "copies", directory, "dist");
      }, close,
    };
  } catch (error) { await close(); throw error; }
}

export async function serveStatic(directory) {
  const canonical = await realpath(directory);
  const server = createHttpServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const candidate = resolve(canonical, "." + pathname + (pathname.endsWith("/") ? "index.html" : ""));
      const file = await realpath(candidate);
      if (!file.startsWith(canonical + sep)) { response.writeHead(403).end(); return; }
      const bytes = await readFile(file);
      const type = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream";
      response.writeHead(200, { "content-type": type }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}
