#!/usr/bin/env node
import { open } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { CONTENT_IMPORT_CONTRACT_VERSION, compileDryRun, InvalidInputError } from "@stellar/content-import";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const roles = ["mapping", "source", "target"];

function failure(code, input = "arguments", issues) {
  return {
    contractVersion: CONTENT_IMPORT_CONTRACT_VERSION,
    readiness: "invalid",
    writesAttempted: 0,
    diagnostics: issues ?? [{ input, path: "", code }],
  };
}

// Paths and parser messages can contain confidential source data. Reports name only
// the failed input role, never echo command-line values or JSON parser exceptions.
async function readInput(path, role) {
  let file;
  try {
    file = await open(path, "r");
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) {
      return { error: failure("INPUT_FILE_LIMIT", role) };
    }
    // A bounded read also handles a file growing after the stat check.
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    if (bytesRead > MAX_INPUT_BYTES) return { error: failure("INPUT_FILE_LIMIT", role) };
    try {
      return { value: JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")) };
    } catch {
      return { error: failure("INVALID_JSON", role) };
    }
  } catch {
    return { error: failure("INPUT_READ_FAILED", role) };
  } finally {
    await file?.close();
  }
}

async function main(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: npm run content:plan -- --mapping mapping.json --source source.json --target target.json\nOffline planning only. Exit codes: 0 ready, 1 invalid input/usage, 2 blocked. No writes or network calls.");
    return 0;
  }
  const paths = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const path = args[index + 1];
    const role = roles.find((value) => flag === `--${value}`);
    if (!role || paths.has(role) || !path || path.startsWith("--")) {
      console.log(JSON.stringify(failure("INVALID_ARGUMENTS"), null, 2));
      return 1;
    }
    paths.set(role, path);
  }
  if (paths.size !== roles.length) {
    console.log(JSON.stringify(failure("MISSING_ARGUMENTS"), null, 2));
    return 1;
  }
  const inputs = {};
  for (const role of roles) {
    const result = await readInput(paths.get(role), role);
    if (result.error) {
      console.log(JSON.stringify(result.error, null, 2));
      return 1;
    }
    inputs[role] = result.value;
  }
  try {
    const plan = compileDryRun(inputs);
    console.log(JSON.stringify(plan, null, 2));
    return plan.readiness === "ready" ? 0 : 2;
  } catch (error) {
    const report = error instanceof InvalidInputError
      ? failure("INVALID_INPUT", "contract", error.issues)
      : failure("PLANNING_FAILED", "contract");
    console.log(JSON.stringify(report, null, 2));
    return 1;
  }
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch {
  console.log(JSON.stringify(failure("INPUT_READ_FAILED"), null, 2));
  process.exitCode = 1;
}
