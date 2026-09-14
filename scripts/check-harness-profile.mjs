#!/usr/bin/env node
// Stellar's local profile check. The installed profile is the source for paths and
// commands; this script reports inconsistencies without changing the lock or repo.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), "..");
const staticFiles = [
  "AGENTS.md", "CLAUDE.md", "WORKFLOW.md", "harness.json", "harness.schema.json",
  "harness-lock.json", "README.md", "package.json", "package-lock.json", "skills-lock.json",
  "scripts/check-docs.mjs", "scripts/check-harness-drift.mjs",
  "scripts/check-harness-profile.mjs", "docs/README.md", "docs/agent-harness-setup.md",
  "docs/provenance/harness-adaptation.md",
];
const requiredScripts = ["dev", "lint", "typecheck", "test", "build", "verify", "verify:docs", "verify:harness"];
const ciCommands = ["npm ci", "npm run fixture:install", "npm run verify", "npm run build", "npm run verify:local", "npx playwright install --with-deps chromium", "npm run verify:editor"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function safeRepoPath(root, path) {
  if (typeof path !== "string" || !path || isAbsolute(path) || path.split(/[\\/]/).includes("..")) return null;
  return join(root, path);
}

export function validateSchema(schema, profile) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const check = ajv.compile(schema);
  if (check(profile)) return [];
  return (check.errors ?? []).map((error) => `${error.instancePath || "/"}: ${error.message}`);
}

export function validateFiles(root, profile) {
  const errors = [];
  const artifacts = profile.documentation?.artifacts ?? {};
  const paths = new Set([
    ...staticFiles,
    ...(profile.documentation?.intakeSet ?? []),
    profile.designSystem?.sourceOfTruth,
    profile.designSystem?.shippedImplementation,
    ...(profile.ci?.workflows ?? []),
    artifacts.architecture, artifacts.operationsLog, artifacts.statusDoc,
    artifacts.userGuides, artifacts.prds, artifacts.templates,
    profile.documentation?.planRoot, profile.documentation?.evidenceRoot,
    profile.documentation?.handoffRoot,
  ].filter(Boolean));
  for (const path of paths) {
    const target = safeRepoPath(root, path);
    if (!target) errors.push(`Unsafe repo path: ${path}`);
    else if (!existsSync(target)) errors.push(`Missing required file or directory: ${path}`);
  }

  const packagePath = join(root, "package.json");
  if (existsSync(packagePath)) {
    try {
      const pkg = readJson(packagePath);
      for (const name of requiredScripts) {
        if (typeof pkg.scripts?.[name] !== "string" || !pkg.scripts[name].trim()) {
          errors.push(`package.json is missing the root script: ${name}`);
        }
      }
      const verify = pkg.scripts?.verify ?? "";
      for (const name of ["lint", "typecheck", "test", "verify:docs", "verify:harness"]) {
        if (!verify.includes(`npm run ${name}`) && !(name === "test" && verify.includes("npm test"))) {
          errors.push(`package.json verify must run: npm run ${name} (or npm test)`);
        }
      }
      for (const [group, command] of Object.entries({lint:"npm run lint",typecheck:"npm run typecheck",test:"npm run test",build:"npm run build"})) {
        if (profile.verify?.[group]?.[0] !== command) errors.push(`verify.${group} must match root script ${command}`);
      }
    } catch (error) {
      errors.push(`package.json cannot be read: ${error.message}`);
    }
  }

  if (profile.packageManager?.installCmd !== "npm ci") errors.push("packageManager.installCmd must match CI clean install: npm ci");
  if (profile.ci?.jobs?.length !== 1 || profile.ci.jobs[0]?.name !== "Verify") {
    errors.push("ci.jobs must contain the single Verify job displayed by the workflow");
  }
  const workflow = profile.ci?.workflows?.[0];
  const workflowPath = workflow && safeRepoPath(root, workflow);
  if (workflowPath && existsSync(workflowPath) && statSync(workflowPath).isFile()) {
    const yaml = readFileSync(workflowPath, "utf8");
    if (!/^\s+name:\s*Verify\s*$/m.test(yaml)) errors.push(`${workflow} needs a job displayed as Verify`);
    let offset = 0;
    for (const command of ciCommands) {
      const next = yaml.indexOf(command, offset);
      if (next === -1) { errors.push(`${workflow} must run ${command} in the profile order`); break; }
      offset = next + command.length;
    }
    if (JSON.stringify(profile.ci.jobs?.[0]?.runs) !== JSON.stringify(ciCommands)) {
      errors.push("ci.jobs[0].runs must match the Verify workflow commands");
    }
  }
  return errors;
}

export function validateHarness(root = defaultRoot) {
  const errors = [];
  let schema, profile;
  try { schema = readJson(join(root, "harness.schema.json")); }
  catch (error) { return [`harness.schema.json cannot be read: ${error.message}`]; }
  try { profile = readJson(join(root, "harness.json")); }
  catch (error) { return [`harness.json cannot be read: ${error.message}`]; }
  try { errors.push(...validateSchema(schema, profile)); }
  catch (error) { errors.push(`Schema cannot be compiled: ${error.message}`); }
  if (errors.length === 0) errors.push(...validateFiles(root, profile));
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const errors = validateHarness();
  if (errors.length) {
    for (const error of errors) console.error(`Harness profile: ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Harness profile: valid schema, paths, package scripts, and CI commands.");
  }
}
