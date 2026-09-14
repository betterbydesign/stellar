#!/usr/bin/env node
// The harness's own pre-merge gate.
//
// Adapted for Stellar from altitude-agent-harness at the ref in harness.json.
// See docs/provenance/harness-adaptation.md for the bounded changes.
//
// It runs in both contexts and detects which one it is in:
//
//   consumer repo   a `harness.json` sits at the repo root
//   template repo   `harness.schema.json` and `template/` sit at the repo root
//
// Two severity classes, deliberately separated:
//
//   HARD FAILURES (exit 1) — the landmine and correctness class. A denied string, an
//     absolute local path, a broken relative link, a denied path, a forbidden lockfile,
//     an unpinned vendored skill, a hand-edited generated file, or a profile invariant
//     that JSON Schema cannot express. These are wrong in any repo, so CI gates on them.
//
//   DRIFT REPORTS (exit 0) — the template-versus-copy class. A verbatim harness file
//     whose bytes no longer match what `harness-lock.json` recorded. Informational by
//     default because an intentional local customization looks identical to a stale
//     copy; the difference is whether someone re-locked it. `--strict` promotes drift
//     to exit 1.
//
// The repo profile and authored AGENTS.md are not hash-compared. CLAUDE.md remains
// a verbatim pointer and is hash-compared after the installed lock is recorded.
//
// Usage:
//   node scripts/check-harness-drift.mjs [--strict] [--update-lock] [--json]
//
// Exit codes: 0 clean or drift-only · 1 hard failure (or drift under --strict) · 2 usage
// or internal error.
//
// Dependency-free, Node >= 18, deterministic.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const SELF_RELATIVE_PATHS = new Set([
  "scripts/check-harness-drift.mjs",
  "template/scripts/check-harness-drift.mjs",
]);

// ─────────────────────────────────────────────────────────────────────────────
// BEGIN DENY LIST — do not scan this block against itself.
//
// These are the landmine strings from the extraction manifest, quoted verbatim,
// because naming them is this constant's entire job. Both copies of this script are
// excluded from the string scan (SELF_RELATIVE_PATHS above) for that reason, and so is
// the repo profile: `harness.json` legitimately names `bun.lock` under
// `packageManager.forbiddenLockfiles`, which is the one place a denied token is data
// rather than a leak.
//
//   word: true   match on word boundaries. `bun` must not fire on `ubuntu-latest`.
//   ci: true     case-insensitive for source-only identities.
// ─────────────────────────────────────────────────────────────────────────────
const DENIED_STRINGS = [
  // Absolute local paths. A ported document naming one points at a private checkout
  // that does not exist in the repo reading it, and fails silently rather than loudly.
  { s: "/Users/", why: "absolute local path" },
  { s: "/mnt/project/", why: "absolute local path" },
  { s: "/opt/cursor/", why: "absolute local path" },

  // Deployment identities belonging to the repo the harness was extracted from.
  { s: "dapper-ocelot-392", ci: true, word: true, why: "source-repo deployment identity" },
  { s: "brilliant-vulture-113", ci: true, word: true, why: "source-repo deployment identity" },
  { s: "knowing-herring-890", ci: true, word: true, why: "source-repo deployment identity" },
  { s: "altitude:apex-studio", ci: true, why: "source-repo deployment identity" },
  { s: "apex.altitudemarketing.com", ci: true, why: "source-repo deployment hostname" },
  { s: "apex-staging.altitudemarketing.com", ci: true, why: "source-repo deployment hostname" },

  // Tracker coordinates belonging to the source project. A live ID sends an agent into
  // the wrong workspace, which is worse than no ID at all.
  { s: "901326963828", word: true, why: "source-project tracker list id" },
  { s: "901312722249", word: true, why: "source-project tracker space id" },
  { s: "86ahz1kt2", ci: true, word: true, why: "live tracker task id from the source project" },
  { s: "86ahnfm0x", ci: true, word: true, why: "live tracker task id from the source project" },
  { s: "86ahz1kav", ci: true, word: true, why: "live tracker task id from the source project" },
  { s: "Social Media Hub", ci: true, word: true, why: "source-project tracker list name" },

  // Product and repo names from the source project.
  { s: "apex-studio", ci: true, word: true, why: "source-project name" },

  // Tooling and stack that is out of scope for every repo this template installs into.
  { s: "Greptile", ci: true, word: true, why: "retired reviewer" },
  { s: "bun", ci: true, word: true, why: "out-of-scope package manager" },
  { s: "bunx", ci: true, word: true, why: "out-of-scope package manager" },
];

