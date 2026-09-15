import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts/plan-content-import.mjs");
const fixture = (name) => join(root, `packages/content-import/fixtures/${name}.json`);
const fixtureArgs = ["--mapping", fixture("mapping"), "--source", fixture("source"), "--target", fixture("target")];
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8", timeout: 15_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.stderr, "");
  return { ...result, report: JSON.parse(result.stdout) };
}

test("offline CLI reproduces the synthetic plan without changing its inputs or requiring repo cwd", () => {
  const before = ["mapping", "source", "target"].map((name) => readFileSync(fixture(name), "utf8"));
  const first = run(fixtureArgs);
  const second = run(fixtureArgs, tmpdir());
  assert.equal(first.status, 0);
  assert.equal(first.report.readiness, "ready");
  assert.equal(first.report.writesAttempted, 0);
  assert.ok(first.report.operations.length > 0);
  assert.equal(second.stdout, first.stdout);
  assert.deepEqual(["mapping", "source", "target"].map((name) => readFileSync(fixture(name), "utf8")), before);
});

test("CLI returns sanitized machine-readable usage, missing-file and JSON failures", () => {
  const directory = mkdtempSync(join(tmpdir(), "stellar-content-plan-"));
  try {
    const secretMarker = "private-content-that-must-not-be-echoed";
    const malformed = join(directory, "invalid.json");
    writeFileSync(malformed, `{\"content\":\"${secretMarker}\"`);
    for (const args of [
      [],
      ["--unrecognized", secretMarker],
      [...fixtureArgs, "--source", fixture("source")],
      ["--mapping", join(directory, secretMarker), ...fixtureArgs.slice(2)],
      ["--mapping", malformed, ...fixtureArgs.slice(2)],
      ["--mapping", directory, ...fixtureArgs.slice(2)],
    ]) {
      const result = run(args);
      assert.equal(result.status, 1);
      assert.equal(result.report.readiness, "invalid");
      assert.equal(result.report.writesAttempted, 0);
      assert.equal(result.stdout.includes(secretMarker), false);
      assert.equal(result.stdout.includes(directory), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI rejects an unknown contract version and oversized file without leaking values", () => {
  const directory = mkdtempSync(join(tmpdir(), "stellar-content-plan-"));
  try {
    const mapping = JSON.parse(readFileSync(fixture("mapping"), "utf8"));
    const path = join(directory, "mapping.json");
    mapping.contractVersion = "private-unsupported-version";
    writeFileSync(path, JSON.stringify(mapping));
    const invalid = run(["--mapping", path, ...fixtureArgs.slice(2)]);
    assert.equal(invalid.status, 1);
    assert.equal(invalid.report.readiness, "invalid");
    assert.equal(invalid.stdout.includes(mapping.contractVersion), false);
    writeFileSync(path, " ".repeat(8 * 1024 * 1024 + 1));
    const oversized = run(["--mapping", path, ...fixtureArgs.slice(2)]);
    assert.equal(oversized.status, 1);
    assert.equal(oversized.report.diagnostics[0].code, "INPUT_FILE_LIMIT");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a valid incomplete source snapshot returns a blocked plan and exit two", () => {
  const directory = mkdtempSync(join(tmpdir(), "stellar-content-plan-"));
  try {
    const source = JSON.parse(readFileSync(fixture("source"), "utf8"));
    source.root.complete = false;
    const path = join(directory, "source.json");
    writeFileSync(path, JSON.stringify(source));
    const result = run(["--mapping", fixture("mapping"), "--source", path, "--target", fixture("target")]);
    assert.equal(result.status, 2);
    assert.equal(result.report.readiness, "blocked");
    assert.equal(result.report.writesAttempted, 0);
    assert.ok(result.report.diagnostics.some((item) => item.code === "INCOMPLETE_SOURCE_SNAPSHOT"));
    assert.equal(result.report.counts.create, 0);
    assert.equal(result.report.counts.update, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
