import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { lstat, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RegisteredProject } from "./registry.js";

type PreviewFailure = "PORT_BUSY" | "START_FAILED" | "COMPILER_ERROR" | "START_TIMEOUT" | "STOPPED";
export class PreviewError extends Error {
  constructor(readonly code: PreviewFailure) { super(code); }
}

const worker = fileURLToPath(new URL("../src/preview-worker.mjs", import.meta.url));
const integrationEntry = fileURLToPath(new URL("../src/preview-integration/index.mjs", import.meta.url));
const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

export class PreviewProcess {
  private child: ChildProcess | null = null;
  private processGroup: number | null = null;
  private stopping = false;
  private cancelled = false;
  private logTail = "";
  port: number | null = null;

  constructor(readonly project: RegisteredProject, readonly seed: string, readonly data: string, readonly onUnexpectedExit: () => void, readonly appOrigin?: string) {}

  async start(fixedPort?: number): Promise<string> {
    if (this.cancelled) throw new PreviewError("STOPPED");
    if (this.child) throw new Error("Preview already owned");
    const port = fixedPort ?? await freePort();
    const dependencyRoot = await realpath(path.join(this.seed, "node_modules"));
    const astroEntrypoint = path.join(dependencyRoot, "astro", "dist", "index.js");
    let integration = "-";
    try {
      const info = await lstat(integrationEntry);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("Invalid trusted preview integration");
      integration = integrationEntry;
    } catch (failure) {
      if ((failure as NodeJS.ErrnoException).code !== "ENOENT") throw failure;
    }
    const home = path.join(this.data, "worker-home");
    await mkdir(home, { recursive: true, mode: 0o700 });
    if (this.cancelled) throw new PreviewError("STOPPED");
    const child = spawn(process.execPath, [worker, this.project.root, astroEntrypoint, dependencyRoot, String(port), integration, this.appOrigin ?? "-"], {
      cwd: this.project.root,
      detached: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        PATH: path.dirname(process.execPath), HOME: home, TMPDIR: process.env.TMPDIR ?? "/tmp",
        NODE_ENV: "development", NO_COLOR: "1", CI: "1", ASTRO_TELEMETRY_DISABLED: "1",
      },
    });
    this.child = child;
    this.processGroup = child.pid ?? null;
    this.port = port;
    const capture = (bytes: Buffer) => { this.logTail = `${this.logTail}${bytes.toString("utf8")}`.slice(-4096)
      .replaceAll(this.project.root, "[working copy]").replaceAll(this.seed, "[fixture]").replaceAll(this.data, "[local data]"); };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.once("exit", () => {
      const unexpected = !this.stopping;
      this.child = null;
      if (unexpected) {
        this.killGroup("SIGKILL");
        this.processGroup = null;
        this.onUnexpectedExit();
      }
    });
    const deadline = Date.now() + 18_000;
    let failed: PreviewFailure | null = null;
    let listening = false;
    child.on("message", (message: unknown) => {
      if (message && typeof message === "object" && "type" in message && message.type === "listening") listening = true;
      if (message && typeof message === "object" && "type" in message && message.type === "failed") {
        failed = "code" in message && message.code === "PORT_BUSY" ? "PORT_BUSY" : "START_FAILED";
      }
    });
    while (Date.now() < deadline) {
      if (this.cancelled) throw new PreviewError("STOPPED");
      if (failed) { await this.stop(); throw new PreviewError(failed); }
      if (!this.child) throw new PreviewError(/port .*already in use|EADDRINUSE/i.test(this.logTail) ? "PORT_BUSY" : "START_FAILED");
      if (!listening) { await delay(100); continue; }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500), redirect: "manual" });
        if (response.ok && (await response.text()).includes("<html")) {
          const contact = await fetch(`http://127.0.0.1:${port}/contact/`, { signal: AbortSignal.timeout(1500), redirect: "manual" });
          if (contact.ok && (await contact.text()).includes("<html")) return `http://localhost:${port}/`;
          if (contact.status >= 500) { await this.stop(); throw new PreviewError("COMPILER_ERROR"); }
        }
        if (response.status >= 500) { await this.stop(); throw new PreviewError("COMPILER_ERROR"); }
      } catch (error) {
        if (error instanceof PreviewError) throw error;
      }
      await delay(250);
    }
    await this.stop();
    throw new PreviewError("START_TIMEOUT");
  }

  async stop(): Promise<void> {
    this.cancelled = true;
    const child = this.child;
    if (!child) { this.killGroup("SIGTERM"); this.processGroup = null; return; }
    this.stopping = true;
    try { child.send?.({ type: "stop" }); } catch { /* IPC already closed */ }
    const closed = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    await Promise.race([closed, delay(2000)]);
    if (this.child && child.pid) {
      this.killGroup("SIGTERM");
      await Promise.race([closed, delay(1000)]);
    }
    if (this.child && child.pid) {
      this.killGroup("SIGKILL");
      await Promise.race([closed, delay(1000)]);
    }
    this.killGroup("SIGKILL");
    this.child = null;
    this.processGroup = null;
    this.port = null;
    this.stopping = false;
  }

  diagnosticTail(): string { return this.logTail; }

  private killGroup(signal: NodeJS.Signals): void {
    if (!this.processGroup) return;
    try { process.kill(-this.processGroup, signal); } catch { /* process group already gone */ }
  }
}