// Absolute local paths in Markdown, beyond the three named above. Deliberately narrow:
// `/usr/local/bin/...` is a real system path a workflow may legitimately write to, and
// flagging it would train readers to ignore this check.
const ABSOLUTE_PATH_PATTERNS = [
  { re: /\/Users\/[^\s`"')\]]*/g, why: "absolute macOS home path" },
  { re: /\/home\/[^\s`"')\]]*/g, why: "absolute Linux home path" },
  { re: /\/Volumes\/[^\s`"')\]]*/g, why: "absolute macOS volume path" },
  { re: /\/mnt\/[^\s`"')\]]*/g, why: "absolute mount path" },
  { re: /\/opt\/cursor\/[^\s`"')\]]*/g, why: "absolute agent-host artifact path" },
  { re: /\b[A-Za-z]:\\[A-Za-z0-9_.\\-]+/g, why: "absolute Windows path" },
];

// Paths that must never appear in a repo carrying this harness. Presence is judged from
// what git would commit — tracked files plus untracked files that are not ignored —
// because most of these are ignored in the template repo and only ever arrive through a
// filesystem copy. `.env.example` is deliberately absent: it is supposed to be committed.
const DENIED_PATHS = [
  { prefix: ".specstory/", why: "editor transcript state; ~700 files of context noise" },
  {
    exact: ".cursor/rules/derived-cursor-rules.mdc",
    why: "auto-generated from old chat history and applied repo-wide",
  },
  { prefix: ".cursor/hooks/state/", why: "per-machine hook state containing absolute local paths" },
  { prefix: ".cursor/plans/", why: "stale per-repo agent plan artifacts" },
  { prefix: ".codex/environments/", why: "autogenerated host environment file; has leaked a secrets path" },
  { exact: ".claude/settings.local.json", why: "per-person tool permission allowlist" },
  { exact: ".env", why: "real secrets file" },
  { exact: ".env.local", why: "real secrets file" },
  { re: /^\.env\.[^/]*\.local$/, why: "real secrets file" },
];

// ─────────────────────────────────────────────────────────────────────────────
// END DENY LIST
// ─────────────────────────────────────────────────────────────────────────────

// The harness-managed file set, as one constant. Paths are relative to a CONSUMER repo
// root. Nothing outside this set is ever scanned: a consumer repo's own application code
// is out of scope, and scanning it would fire the deny list on words that are perfectly
// legitimate in that repo.
//
//   table "A"  copy-verbatim. Hash-locked in harness-lock.json; an unexpected edit is
//              drift. Mirrors PORTING.md table A.
//   table "B"  copy-then-fill. Never hash-locked, because the filled values are supposed
//              to differ per repo. Scanned for landmines and checked by the invariants.
//
//   from       "template" — ships from template/<templatePath ?? path>
//              "variant"  — ships from variants/<role>/<path>
//              "authored" — the consumer writes it; exists only in a consumer repo
//   dir        the entry names a directory; every file under it is in scope
//   scan       false to exclude from the string/link scans (see harness.json above)
//   seeded     true for a living document the harness ships as an empty shell and then
//              REQUIRES the loop to write into every session — the status doc and the
//              operations log. Their skeleton is copy-verbatim, but their content is
//              supposed to diverge immediately, so hash-locking them would report drift
//              on every task and train readers to ignore the drift section. Still
//              scanned; just never locked.
const MANIFEST = [
  // Table A — copy verbatim.
  { path: "WORKFLOW.md", table: "A", from: "template" },
  { path: "docs/README.md", table: "A", from: "template" },
  { path: "docs/agent-rules.md", table: "A", from: "template" },
  { path: "docs/PLANS.md", table: "A", from: "template" },
  { path: "docs/current-work.md", table: "A", from: "template", seeded: true },
  { path: "docs/agent-harness-setup.md", table: "A", from: "template" },
  { path: "docs/agent-operations-log.md", table: "A", from: "template", seeded: true },
  { path: "docs/templates/clickup-task-handoff.md", table: "A", from: "template" },
  { path: "docs/templates/completion-summary.md", table: "A", from: "template" },
  { path: "docs/templates/prd.md", table: "A", from: "template" },
  { path: "docs/templates/progress-comment.md", table: "A", from: "template" },
  { path: "docs/templates/session-start-checklist.md", table: "A", from: "template" },
  { path: "docs/templates/session-finish-checklist.md", table: "A", from: "template" },
  { path: "docs/exec-plans/active/README.md", table: "A", from: "template" },
  { path: "docs/exec-plans/completed/README.md", table: "A", from: "template" },
  { path: "docs/exec-plans/archived/README.md", table: "A", from: "template" },
  { path: "docs/reviews/README.md", table: "A", from: "template" },
  // The reviewer-lessons filename comes from the profile's review.primary. Resolved
  // from documentation.artifacts.reviewLessons when a profile is present.
  { path: "docs/architecture/README.md", table: "A", from: "template" },
  { path: "docs/archive/README.md", table: "A", from: "template" },
  { path: "docs/user-guide/README.md", table: "A", from: "template" },
  { path: "docs/user-guide/_template.md", table: "A", from: "template" },
  { path: "docs/handoffs/.gitkeep", table: "A", from: "template" },
  { path: "docs/evidence/.gitkeep", table: "A", from: "template" },
  { path: "docs/prds/.gitkeep", table: "A", from: "template" },
  { path: ".agents/skills/README.md", table: "A", from: "template" },
  { path: "skills-lock.json", table: "A", from: "template" },
  { path: ".cursor/rules/agent-harness.mdc", table: "A", from: "template" },
  { path: ".cursor/commands/cu-close.md", table: "A", from: "template" },
  { path: ".claude/commands/cu-close.md", table: "A", from: "template" },
  { path: ".claude/commands/doc-it.md", table: "A", from: "template" },
  { path: ".codex/prompts/cu-close.md", table: "A", from: "template" },
  { path: "scripts/check-harness-drift.mjs", table: "A", from: "template", scan: false },
  { path: "scripts/check-docs.mjs", table: "A", from: "template", scan: false },

  // Table B — authored for Stellar.
  { path: "harness.json", table: "B", from: "authored", scan: false },
  { path: "AGENTS.md", table: "B", from: "authored" },
  // CLAUDE.md is a verbatim pointer at AGENTS.md — AGENTS.md is the one canonical
  // per-repo instruction file for every host, so this file carries no repo content
  // and is hash-locked like any other table-A file.
  { path: "CLAUDE.md", table: "A", from: "template" },
  { path: "harness.schema.json", table: "A", from: "authored", scan: false },
  { path: "scripts/check-harness-profile.mjs", table: "A", from: "authored", scan: false },
  { path: "docs/provenance/harness-adaptation.md", table: "A", from: "authored" },
  { path: ".github/workflows", table: "B", from: "authored", dir: true },
];

// Paths a consumer repo creates during install that a harness document may legitimately
// link to. Only used when resolving relative links against the template repo's virtual
// consumer tree, where these files do not exist yet.
const INSTALL_CREATED_PATHS = ["README.md", ".gitignore", "harness-lock.json"];

const ROLES = ["nextjs"];
const LOCK_FILE = "harness-lock.json";
const LOCK_VERSION = 1;

// The three per-host closeout commands are one prompt in three wrappers. In the template
// repo the generator settles it; in a consumer repo there is no generator, so the check
// is that the bodies agree once the documented host framing is removed.
const CU_CLOSE_HOSTS = [
  ".cursor/commands/cu-close.md",
  ".claude/commands/cu-close.md",
  ".codex/prompts/cu-close.md",
];

// ── small helpers ────────────────────────────────────────────────────────────

const toPosix = (p) => p.split(sep).join("/");

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMPILED_DENIED = DENIED_STRINGS.map((entry) => ({
  ...entry,
  re: new RegExp(
    entry.word ? `\\b${escapeRegExp(entry.s)}\\b` : escapeRegExp(entry.s),
    entry.ci ? "gi" : "g"
  ),
}));

function walkFiles(dir, base = dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, base, out);
    else if (entry.isFile()) out.push(toPosix(full.slice(base.length + 1)));
  }
  return out;
}

function sha256File(path) {
  return `sha256-${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function sha256Directory(dir) {
  const hash = createHash("sha256");
  for (const relPath of walkFiles(dir).sort()) {
    hash.update(relPath);
    hash.update("\0");
    hash.update(readFileSync(join(dir, relPath)));
    hash.update("\0");
  }
  return `sha256-${hash.digest("hex")}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isTextLike(consumerPath) {
  return /\.(md|mdc|ya?ml|json|mjs|c?js|txt)$/i.test(consumerPath) || !consumerPath.includes(".");
}

const isMarkdown = (consumerPath) => /\.(md|mdc)$/i.test(consumerPath);

// ── report collection ────────────────────────────────────────────────────────

class Report {
  constructor() {
    this.hard = [];
    this.drift = [];
    this.notes = [];
    this.checks = new Set();
  }
  fail(kind, path, message, extra = {}) {
    this.hard.push({ kind, path, message, ...extra });
  }
  report(status, path, message) {
    this.drift.push({ status, path, message });
  }
  note(message) {
    this.notes.push(message);
  }
  ran(name) {
    this.checks.add(name);
  }
}

// ── context detection ────────────────────────────────────────────────────────

function detectContext(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "harness.json"))) return { context: "consumer", root: dir };
    if (existsSync(join(dir, "harness.schema.json")) && existsSync(join(dir, "template"))) {
      return { context: "template", root: dir };
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Resolve the manifest into concrete (real path, consumer path) pairs for one context.
// In the template repo a variant file resolves once per role, because both ship.
function resolveManifest({ context, root, role, profile }) {
  const reviewLessons = profile?.documentation?.artifacts?.reviewLessons;
  const files = [];

  const push = (entry, consumerPath, realRelative) => {
    const realPath = join(root, realRelative);
    if (!existsSync(realPath)) return;
    files.push({
      entry,
      table: entry.table,
      consumerPath,
      realRelative: toPosix(realRelative),
      realPath,
      scan: entry.scan !== false,
    });
  };

  for (const entry of MANIFEST) {
    let consumerPath = entry.path;
    if (entry.id === "reviewLessons" && typeof reviewLessons === "string") {
      consumerPath = reviewLessons;
    }

    // In a consumer repo everything already sits at its installed path — the skeletons
    // were renamed on the way in, so only the installed name exists.
    let realRelative;
    if (context === "consumer") {
      realRelative = consumerPath;
    } else if (entry.from === "template") {
      realRelative = join("template", entry.templatePath ?? consumerPath);
    } else if (entry.from === "variant") {
      realRelative = join("variants", role, consumerPath);
    } else {
      continue; // "authored" files exist only in a consumer repo.
    }

    if (!entry.dir) {
      push(entry, consumerPath, realRelative);
      continue;
    }
    const dirPath = join(root, realRelative);
    if (!existsSync(dirPath)) continue;
    for (const child of walkFiles(dirPath)) {
      push(entry, `${consumerPath}/${child}`, join(realRelative, child));
    }
  }
  return files;
}

// ── HARD: denied strings ─────────────────────────────────────────────────────

function checkDeniedStrings(files, report) {
  report.ran("denied strings");
  for (const file of files) {
    if (!file.scan || !isTextLike(file.consumerPath)) continue;
    if (SELF_RELATIVE_PATHS.has(file.realRelative)) continue;
    const lines = readFileSync(file.realPath, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const denied of COMPILED_DENIED) {
        denied.re.lastIndex = 0;
        const match = denied.re.exec(line);
        if (!match) continue;
        report.fail("denied-string", file.realRelative, `"${match[0]}" — ${denied.why}`, {
          line: index + 1,
        });
      }
    });
  }
}

// ── HARD: absolute local paths in Markdown ───────────────────────────────────

function checkAbsolutePaths(files, report) {
  report.ran("absolute local paths");
  for (const file of files) {
    if (!file.scan || !isMarkdown(file.consumerPath)) continue;
    if (SELF_RELATIVE_PATHS.has(file.realRelative)) continue;
    const lines = readFileSync(file.realPath, "utf8").split("\n");
    lines.forEach((line, index) => {
      for (const pattern of ABSOLUTE_PATH_PATTERNS) {
        pattern.re.lastIndex = 0;
        const match = pattern.re.exec(line);
        if (!match) continue;
        report.fail("absolute-path", file.realRelative, `"${match[0]}" — ${pattern.why}`, {
          line: index + 1,
        });
      }
    });
  }
}

// ── HARD: denied paths ───────────────────────────────────────────────────────

function checkDeniedPaths(root, report) {
  report.ran("denied paths");
  const git = spawnSync("git", ["-C", root, "ls-files", "-c", "-o", "--exclude-standard"], {
    encoding: "utf8",
  });

  let candidates;
  if (git.status === 0) {
    candidates = git.stdout.split("\n").filter(Boolean);
  } else {
    // Not a git checkout. Fall back to what is on disk, which over-reports ignored local
    // state — but a repo with no git is not the case this check is protecting.
    candidates = walkFiles(root);
    report.note("git is unavailable here; denied paths were judged from disk contents.");
  }

  for (const denied of DENIED_PATHS) {
    const hits = candidates.filter((path) => {
      if (denied.exact) return path === denied.exact;
      if (denied.prefix) return path.startsWith(denied.prefix);
      return denied.re.test(path);
    });
    for (const hit of hits.slice(0, 5)) {
      report.fail("denied-path", hit, denied.why);
    }
    if (hits.length > 5) {
      report.fail("denied-path", `${denied.exact ?? denied.prefix ?? denied.re}`, `and ${hits.length - 5} more`);
    }
  }
}

// ── HARD: relative links ─────────────────────────────────────────────────────

// Fence handling is kept identical to check-docs.mjs on purpose: two gates that disagree
// about where a code block starts disagree about which links they check.
function stripFencedCode(text) {
  const out = [];
  let fence = null;
  for (const line of text.split("\n")) {
    // Spaces only, never `\s`: a tab makes the line indented code rather than a fence, so
    // treating it as fence indentation opens a block that never closes and hides every
    // link below it from the broken-link check.
    const opener = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      out.push("");
      if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length) fence = null;
      continue;
    }
    // A backtick fence's info string may not itself contain a backtick, so a prose line
    // that happens to start with backticks and goes on to quote more of them is not an
    // opener. Tilde fences carry no such restriction.
    if (opener && (opener[1][0] === "~" || !line.slice(opener[0].length).includes("`"))) {
      fence = opener[1];
      out.push("");
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function extractLinkTargets(text) {
  const found = [];
  const body = stripFencedCode(text);
  const lines = body.split("\n");
  const inline = /!?\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
  const reference = /^\s{0,3}\[[^\]]+\]:\s*<?([^>\s]+)>?/;
  lines.forEach((line, index) => {
    inline.lastIndex = 0;
    let match;
    while ((match = inline.exec(line)) !== null) found.push({ target: match[1], line: index + 1 });
    const ref = line.match(reference);
    if (ref) found.push({ target: ref[1], line: index + 1 });
  });
  return found;
}

function normalizeLinkTarget(target) {
  if (!target) return null;
  if (target.startsWith("#")) return null; // same-document anchor
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null; // http:, mailto:, etc.
  if (target.startsWith("//")) return null; // protocol-relative
  if (target.includes("<") || target.includes(">")) return null; // `<task-id>` placeholder
  const withoutFragment = target.split("#")[0].split("?")[0];
  if (!withoutFragment) return null;
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

function resolveAgainst(fromConsumerPath, target) {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const base = fromConsumerPath.includes("/")
    ? fromConsumerPath.slice(0, fromConsumerPath.lastIndexOf("/"))
    : "";
  const parts = (base ? `${base}/${target}` : target).split("/");
  const stack = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function checkRelativeLinks(files, report, exists) {
  report.ran("relative links");
  for (const file of files) {
    if (!file.scan || !isMarkdown(file.consumerPath)) continue;
    const text = readFileSync(file.realPath, "utf8");
    for (const { target, line } of extractLinkTargets(text)) {
      const normalized = normalizeLinkTarget(target);
      if (normalized === null) continue;
      const resolved = resolveAgainst(file.consumerPath, normalized);
      if (exists(resolved)) continue;
      report.fail("broken-link", file.realRelative, `"${target}" resolves to "${resolved}", which does not exist`, {
        line,
      });
    }
  }
}

// ── HARD: forbidden lockfiles ────────────────────────────────────────────────

function checkForbiddenLockfiles(root, profile, report) {
  const forbidden = profile?.packageManager?.forbiddenLockfiles;
  if (!Array.isArray(forbidden) || forbidden.length === 0) return;
  report.ran("forbidden lockfiles");
  const keep = profile?.packageManager?.lockfile ?? "the profile's lockfile";
  for (const lockfile of forbidden) {
    if (!existsSync(join(root, lockfile))) continue;
    report.fail(
      "forbidden-lockfile",
      lockfile,
      `forbidden by packageManager.forbiddenLockfiles. A second lockfile can silently change how the repo is built. Keep only ${keep}.`
    );
  }
}

// ── HARD: skills ─────────────────────────────────────────────────────────────

function checkSkills(root, profile, report) {
  const home = profile?.skills?.home ?? ".agents/skills/";
  const lockName = profile?.skills?.lockFile ?? "skills-lock.json";
  const hostDirs = profile?.skills?.hostLinkDirs ?? [".cursor/skills/", ".claude/skills/"];

  const homePath = join(root, home);
  if (!existsSync(homePath)) return;
  report.ran("vendored skills are pinned");

  const lockPath = join(root, lockName);
  if (!existsSync(lockPath)) {
    report.fail("skills-lock", lockName, "is missing. The harness ships it present and empty so an unpinned skill is visible immediately.");
    return;
  }

  let lock;
  try {
    lock = readJson(lockPath);
  } catch (error) {
    report.fail("skills-lock", lockName, `is not valid JSON: ${error.message}`);
    return;
  }

  const entries = lock.skills && typeof lock.skills === "object" ? lock.skills : {};
  const dirs = readdirSync(homePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of dirs) {
    const locked = entries[name];
    if (!locked) {
      report.fail("unpinned-skill", `${home}${name}/`, `has no entry in ${lockName}. Every vendored skill records its source and a content hash.`);
      continue;
    }
    const recorded = locked.hash ?? locked.contentHash ?? locked.sha256;
    if (!recorded) continue;
    const expected = recorded.startsWith("sha256-") ? recorded : `sha256-${recorded}`;
    const actual = sha256Directory(join(homePath, name));
    if (actual !== expected) {
      report.fail(
        "skill-hash-mismatch",
        `${home}${name}/`,
        `content hash no longer matches ${lockName} (locked ${expected.slice(0, 19)}…, found ${actual.slice(0, 19)}…).`
      );
    }
  }

  // A host skills path must be a symlink into the host-neutral home. A real directory
  // there is a second copy, and second copies diverge silently.
  for (const hostDir of hostDirs) {
    const hostPath = join(root, hostDir);
    if (!existsSync(hostPath)) continue;
    for (const entry of readdirSync(hostPath, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(hostPath, entry.name);
      if (lstatSync(full).isSymbolicLink()) continue;
      report.fail(
        "skill-not-a-symlink",
        `${hostDir}${entry.name}`,
        `is a real path, not a relative symlink into ${home}. One body, many hosts — see the skills convention.`
      );
    }
  }
}

// ── HARD: generated closeout commands ────────────────────────────────────────

function checkGeneratedAdaptersTemplate(root, report) {
  const renderer = join(root, "scripts", "render-adapters.mjs");
  if (!existsSync(renderer)) return;
  report.ran("generated closeout commands");
  const result = spawnSync(process.execPath, [renderer, "--check"], { encoding: "utf8" });
  if (result.status === 0) return;
  const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").filter(Boolean).join(" · ");
  report.fail(
    "generated-stale",
    "scripts/render-adapters.mjs --check",
    detail || "reported stale generated files. Run `node scripts/render-adapters.mjs` and commit the result."
  );
}

// Strip the documented host framing: the metadata block a host reads, and the arguments
// preamble that differs because one host substitutes a token and the others do not.
// Everything after that must be byte-identical across the three files.
function normalizeCuClose(text) {
  let body = text.replace(/\r\n/g, "\n");
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---\n", 3);
    if (end !== -1) body = body.slice(end + 5);
  }
  body = body.replace(/^\n+/, "");
  body = body.replace(/(^## Arguments\n)[\s\S]*?(?=^- )/m, "$1<host arguments preamble>\n\n");
  return `${body.replace(/\s+$/, "")}\n`;
}

function checkGeneratedAdaptersConsumer(root, report) {
  const present = CU_CLOSE_HOSTS.filter((path) => existsSync(join(root, path)));
  if (present.length < 2) return;
  report.ran("closeout commands agree across hosts");
  const [reference, ...rest] = present;
  const referenceBody = normalizeCuClose(readFileSync(join(root, reference), "utf8"));
  for (const path of rest) {
    const body = normalizeCuClose(readFileSync(join(root, path), "utf8"));
    if (body === referenceBody) continue;
    report.fail(
      "generated-stale",
      path,
      `its body differs from ${reference} beyond the documented host framing. These three files are generated from one source in the harness template repo — re-copy them rather than hand-editing one.`
    );
  }
}

// ── HARD: profile invariants the schema cannot express ───────────────────────

function readFrontMatter(text) {
  const body = text.replace(/\r\n/g, "\n");
  if (!body.startsWith("---\n")) return null;
  const end = body.indexOf("\n---\n", 3);
  if (end === -1) return null;
  return body.slice(4, end + 1).split("\n");
}

function frontMatterScalar(lines, key) {
  for (const line of lines) {
    const match = line.match(new RegExp(`^${key}:\\s*(.*)$`));
    if (!match) continue;
    return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

function frontMatterList(lines, key) {
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return null;
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*#/.test(line)) continue;
    const item = line.match(/^\s+-\s+(.*)$/);
    if (!item) break;
    items.push(item[1].trim().replace(/^["']|["']$/g, ""));
  }
  return items;
}

const sameList = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

// `resolveRepoFile` is supplied in a consumer repo only. The profile's own path values
// — the design-system pointers below — name files in the repo the profile describes, and
// in the template repo the example profiles describe repos that are somewhere else
// entirely. Resolving them against the template root would fail on every path, so that
// context passes no resolver and the check self-skips.
function checkProfileInvariants({ profile, profileLabel, resolveConfig, resolveRepoFile }, report) {
  report.ran(`profile invariants (${profileLabel})`);

  // A design-token vocabulary is only as real as the two files that carry it: the source
  // of truth a change is supposed to edit, and the generated implementation the code
  // consumes. Every design-token rule in the rendered documents resolves through these
  // two keys, so a path that names nothing points a reader at a file they cannot open —
  // and then the regenerate-and-diff discipline has nothing to diff.
  if (resolveRepoFile) {
    for (const key of ["sourceOfTruth", "shippedImplementation"]) {
      const value = profile?.designSystem?.[key];
      if (typeof value !== "string" || value.length === 0) continue;
      if (existsSync(resolveRepoFile(value))) continue;
      report.fail(
        "profile-invariant",
        value,
        `designSystem.${key} names a file that is not in this repo. Create it, or correct the profile — a design-system pointer that resolves to nothing is worse than an absent one, because the documents keep citing it.`
      );
    }
  }

  const schemaDoc = profile?.documentation?.artifacts?.schemaDoc;
  const committedPath = profile?.verify?.schema?.committedPath;
  if (schemaDoc && committedPath && schemaDoc !== committedPath) {
    report.fail(
      "profile-invariant",
      profileLabel,
      `documentation.artifacts.schemaDoc ("${schemaDoc}") must equal verify.schema.committedPath ("${committedPath}"). JSON Schema cannot express equality between two values, so it is asserted here.`
    );
  }

  const checks = Array.isArray(profile?.review?.checks) ? profile.review.checks : [];
  for (const check of checks) {
    if (!check?.configFile) continue;
    const realPath = resolveConfig(check.configFile);
    if (!realPath || !existsSync(realPath)) continue;
    const frontMatter = readFrontMatter(readFileSync(realPath, "utf8"));
    if (!frontMatter) {
      report.fail("profile-invariant", check.configFile, "has no YAML front matter, so its `title:` cannot be checked against review.checks[].name.");
      continue;
    }
    const title = frontMatterScalar(frontMatter, "title");
    if (title !== check.name) {
      report.fail(
        "profile-invariant",
        check.configFile,
        `front-matter title is "${title}" but review.checks[].name is "${check.name}". The reviewer renders the check from the file, and the profile is what every document quotes.`
      );
    }
  }

  const securityPaths = profile?.review?.securityPaths;
  if (Array.isArray(securityPaths)) {
    const securityCheck = checks.find(
      (check) =>
        check?.configFile &&
        (Array.isArray(check.pathScope) || /(^|\/)security-review\.md$/.test(check.configFile))
    );
    const realPath = securityCheck ? resolveConfig(securityCheck.configFile) : null;
    if (realPath && existsSync(realPath)) {
      const frontMatter = readFrontMatter(readFileSync(realPath, "utf8"));
      const include = frontMatter ? frontMatterList(frontMatter, "include") : null;
      if (!include) {
        report.fail("profile-invariant", securityCheck.configFile, "has no `include:` list, so it is not path-scoped even though the profile says it is.");
      } else if (!sameList(include, securityPaths)) {
        report.fail(
          "profile-invariant",
          securityCheck.configFile,
          `its \`include:\` list [${include.join(", ")}] differs from review.securityPaths [${securityPaths.join(", ")}]. A path added in one place and not the other silently changes what gets reviewed.`
        );
      }
    }
  }
}

// ── DRIFT: the template-versus-copy lock ─────────────────────────────────────

function lockableFiles(files) {
  return files.filter((file) => file.table === "A" && !file.entry.dir && !file.entry.seeded);
}

function buildLock(files, profile) {
  const entries = {};
  for (const file of lockableFiles(files).sort((a, b) => (a.consumerPath < b.consumerPath ? -1 : 1))) {
    entries[file.consumerPath] = { hash: sha256File(file.realPath) };
  }
  return {
    version: LOCK_VERSION,
    template: {
      source: profile?.harnessTemplate?.repo ?? "altitude-agent-harness",
      ref: profile?.harnessTemplate?.ref ?? "unknown",
    },
    files: entries,
  };
}

function checkLock(root, files, profile, report) {
  const lockPath = join(root, LOCK_FILE);
  const locked = lockableFiles(files);

  if (!existsSync(lockPath)) {
    report.note(
      `${LOCK_FILE} is absent, so no harness file has a pinned template version. Run \`node scripts/check-harness-drift.mjs --update-lock\` to record the current tree.`
    );
    for (const file of locked) report.report("not-locked", file.consumerPath, "no lock entry");
    return;
  }

  let lock;
  try {
    lock = readJson(lockPath);
  } catch (error) {
    report.fail("lock-file", LOCK_FILE, `is not valid JSON: ${error.message}`);
    return;
  }
  report.ran("harness files against the template lock");

  const recorded = lock.files && typeof lock.files === "object" ? lock.files : {};
  const seen = new Set();

  for (const file of locked) {
    seen.add(file.consumerPath);
    const entry = recorded[file.consumerPath];
    if (!entry?.hash) {
      report.report("not-locked", file.consumerPath, "harness file with no lock entry");
      continue;
    }
    const actual = sha256File(file.realPath);
    if (actual === entry.hash) continue;
    report.report(
      "local-edit",
      file.consumerPath,
      `differs from the version pinned at template ref ${lock.template?.ref ?? "unknown"}`
    );
  }

  // A lock written before seeded files were exempted still records them. They are
  // present, just no longer lockable, so reporting them as missing would be a lie.
  const seeded = new Set(files.filter((file) => file.entry.seeded).map((file) => file.consumerPath));

  for (const path of Object.keys(recorded).sort()) {
    if (seen.has(path) || seeded.has(path)) continue;
    report.report("missing", path, "locked harness file is not present in the repo");
  }
}

// ── output ───────────────────────────────────────────────────────────────────

function printHuman(report, { context, root, strict, exitCode }) {
  const lines = [];
  lines.push(`Harness drift check — ${context} repo at ${root}`);
  lines.push("");

  if (report.hard.length > 0) {
    lines.push(`HARD FAILURES (${report.hard.length})`);
    for (const item of report.hard) {
      const where = item.line ? `${item.path}:${item.line}` : item.path;
      lines.push(`  ${item.kind.padEnd(22)} ${where}`);
      lines.push(`  ${" ".repeat(22)} ${item.message}`);
    }
    lines.push("");
  }

  if (report.drift.length > 0) {
    const suffix = strict ? "promoted to failures by --strict" : "informational";
    lines.push(`DRIFT (${report.drift.length}, ${suffix})`);
    for (const item of report.drift) {
      lines.push(`  ${item.status.padEnd(22)} ${item.path}`);
      lines.push(`  ${" ".repeat(22)} ${item.message}`);
    }
    lines.push("");
    if (!strict) {
      lines.push(
        "  An intentional customization is re-locked deliberately: run --update-lock after"
      );
      lines.push("  making it. An unexpected local-edit is a stale or hand-edited copy.");
      lines.push("");
    }
  }

  for (const note of report.notes) lines.push(`note: ${note}`);
  if (report.notes.length > 0) lines.push("");

  lines.push(`Checks run: ${[...report.checks].join(", ")}`);
  if (exitCode === 0 && report.hard.length === 0 && report.drift.length === 0) {
    lines.push("OK — no hard failures and no drift.");
  } else if (exitCode === 0) {
    lines.push("OK — no hard failures.");
  } else {
    lines.push("FAILED");
  }
  console.log(lines.join("\n"));
}

// ── main ─────────────────────────────────────────────────────────────────────

const USAGE = `Usage: node scripts/check-harness-drift.mjs [--strict] [--update-lock] [--json]

  --strict       promote drift reports to a non-zero exit
  --update-lock  rewrite ${LOCK_FILE} from the current tree (consumer repos only)
  --json         emit machine-readable output instead of the human report
  --help         this message

Exit codes: 0 clean or drift-only · 1 hard failure (or drift under --strict) · 2 usage error`;

function main(argv) {
  const known = new Set(["--strict", "--update-lock", "--json", "--help", "-h"]);
  for (const arg of argv) {
    if (!known.has(arg)) {
      console.error(`Unknown argument: ${arg}\n\n${USAGE}`);
      return 2;
    }
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }

  const strict = argv.includes("--strict");
  const updateLock = argv.includes("--update-lock");
  const asJson = argv.includes("--json");

  const detected = detectContext(process.cwd());
  if (!detected) {
    console.error(
      "Could not tell where this repo is rooted. Expected a harness.json (consumer repo) or a harness.schema.json alongside template/ (harness template repo) at or above the working directory."
    );
    return 2;
  }
  const { context, root } = detected;
  const report = new Report();

  if (context === "consumer") {
    let profile;
    try {
      profile = readJson(join(root, "harness.json"));
    } catch (error) {
      console.error(`harness.json is not valid JSON: ${error.message}`);
      return 2;
    }

    const files = resolveManifest({ context, root, profile });
    const exists = (consumerPath) => existsSync(join(root, consumerPath));

    checkDeniedStrings(files, report);
    checkAbsolutePaths(files, report);
    checkDeniedPaths(root, report);
    checkRelativeLinks(files, report, exists);
    checkForbiddenLockfiles(root, profile, report);
    checkSkills(root, profile, report);
    checkGeneratedAdaptersConsumer(root, report);
    checkProfileInvariants(
      {
        profile,
        profileLabel: "harness.json",
        resolveConfig: (configFile) => join(root, configFile),
        resolveRepoFile: (repoPath) => join(root, repoPath),
      },
      report
    );

    if (updateLock) {
      const lock = buildLock(files, profile);
      writeFileSync(join(root, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
      report.note(`${LOCK_FILE} rewritten from the current tree (${Object.keys(lock.files).length} files).`);
    } else {
      checkLock(root, files, profile, report);
    }
  } else {
    if (updateLock) {
      report.note(`--update-lock is a no-op in the template repo: ${LOCK_FILE} lives in a consumer repo.`);
    }

    // Every role ships, so every role is checked. A variant file is scanned once per
    // role because both copies reach a real repo.
    const seenReal = new Set();
    const allFiles = [];
    for (const role of ROLES) {
      const roleProfilePath = join(root, "examples", `harness.${role}.json`);
      const profile = existsSync(roleProfilePath) ? readJson(roleProfilePath) : null;
      const files = resolveManifest({ context, root, role, profile });

      const fresh = files.filter((file) => !seenReal.has(file.realRelative));
      for (const file of fresh) seenReal.add(file.realRelative);
      allFiles.push(...fresh);

      // Links resolve against the virtual consumer tree this role would produce.
      const virtual = new Set(INSTALL_CREATED_PATHS);
      for (const file of files) virtual.add(file.consumerPath);
      for (const relPath of walkFiles(join(root, "template"))) {
        virtual.add(
          relPath
            .replace(/AGENTS\.md\.skeleton$/, "AGENTS.md")
            .replace(/harness\.json\.example$/, "harness.json")
        );
      }
      const variantRoot = join(root, "variants", role);
      for (const relPath of walkFiles(variantRoot)) virtual.add(relPath);
      for (const path of [...virtual]) {
        const parts = path.split("/");
        for (let i = 1; i < parts.length; i += 1) virtual.add(parts.slice(0, i).join("/"));
      }

      checkRelativeLinks(fresh, report, (consumerPath) => virtual.has(consumerPath));

      if (profile) {
        checkProfileInvariants(
          {
            profile,
            profileLabel: `examples/harness.${role}.json`,
            resolveConfig: (configFile) => join(root, "variants", role, configFile),
          },
          report
        );
      }
    }

    checkDeniedStrings(allFiles, report);
    checkAbsolutePaths(allFiles, report);
    checkDeniedPaths(root, report);
    checkSkills(join(root, "template"), null, report);
    checkGeneratedAdaptersTemplate(root, report);
    report.note(`${allFiles.length} shipped files checked across roles: ${ROLES.join(", ")}.`);
  }

  const hardFailed = report.hard.length > 0;
  const driftFailed = strict && report.drift.length > 0;
  const exitCode = hardFailed || driftFailed ? 1 : 0;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          version: 1,
          context,
          root,
          strict,
          hardFailures: report.hard,
          drift: report.drift,
          notes: report.notes,
          checksRun: [...report.checks],
          exitCode,
        },
        null,
        2
      )
    );
  } else {
    printHuman(report, { context, root, strict, exitCode });
  }
  return exitCode;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`check-harness-drift: ${error?.stack ?? error}`);
  process.exitCode = 2;
}
