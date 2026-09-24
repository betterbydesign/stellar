// An IPC-linked supervisor owns one process group, including Next's worker.
// Losing the launcher closes IPC even when it was killed without a signal handler.
import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command || !process.send) throw new Error("Managed children require a launcher IPC channel");

let stopping = false;
let child;
let group;
let forceTimer;
let finishTimer;

function signalGroup(signal) {
  if (!group) return;
  try { process.kill(-group, signal); } catch { /* group already exited */ }
}

function finish(code) {
  clearTimeout(forceTimer);
  clearTimeout(finishTimer);
  // The direct child may exit before its own workers. Retire the whole owned group.
  signalGroup("SIGKILL");
  process.exit(code);
}

function stop() {
  if (stopping) return;
  stopping = true;
  signalGroup("SIGTERM");
  forceTimer = setTimeout(() => signalGroup("SIGKILL"), 5000);
  finishTimer = setTimeout(() => finish(1), 6500);
}

process.on("disconnect", stop);
process.on("message", (message) => { if (message?.type === "stop") stop(); });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, stop);

child = spawn(command, args, {
  cwd: process.cwd(), env: process.env, detached: true,
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});
group = child.pid;
child.on("error", () => {
  process.stderr.write("Could not start a managed Stellar service. Check the local installation.\n");
  finish(1);
});
child.on("message", (message) => {
  if (message?.type === "stellar-runner-ready" && process.connected) {
    process.send(message, () => {});
  }
});
child.on("exit", (code) => finish(stopping ? 0 : code ?? 1));
if (!process.connected) stop();
