import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scanner = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-docs.mjs");
const commit = "800fa5270523e7df3afbcaeee8bdbb3a6fe07b49";
const airtable = "https://airtable.com/appctrC0fkefkHeK8/tblyECInojqSB7WF2/viw8b0xz2WntKE3Xd";

function withCheckout(markdown, check) {
  const root = mkdtempSync(join(tmpdir(), "stellar-docs-scanner-"));
  try {
    const init = spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    writeFileSync(join(root, "harness.json"), '{"branches":{"integration":"main"}}\n');
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs", "source.md"), markdown);
    const run = spawnSync(process.execPath, [scanner, "--all", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.doesNotThrow(() => JSON.parse(run.stdout), run.stderr);
    check(run, JSON.parse(run.stdout));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("--all scans untracked Markdown and accepts structural source citations", () => {
  withCheckout([
    `Stacki commit \`${commit}\`.`,
    `[Parser](https://github.com/flowtricks/stacki/blob/${commit}/electron/astroParser.js#L1)`,
    `[View](${airtable}?blocks=hide)`,
    "Adapter (`agent-hub/src/app/api/v1/settings/ai/providers/route.ts:12`).",
  ].join("\n"), (run, result) => {
    assert.equal(run.status, 0, run.stdout);
    assert.deepEqual(result.findings, []);
    assert.ok(result.scanned.includes("docs/source.md"));
  });
});

test("structural links do not hide query secrets, explicit tokens, or unrelated entropy", () => {
  const secret = "aB3cD4eF5gH6iJ7kL8mN9pQ0rS1tU2vW3xY4zA5bC6";
  withCheckout([
    `[View](${airtable}?token=${secret})`,
    `[Source](https://github.com/flowtricks/stacki/blob/${commit}/electron/main.js?payload=${secret})`,
    "password: correct-horse-battery-staple",
    "github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
    `Commit \`${commit}\`; unrelated value ${secret}`,
    `[Credential URL](https://${secret}@github.com/flowtricks/stacki/blob/${commit}/README.md)`,
  ].join("\n"), (run, result) => {
    assert.equal(run.status, 1, run.stdout);
    const secretLines = result.findings.filter((finding) => finding.kind === "secret").map((finding) => finding.line);
    for (const line of [1, 2, 3, 4, 5, 6]) assert.ok(secretLines.includes(line), `Missing secret finding on line ${line}`);
  });
});
