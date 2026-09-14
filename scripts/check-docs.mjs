#!/usr/bin/env node
// The documentation-only verification gate.
//
// STELLAR ADAPTATION: based on the harness template's `scripts/check-docs.mjs`.
// Source-reference handling and the --all candidate set are local changes; see
// docs/provenance/harness-adaptation.md before comparing with the upstream copy.
//
// WHY THIS EXISTS: five harness documents told the reader to "scan edited Markdown for
// placeholders, secrets, and broken relative links" and shipped no command that does it,
// so every agent improvised a different scan and none of them were reproducible. This is
// that scan, named once, so `verify.docsOnly` can point at it.
//
// SCOPE is deliberately the CHANGED Markdown, not the whole repo. This runs on every
// documentation-only change, so it has to stay fast and it has to fail only on what the
// author actually touched — a pre-existing broken link in a file nobody edited is not
// this change's problem, and blaming it here trains readers to ignore the output.
// `--all` sweeps tracked and untracked, commit-eligible Markdown files.
//
// The changed set is: everything Markdown in `git diff` against the merge-base with
// `branches.integration` (from `harness.json`, else `develop`), plus anything staged,
// plus anything staged or unstaged against HEAD, plus untracked files git would commit.
// The staged set is asked for on its own so an unborn branch — a repository's first
// commit — still has a candidate set, since there is no HEAD there to diff against.
//
// CHECKS — all hard failures, all exit 1:
//
//   placeholders    an unfilled `REPLACE_ME`, `TODO(fill`, or a literal `<task-id>`.
//   secrets         private-key headers, GitHub/AWS tokens, bearer tokens, long
//                   high-entropy hex and base64 runs, and credential assignments whose
//                   value is not a placeholder.
//   absolute paths  `/Users/`, `/home/`, `C:\`, and friends. A ported document naming one
//                   points at a checkout that does not exist in the repo reading it.
//   broken links    relative Markdown links that resolve to nothing on disk. Anchors and
//                   external URLs are skipped, matching check-harness-drift.mjs.
//
// Markdown only. A secret pasted into a shell script is real, but this is the docs-only
// gate and a change that touches code runs the rest of the `verify.*` set as well.
//
// Usage:
//   node scripts/check-docs.mjs [--all] [--json]
//
// Exit codes: 0 clean · 1 one or more findings · 2 usage or internal error.
//
// Dependency-free, Node >= 18, deterministic.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// BEGIN PATTERN BLOCK — the strings below are the thing being searched for, so a
// document that quotes them verbatim would flag itself. Two exemptions cover it:
// this script is never scanned (it is not Markdown, and only Markdown is read), and
// SCAN_EXEMPT names the documents whose entire job is quoting landmines back.
// ─────────────────────────────────────────────────────────────────────────────

// Markdown files that are evidence rather than instruction. The extraction manifest
// records, verbatim, every absolute path and leaked credential found in the repo this
// harness was extracted from; scanning it reports the audit as the incident.
const SCAN_EXEMPT = new Set(["EXTRACTION-MANIFEST.md"]);

// Unfilled scaffolding. Matched against text with code fences and inline code spans
// masked out, because a document that *teaches* the convention writes `REPLACE_ME` in
// backticks, while a copy someone forgot to fill leaves it bare in the prose. Files
// ending in `.skeleton` are the shipped scaffolding itself and are skipped outright.
const PLACEHOLDER_PATTERNS = [
  { re: /\bREPLACE_ME\b/g, why: "unfilled scaffolding marker" },
  { re: /\bTODO\(fill/gi, why: "unfilled scaffolding marker" },
  { re: /<task-id>/g, why: "unsubstituted task id placeholder" },
];

// Credential shapes. Deliberately specific: a pattern loose enough to catch "any long
// string" fires on prose and gets ignored, which is worse than not running.
const SECRET_PATTERNS = [
  { re: /-----BEGIN [A-Z][A-Z ]*-----/g, why: "PEM key or certificate header" },
  { re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/g, why: "GitHub access token" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, why: "GitHub fine-grained personal access token" },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, why: "AWS access key id" },
  { re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, why: "Slack token" },
  { re: /\bBearer\s+[A-Za-z0-9_\-.=+/]{20,}/g, why: "bearer token" },
];

