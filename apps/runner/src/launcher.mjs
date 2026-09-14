import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../../../", import.meta.url)));
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
if (!/^operator-[0-9a-f-]{36}$/.test(operatorId)) throw new Error("Invalid local operator identity");
const nonce = randomBytes(32).toString("base64url");
const secret = randomBytes(48).toString("base64url");
const appOrigin = "http://127.0.0.1:3210";
const env = {
  ...process.env,
  STELLAR_LOCAL_MODE: "1",
  STELLAR_APP_ORIGIN: appOrigin,
  STELLAR_RUNNER_URL: "http://127.0.0.1:4310",
  STELLAR_RUNNER_SECRET: secret,
  STELLAR_OPERATOR_ID: operatorId,
  STELLAR_BOOTSTRAP_NONCE: nonce,
  STELLAR_PREVIEW_HOST: "localhost",
  STELLAR_FIXTURE_SEED: path.join(repoRoot, "fixtures/astro-style-lab"),
  STELLAR_DATA_DIR: data,
};
const runner = spawn(process.execPath, [path.join(repoRoot, "apps/runner/dist/server.js")], {
  cwd: repoRoot, env, stdio: "inherit", detached: true,
});
const web = spawn("npm", ["run", "dev", "--workspace=@stellar/web", "--", "--hostname", "127.0.0.1", "--port", "3210"], {
  cwd: repoRoot, env, stdio: "inherit", detached: true,
});
process.stdout.write(`Connect the local operator at ${appOrigin}/connect#${nonce}\n`);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of [runner, web]) {
    if (child.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ } }
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
runner.on("exit", stop);
web.on("exit", stop);
await Promise.all([
  new Promise((resolve) => runner.on("exit", resolve)),
  new Promise((resolve) => web.on("exit", resolve)),
]);
