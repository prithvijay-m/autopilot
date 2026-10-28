#!/usr/bin/env node
// List, check and apply a retro proposal (docs/improvements/*.md) to a plugin checkout.
// The proposal is untrusted input: every path in its patch is validated before git sees it,
// and nothing is written without --yes.
//
//   node improve.mjs list [--dir <dir>]
//   node improve.mjs check <file> [--root <dir>]
//   node improve.mjs apply <file> [--root <dir>] [--yes]
//
// Exit 0 on success, 1 on a refusal or a patch that does not apply.
import { spawnSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BYTES = 1_000_000;
const MAX_FILES = 200;
const DIRS = new Set(["agents", "commands", "docs", "hooks", "scripts", "skills", "tests", "tools"]);

/** Body of the first diff fence after `## Patch`, or null when missing or empty. */
export function extractPatch(md) {
  const text = String(md).replace(/\r\n/g, "\n");
  const at = text.search(/^## Patch[ \t]*$/m);
  if (at < 0) return null;
  const m = /^```diff[ \t]*\n([\s\S]*?)^```[ \t]*$/m.exec(text.slice(at));
  return m && m[1].trim() ? m[1] : null;
}

const clean = (s) => s.split("\t")[0];

/** Every path named by the ---, +++, rename and copy lines (a/ and b/ stripped), without /dev/null. */
export function patchPaths(diff) {
  const out = [];
  const add = (p) => p !== "/dev/null" && !out.includes(p) && out.push(p);
  for (const line of String(diff).split("\n")) {
    let m;
    if ((m = /^(?:---|\+\+\+) (.*)$/.exec(line))) {
      const p = clean(m[1]);
      add(/^[ab]\//.test(p) ? p.slice(2) : p);
    } else if ((m = /^(?:rename|copy) (?:from|to) (.*)$/.exec(line))) add(clean(m[1]));
  }
  return out;
}

const segments = (p) => p.split(/[\\/]/);
const absolute = (p) => /^([\\/]|[A-Za-z]:)/.test(p);

/** True for a relative path under the plugin's own folders, or a top-level markdown file. */
export function allowedPath(p) {
  if (typeof p !== "string" || !p || absolute(p)) return false;
  const segs = segments(p);
  if (segs.includes("..")) return false;
  if (segs.some((s) => s.toLowerCase() === ".git" || s === ".")) return false;
  if (segs.length === 1) return /\.md$/i.test(p) && p !== ".md";
  return DIRS.has(segs[0]);
}

/** Nearest ancestor directory whose .claude-plugin/plugin.json is named autopilot, or null. */
export function pluginRoot(file) {
  let dir = dirname(resolve(file));
  for (;;) {
    try {
      const j = JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8"));
      if (j && j.name === "autopilot") return dir;
    } catch {}
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** The reason one path is refused, or null. */
function pathReason(p) {
  if (absolute(p)) return `absolute path ${p}`;
  if (segments(p).includes("..")) return `path leaves the plugin ${p}`;
  if (!allowedPath(p)) return `path outside the plugin's own folders ${p}`;
  return null;
}

/** Paths from `diff --git a/X b/Y` lines; a name with spaces is ambiguous, so every split counts. */
function headerPaths(diff) {
  const out = [];
  for (const line of diff.split("\n")) {
    const m = /^diff --git a\/(.*)$/.exec(line);
    if (!m) continue;
    const rest = m[1];
    for (let i = rest.indexOf(" b/"); i >= 0; i = rest.indexOf(" b/", i + 1)) out.push(rest.slice(0, i), rest.slice(i + 3));
  }
  return out;
}

/** First reason the patch must not be applied, or null. */
function patchReason(diff) {
  if (/^GIT binary patch/m.test(diff) || /^Binary files /m.test(diff)) return "binary patches are not accepted";
  if (/^(?:(?:old|new|deleted file|new file) mode|index \S+) 120000/m.test(diff)) return "symbolic links are not accepted";
  for (const line of diff.split("\n")) {
    const m = /^(---|\+\+\+) (.*)$/.exec(line);
    if (!m) continue;
    const p = clean(m[2]);
    if (p !== "/dev/null" && !p.startsWith(m[1] === "---" ? "a/" : "b/")) return `path outside the plugin's own folders ${p}`;
  }
  const paths = [...patchPaths(diff), ...headerPaths(diff)];
  for (const p of paths) {
    const r = pathReason(p);
    if (r) return r;
  }
  if (patchPaths(diff).length > MAX_FILES) return `more than ${MAX_FILES} files`;
  return null;
}

/** The first path component under root that is a link, or null. */
function linkIn(root, paths) {
  for (const p of paths) {
    let cur = root;
    for (const s of segments(p)) {
      cur = join(cur, s);
      let st;
      try {
        st = lstatSync(cur);
      } catch {
        break;
      }
      if (st.isSymbolicLink()) return p;
    }
  }
  return null;
}

const git = (root, args, input) => spawnSync("git", args, { cwd: root, input, encoding: "utf8" });

/** Validate a proposal file: { refused } | { failed } | { ok, paths, diff, root }. */
function inspect(file, rootArg) {
  let st;
  try {
    st = lstatSync(file);
  } catch {
    return { refused: `cannot read ${file}` };
  }
  if (!st.isFile()) return { refused: `not a regular file ${file}` };
  if (st.size > MAX_BYTES) return { refused: `proposal larger than ${MAX_BYTES} bytes ${file}` };
  const diff = extractPatch(readFileSync(file, "utf8"));
  if (!diff) return { refused: `no patch in ${file}` };
  const why = patchReason(diff);
  if (why) return { refused: why };
  const root = rootArg ? resolve(rootArg) : pluginRoot(file);
  if (!root) return { refused: "no autopilot plugin root; pass --root" };
  const paths = patchPaths(diff);
  const link = linkIn(root, paths);
  if (link) return { refused: `path crosses a link ${link}` };
  const g = git(root, ["apply", "--check", "-p1"], diff);
  if (g.error || g.status !== 0) {
    const msg = ((g.stderr || g.stdout || String(g.error || "")).split(/\r?\n/).find((l) => l.trim()) ?? "git apply failed").trim();
    return { failed: msg };
  }
  return { ok: true, paths, diff, root };
}

const statusOf = (md) => /^Status:[ \t]*(\S.*?)[ \t]*$/m.exec(md)?.[1] ?? "unknown";

function list(dir) {
  let names = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".md")).sort();
  } catch {}
  const lines = [];
  for (const n of names) {
    let md;
    try {
      const f = join(dir, n);
      if (lstatSync(f).size > MAX_BYTES) continue;
      md = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const d = extractPatch(md);
    lines.push(`${n}: ${statusOf(md)}, ${d ? patchPaths(d).length : 0} files`);
  }
  return lines.length ? lines.join("\n") : "improve: no proposals";
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (cmd === "list") {
    console.log(list(resolve(flag("--dir") ?? join(process.cwd(), "docs", "improvements"))));
    return 0;
  }
  if (cmd !== "check" && cmd !== "apply") {
    console.error("usage: improve.mjs list|check|apply ...");
    return 1;
  }
  const file = rest.find((a, i) => !a.startsWith("--") && rest[i - 1] !== "--root" && rest[i - 1] !== "--dir");
  if (!file) {
    console.log("refused: no proposal file given");
    return 1;
  }
  const r = inspect(resolve(file), flag("--root"));
  if (r.refused) return (console.log(`refused: ${r.refused}`), 1);
  if (r.failed) return (console.log(`does not apply: ${r.failed}`), 1);
  const summary = `${r.paths.length} files would change: ${r.paths.join(", ")}`;
  if (cmd === "check") return (console.log(`ok: ${summary}`), 0);
  if (!rest.includes("--yes")) return (console.log(`ok: ${summary}\npass --yes to apply`), 0);
  const g = git(r.root, ["apply", "-p1"], r.diff);
  if (g.error || g.status !== 0) return (console.log(`does not apply: ${(g.stderr || "git apply failed").split(/\r?\n/)[0]}`), 1);
  const abs = resolve(file);
  writeFileSync(abs, readFileSync(abs, "utf8").replace(/^Status: proposed[ \t]*$/m, "Status: applied"));
  console.log(`applied: ${r.paths.length} files`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
