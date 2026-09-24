// Run from the repository root after npm run build:packages.
// In-memory reproduction only: no source reads, listeners or persisted state.
import { WorkspaceRuntime } from "../../../apps/runner/dist/workspace.js";
const runtime = new WorkspaceRuntime({ id: "probe", root: "/unused", metadata: "/unused", manifest: {} }, "/unused", "/unused", "probe");
let scheduled = 0;
let completed = 0;
const originalSerial = runtime.serial.bind(runtime);
runtime.serial = (task) => {
  scheduled++;
  return originalSerial(async () => {
    const result = await task();
    completed++;
    return result;
  });
};
runtime.refreshSource = async () => {
  await new Promise((resolve) => setTimeout(resolve, 650));
  return {};
};
runtime.startWatcher();
await new Promise((resolve) => setTimeout(resolve, 2100));
runtime.stopWatcher();
const observed = { scheduled, completed, outstanding: scheduled - completed };
await runtime.mutex;
console.log(JSON.stringify({ ...observed, completedAfterDrain: completed }));