// A credential assignment: `api_key: <value>`. Only a value that is not obviously a
// stand-in counts, so `.env.example` documentation and profile prose stay quiet.
//
// The optional quote after the key is load-bearing. A credential pasted into
// documentation most often arrives as JSON or YAML — `{ "password": "s3cr3t123" }` — and
// without it the pattern demands the separator immediately after the key, so the closing
// quote of a quoted key defeats the whole gate.
//
// Bare `token` is in the list because that is the shape a webhook or dispatch URL uses.
// It cannot fire inside `access_token` or `HARNESS_TEMPLATE_TOKEN`: the underscore is a
// word character, so there is no word boundary in front of it there.
const ASSIGNMENT_RE =
  /\b(password|passwd|pwd|api[_-]?key|apikey|secret|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|token)\b["']?\s*[:=]\s*["']?([^\s"'`,;)]{8,})["']?/gi;

const PLACEHOLDER_VALUE_RE =
  /^(?:replace_me.*|<.*>|\$\{.*\}|\$[a-z_][a-z0-9_]*|x{3,}|\*{3,}|\.{3,}|…+|your[-_.].*|my[-_.].*|change[-_]?me|example.*|sample.*|dummy.*|fake.*|test.*|placeholder.*|none|null|true|false|redacted.*|.*_here|.*[-_](name|names|value|placeholder)|secrets\..*|env\..*)$/i;

// A run of hex or base64 long enough and mixed enough to be a key rather than a word.
const HIGH_ENTROPY_PATTERNS = [
  { re: /\b[A-Fa-f0-9]{32,}\b/g, why: "long hex string" },
  { re: /\b[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/=])/g, why: "long base64 string" },
];

// Content hashes and commit ids are long hex on purpose. The context must be next to
// the match: a line that mentions a commit can still contain a pasted key elsewhere.
const DIGEST_PREFIX_RE = /(?:\b(?:sha1|sha256|sha512|md5|hash|digest|checksum|commit|revision|ref|integrity|fingerprint)(?:\s+id)?\s*[:=]?\s*|\b(?:main|develop)[`'"]?\s+at\s*)[`'"]?$/i;

// Absolute local paths. Same list and same reasoning as check-harness-drift.mjs:
// narrow on purpose, because flagging `/usr/local/bin` would train readers to skim past
// this check.
const ABSOLUTE_PATH_PATTERNS = [
  { re: /\/Users\/[^\s`"')\]]*/g, why: "absolute macOS home path" },
  { re: /\/home\/[^\s`"')\]]*/g, why: "absolute Linux home path" },
  { re: /\/Volumes\/[^\s`"')\]]*/g, why: "absolute macOS volume path" },
  { re: /\/mnt\/[^\s`"')\]]*/g, why: "absolute mount path" },
  { re: /\/opt\/cursor\/[^\s`"')\]]*/g, why: "absolute agent-host artifact path" },
  { re: /\b[A-Za-z]:\\[A-Za-z0-9_.\\-]+/g, why: "absolute Windows path" },
];

// ─────────────────────────────────────────────────────────────────────────────
// END PATTERN BLOCK
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_INTEGRATION_BRANCH = "develop";
const MARKDOWN_RE = /\.(md|mdc)$/i;

// ── small helpers ────────────────────────────────────────────────────────────

const toPosix = (p) => p.split(sep).join("/");

function git(root, args) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

function gitLines(root, args) {
  const result = git(root, args);
  if (result.status !== 0) return null;
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Blank out fenced code blocks, preserving line numbers so a finding still points at the
// line it came from. Same fence handling as check-harness-drift.mjs.
function maskFencedCode(text) {
  const out = [];
  let fence = null;
  for (const line of text.split("\n")) {
    // Spaces only, never `\s`: a tab makes the line indented code rather than a fence, so
    // treating it as fence indentation opens a block that never closes and masks the rest
    // of the document — placeholders and broken links in it then go unreported.
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

// Blank out inline code spans, preserving length so column-free line reporting stays
// honest. `` `REPLACE_ME` `` is someone naming the convention; a bare REPLACE_ME is
// someone who did not fill it in.
//
// Scanned rather than pattern-matched. A code span is bounded by two backtick runs of
// EQUAL length, each a whole run, and no single regex says that: the obvious one lets the
// greedy opening run backtrack onto a shorter, unequal delimiter, and the obvious repair
// lets the body consume its own closing delimiter instead. Both mask the prose in between
// — and any placeholder sitting in it — which is the whole failure this masking exists to
// avoid causing. A run with no equal-length partner is literal text, exactly as it renders.
function maskInlineCode(text) {
  const runs = [];
  for (let i = 0; i < text.length; ) {
    if (text[i] !== "`") {
      i += 1;
      continue;
    }
    const start = i;
    while (i < text.length && text[i] === "`") i += 1;
    runs.push({ start, end: i });
  }

  let out = "";
  let cursor = 0;
  for (let open = 0; open < runs.length; open += 1) {
    const width = runs[open].end - runs[open].start;
    let close = -1;
    for (let candidate = open + 1; candidate < runs.length; candidate += 1) {
      if (runs[candidate].end - runs[candidate].start !== width) continue;
      close = candidate;
      break;
    }
    if (close === -1) continue;
    out += text.slice(cursor, runs[open].start);
    // Newlines survive the blanking: a span that wraps must not renumber the lines below it.
    out += text.slice(runs[open].start, runs[close].end).replace(/[^\n]/g, " ");
    cursor = runs[close].end;
    open = close;
  }
  return out + text.slice(cursor);
}

const maskCode = (text) => maskInlineCode(maskFencedCode(text));

// ── report collection ────────────────────────────────────────────────────────

class Report {
  constructor() {
    this.findings = [];
    this.notes = [];
    this.checks = new Set();
  }
  fail(kind, path, message, line) {
    this.findings.push({ kind, path, message, line });
  }
  note(message) {
    this.notes.push(message);
  }
  ran(name) {
    this.checks.add(name);
  }
}

// ── context ──────────────────────────────────────────────────────────────────

// Same detection as check-harness-drift.mjs, so both scripts agree on where the repo
// starts: a `harness.json` means a consumer repo, `harness.schema.json` alongside
// `template/` means the harness template repo itself.
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

function integrationBranch(root, context) {
  if (context !== "consumer") return DEFAULT_INTEGRATION_BRANCH;
  try {
    const profile = readJson(join(root, "harness.json"));
    const branch = profile?.branches?.integration;
    return typeof branch === "string" && branch ? branch : DEFAULT_INTEGRATION_BRANCH;
  } catch {
    return DEFAULT_INTEGRATION_BRANCH;
  }
}

// ── file selection ───────────────────────────────────────────────────────────

function mergeBase(root, branch, report) {
  for (const ref of [`origin/${branch}`, branch]) {
    const result = git(root, ["merge-base", "HEAD", ref]);
    if (result.status === 0) {
      const base = result.stdout.trim();
      if (base) return base;
    }
  }
  report.note(
    `no merge-base against ${branch} or origin/${branch}; only working-tree changes were scanned.`
  );
  return null;
}

function selectFiles({ root, all, branch, report }) {
  if (all) {
    const tracked = gitLines(root, ["ls-files", "--", "*.md", "*.mdc"]);
    const untracked = gitLines(root, ["ls-files", "--others", "--exclude-standard", "--", "*.md", "*.mdc"]);
    if (tracked === null || untracked === null) {
      report.note("git is unavailable here; --all could not enumerate Markdown files.");
      return [];
    }
    report.note(`--all: tracked Markdown (${tracked.length}) and untracked commit candidates (${untracked.length}).`);
    return dedupeExisting(root, [...tracked, ...untracked]);
  }

  const candidates = [];
  const base = mergeBase(root, branch, report);
  if (base) {
    const committed = gitLines(root, ["diff", "--name-only", "--diff-filter=ACMR", base, "--"]);
    if (committed) candidates.push(...committed);
    report.note(`changed against the merge-base with ${branch} (${base.slice(0, 12)}).`);
  }

  // Staged and unstaged edits, then untracked files git would commit. `git diff` against
  // the merge-base already covers committed work; these three cover the session in progress.
  //
  // The staged diff is listed separately rather than folded into the one against HEAD,
  // because on an unborn branch there is no HEAD to diff against and that command fails
  // outright. A repository's first commit is exactly that case, so without this the
  // initial commit of a fresh install — every consumer repo's, once — scans nothing and
  // exits 0, and a credential or broken link in it walks straight through the gate.
  const staged = gitLines(root, ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  if (staged) candidates.push(...staged);
  const working = gitLines(root, ["diff", "--name-only", "--diff-filter=ACMR", "HEAD", "--"]);
  if (working) candidates.push(...working);
  const untracked = gitLines(root, ["ls-files", "--others", "--exclude-standard"]);
  if (untracked) candidates.push(...untracked);

  return dedupeExisting(root, candidates);
}

function dedupeExisting(root, paths) {
  const seen = new Set();
  const out = [];
  for (const path of paths) {
    const posix = toPosix(path);
    if (!MARKDOWN_RE.test(posix) || seen.has(posix)) continue;
    seen.add(posix);
    const full = join(root, posix);
    // A deleted or renamed-away file is still named by `git diff`; there is nothing to
    // read and nothing to fail on.
    if (!existsSync(full) || !statSync(full).isFile()) continue;
    out.push(posix);
  }
  return out.sort();
}

// ── checks ───────────────────────────────────────────────────────────────────

function eachMatch(text, pattern, visit) {
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      visit(match, index + 1, line);
      if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    }
  });
}

function checkPlaceholders(path, raw, report) {
  // The shipped scaffolding is supposed to be full of markers; that is what makes it
  // scaffolding. It is renamed on the way into a consumer repo, so the installed copy is
  // scanned normally.
  if (path.endsWith(".skeleton")) return;
  const masked = maskCode(raw);
  for (const { re, why } of PLACEHOLDER_PATTERNS) {
    eachMatch(masked, re, (match, line) => {
      report.fail("placeholder", path, `"${match[0]}" — ${why}`, line);
    });
  }
}

function checkSecrets(path, raw, report) {
  // Scanned raw, fences included: a pasted credential lands in a code block far more
  // often than in prose.
  for (const { re, why } of SECRET_PATTERNS) {
    eachMatch(raw, re, (match, line) => {
      report.fail("secret", path, `${why} — "${redact(match[0])}"`, line);
    });
  }

  eachMatch(raw, ASSIGNMENT_RE, (match, line) => {
    const [, key, value] = match;
    if (PLACEHOLDER_VALUE_RE.test(value)) return;
    report.fail("secret", path, `${key} assigned a non-placeholder value "${redact(value)}"`, line);
  });

  for (const { re, why } of HIGH_ENTROPY_PATTERNS) {
    eachMatch(raw, re, (match, line, lineText) => {
      if (!looksRandom(match[0])) return;
      if (isStructuralSourceReference(lineText, match.index, match[0].length)) return;
      if (/^[a-f0-9]{40}$/i.test(match[0]) && DIGEST_PREFIX_RE.test(lineText.slice(0, match.index))) return;
      report.fail("secret", path, `${why} — "${redact(match[0])}"`, line);
    });
  }
}

// These source citations have long, base64-looking paths. Suppress only the precise
// high-entropy span inside a pinned GitHub source URL, an Airtable base/table/view path,
// or a local Agent Hub source-file path. Explicit token and assignment checks above
// still scan the complete raw line, including URL queries and fragments.
function isStructuralSourceReference(line, start, length) {
  const end = start + length;
  const urls = /https?:\/\/[^\s<>)\]`"']+/g;
  let found;
  while ((found = urls.exec(line)) !== null) {
    const rawUrl = found[0];
    const pathEnd = Math.min(...["?", "#"].map((marker) => {
      const at = rawUrl.indexOf(marker);
      return at < 0 ? rawUrl.length : at;
    }));
    if (start < found.index || end > found.index + pathEnd) continue;
    let url;
    try { url = new URL(rawUrl); } catch { continue; }
    if (url.username || url.password) continue;
    const parts = url.pathname.split("/").filter(Boolean);
    const pinnedGitHub = url.hostname === "github.com" &&
      parts.length >= 4 && ["blob", "tree"].includes(parts[2]) &&
      parts[0].length < 32 && parts[1].length < 32 &&
      /^[a-f0-9]{40}$/i.test(parts[3]) &&
      parts.slice(4).every((part) => part.length < 32);
    const airtableView = url.hostname === "airtable.com" &&
      parts.length === 3 &&
      /^app[A-Za-z0-9]{14}$/.test(parts[0]) &&
      /^tbl[A-Za-z0-9]{14}$/.test(parts[1]) &&
      /^viw[A-Za-z0-9]{14}$/.test(parts[2]);
    if (pinnedGitHub || airtableView) return true;
  }

  const sourcePaths = /agent-hub\/(?:[A-Za-z0-9_.()-]+\/){2,}[A-Za-z0-9_.()-]+\.(?:ts|tsx|js|jsx|mjs)(?::\d+)?/g;
  while ((found = sourcePaths.exec(line)) !== null) {
    const segments = found[0].split("/");
    if (start >= found.index && end <= found.index + found[0].length &&
        segments.every((segment) => segment.length < 32)) return true;
  }
  return false;
}

// Mixed case plus digits. An English sentence run together never satisfies this; a
// generated key almost always does.
function looksRandom(value) {
  return /[a-z]/.test(value) && /[A-Z0-9]/.test(value) && /[0-9]/.test(value);
}

function redact(value) {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function checkAbsolutePaths(path, raw, report) {
  for (const { re, why } of ABSOLUTE_PATH_PATTERNS) {
    eachMatch(raw, re, (match, line) => {
      report.fail("absolute-path", path, `"${match[0]}" — ${why}`, line);
    });
  }
}

// Link extraction and resolution are lifted from check-harness-drift.mjs on purpose: two
// gates that disagree about what a broken link is are worse than one.
function extractLinkTargets(text) {
  const found = [];
  const body = maskFencedCode(text);
  const inline = /!?\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
  const reference = /^\s{0,3}\[[^\]]+\]:\s*<?([^>\s]+)>?/;
  body.split("\n").forEach((line, index) => {
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

function resolveAgainst(fromPath, target) {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const base = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const parts = (base ? `${base}/${target}` : target).split("/");
  const stack = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function checkRelativeLinks(root, path, raw, report) {
  for (const { target, line } of extractLinkTargets(raw)) {
    const normalized = normalizeLinkTarget(target);
    if (normalized === null) continue;
    const resolved = resolveAgainst(path, normalized);
    if (!resolved || existsSync(join(root, resolved))) continue;
    report.fail(
      "broken-link",
      path,
      `"${target}" resolves to "${resolved}", which does not exist`,
      line
    );
  }
}

// ── output ───────────────────────────────────────────────────────────────────

function printHuman(report, { context, root, scanned, exitCode }) {
  const lines = [];
  lines.push(`Docs check — ${context} repo at ${root}`);
  lines.push("");

  if (report.findings.length > 0) {
    lines.push(`FINDINGS (${report.findings.length})`);
    for (const item of report.findings) {
      const where = item.line ? `${item.path}:${item.line}` : item.path;
      lines.push(`  ${item.kind.padEnd(22)} ${where}`);
      lines.push(`  ${" ".repeat(22)} ${item.message}`);
    }
    lines.push("");
  }

  for (const note of report.notes) lines.push(`note: ${note}`);
  if (report.notes.length > 0) lines.push("");

  lines.push(`Markdown files scanned: ${scanned.length}`);
  lines.push(`Checks run: ${[...report.checks].join(", ")}`);
  lines.push(exitCode === 0 ? "OK — no findings." : "FAILED");
  console.log(lines.join("\n"));
}

// ── main ─────────────────────────────────────────────────────────────────────

const USAGE = `Usage: node scripts/check-docs.mjs [--all] [--json]

  --all    scan tracked and untracked, commit-eligible Markdown files
  --json   emit machine-readable output instead of the human report
  --help   this message

Exit codes: 0 clean · 1 one or more findings · 2 usage error`;

function main(argv) {
  const known = new Set(["--all", "--json", "--help", "-h"]);
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

  const all = argv.includes("--all");
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

  if (git(root, ["rev-parse", "--git-dir"]).status !== 0) {
    console.error("Not a git checkout, so there is no change set to scan. Use --all only inside a repository.");
    return 2;
  }

  const branch = integrationBranch(root, context);
  const selected = selectFiles({ root, all, branch, report });

  const exempt = selected.filter((path) => SCAN_EXEMPT.has(path));
  const scanned = selected.filter((path) => !SCAN_EXEMPT.has(path));
  for (const path of exempt) {
    report.note(`${path} is exempt: it quotes landmine strings verbatim as evidence.`);
  }

  report.ran("placeholders");
  report.ran("secrets");
  report.ran("absolute local paths");
  report.ran("relative links");

  for (const path of scanned) {
    const raw = readFileSync(join(root, path), "utf8");
    checkPlaceholders(path, raw, report);
    checkSecrets(path, raw, report);
    checkAbsolutePaths(path, raw, report);
    checkRelativeLinks(root, path, raw, report);
  }

  if (scanned.length === 0) {
    report.note("no changed Markdown files; nothing to scan.");
  }

  const exitCode = report.findings.length > 0 ? 1 : 0;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          version: 1,
          context,
          root,
          all,
          integrationBranch: branch,
          scanned,
          findings: report.findings,
          notes: report.notes,
          checksRun: [...report.checks],
          exitCode,
        },
        null,
        2
      )
    );
  } else {
    printHuman(report, { context, root, scanned, exitCode });
  }
  return exitCode;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`check-docs: ${error?.stack ?? error}`);
  process.exitCode = 2;
}
