import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateSchema, validateFiles } from "../scripts/check-harness-profile.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(join(root, "harness.schema.json"), "utf8"));
const profile = JSON.parse(readFileSync(join(root, "harness.json"), "utf8"));

test("Stellar profile validates; unsupported integration and branch claims fail", () => {
  assert.deepEqual(validateSchema(schema, profile), []);
  const invalidBranch = structuredClone(profile);
  invalidBranch.branches.production = "release";
  assert.notEqual(validateSchema(schema, invalidBranch).length, 0);
  const invalidTracker = structuredClone(profile);
  invalidTracker.tracker = { system: "clickup" };
  assert.notEqual(validateSchema(schema, invalidTracker).length, 0);
});

test("profile file check identifies missing declared artifacts", () => {
  const invalid = structuredClone(profile);
  invalid.documentation.intakeSet.push("docs/absent-harness-artifact.md");
  assert.match(validateFiles(root, invalid).join("\n"), /Missing required file or directory: docs\/absent-harness-artifact.md/);
});
