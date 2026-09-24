import { RunnerInUseError } from "./lease.js";

/** Local terminal diagnostics: never print arbitrary config/source values or secrets. */
export function startupErrorMessage(failure: unknown): string {
  if (failure instanceof RunnerInUseError) {
    return `Another Stellar runner (PID ${failure.ownerPid}) owns this saved-project directory. Stop its launcher with Ctrl-C before restarting. Your saved projects were not reset.`;
  }
  const code = failure && typeof failure === "object" && "code" in failure ? failure.code : undefined;
  if (code === "EADDRINUSE") return "The local runner port is already occupied. Stop the existing launcher or inspect the listener before restarting.";
  if (code === "ENOENT") return "A required local fixture or saved-project file is missing. Check the fixture checkout and saved-project paths; do not delete .stellar-local.";
  if (code === "EACCES" || code === "EPERM") return "The runner cannot access its local files or listener. Check directory permissions and local network access; do not delete saved projects.";
  const safeCauses = new Set([
    "Another local runner is recovering this data directory",
    "Another local runner is acquiring this data directory",
    "Unsafe local runner lease path", "Unsafe local runner owner path",
    "Local runner mode is disabled", "Runner secret is missing", "Operator ID is missing",
    "Unknown project registration", "Unsupported fixture manifest", "Working copy fixture manifest changed",
    "Unreviewed project dependencies", "Fixture seed must not be a symlink", "Working copy escaped registry",
  ]);
  if (failure instanceof Error && safeCauses.has(failure.message)) {
    return `${failure.message}. Check the local launcher configuration and saved-project registration; do not reset saved data.`;
  }
  return "Local runner initialization failed while validating configuration or saved projects. Check fixture and registry compatibility; your saved data has not been reset.";
}
