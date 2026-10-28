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
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

// Every spelling git accepts for the two sides of a rename or copy.
const MOVE = /^(?:rename|copy) (from|to|old|new) (.*)$/;

/** Every path named by the ---, +++, rename and copy lines (a/ and b/ stripped), without /dev/null. */
export function patchPaths(diff) {
  const out = [];
  const add = (p) => p !== "/dev/null" && !out.includes(p) && out.push(p);
  for (const line of String(diff).split("\n")) {
    let m;
    if ((m = /^(?:---|\+\+\+) (.*)$/.exec(line))) {
      const p = clean(m[1]);
      add(/^[ab]\//.test(p) ? p.slice(2) : p);
    } else if ((m = MOVE.exec(line))) add(clean(m[2]));
    else if ((m = /^diff --git a\/(.*) b\/(.*)$/.exec(line)) && !m[1].includes(" b/")) add(m[1]), add(m[2]);
  }
  return out;
}

/** The source path of every rename or copy section, in order. git's numstat does not list them. */
function movedFrom(diff) {
  const out = [];
  for (const line of String(diff).split("\n")) {
    const m = MOVE.exec(line);
    if (m && (m[1] === "from" || m[1] === "old")) out.push(clean(m[2]));
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
  if (segs.some((s) => s.toLowerCase() === ".git" || s === "." || /[ .]$/.test(s))) return false;
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

const SAFE_MODES = new Set([0o100644, 0o100755]);

/** First reason the patch text must not be applied, or null. Path checks on git's own list follow. */
function patchReason(diff) {
  if (/^GIT binary patch/m.test(diff) || /^Binary files /m.test(diff)) return "binary patches are not accepted";
  if (/^copy (?:from|to) /m.test(diff)) return "copy patches are not accepted";
  for (const line of diff.split("\n")) {
    let m;
    if ((m = /^(?:old|new|deleted file|new file) mode\s+(\S*)/.exec(line)) || (m = /^index \S+\s+(\S+)\s*$/.exec(line))) {
      if (!/^[0-7]+$/.test(m[1]) || !SAFE_MODES.has(parseInt(m[1], 8))) return `file mode not accepted ${m[1]}`;
    } else if (line.startsWith("diff --git ") && !/^diff --git a\/[^"\s][^"]* b\/[^"\s][^"]*$/.test(line)) {
      return `diff header not in the plain a/<path> b/<path> form ${line.slice(0, 80)}`;
    } else if ((m = /^(---|\+\+\+) (.*)$/.exec(line))) {
      const p = clean(m[2]);
      if (p !== "/dev/null" && !p.startsWith(m[1] === "---" ? "a/" : "b/")) return "patch paths must use the a/ and b/ prefixes";
    }
  }
  for (const p of patchPaths(diff)) {
    const r = pathReason(p);
    if (r) return r;
  }
  return null;
}

/**
 * Files the patch touches: git's own numstat list (one entry per section, the new name of a
 * rename or copy) plus the source of every rename or copy. A path named by more than one
 * section is refused: git applies such a patch forward, but the result cannot be checked in
 * reverse, so it is never applied.
 */
function gitPaths(root, diff) {
  const g = git(root, ["apply", "--numstat", "-z", "-p1"], diff);
  if (g.error || g.status !== 0) return { failed: firstLine(g) };
  const parts = g.stdout.split("\0");
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const m = /^(?:\d+|-)\t(?:\d+|-)\t([\s\S]*)$/.exec(parts[i]);
    if (!m) continue;
    if (m[1] === "") out.push(parts[(i += 2)]); // two-name form: keep the new name, movedFrom adds the source
    else out.push(m[1]);
  }
  const named = [...out.filter((p) => p), ...movedFrom(diff)];
  const twice = named.find((p, i) => named.indexOf(p) !== i);
  if (twice) return { refused: `path named in more than one section ${twice}` };
  return { paths: named };
}

const firstLine = (g) => ((g.stderr || g.stdout || String(g.error || "")).split(/\r?\n/).find((l) => l.trim()) ?? "git apply failed").trim();

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

const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));

/** git with no GIT_* variables and no discovery above root, so it cannot act on a surrounding repository. */
const git = (root, args, input) => {
  const env = cleanEnv();
  env.GIT_CEILING_DIRECTORIES = dirname(root);
  return spawnSync("git", args, { cwd: root, input, encoding: "utf8", env });
};

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
  if (!existsSync(root)) return { refused: `no such directory ${root}` };
  const outer = spawnSync("git", ["rev-parse", "--show-prefix"], { cwd: root, encoding: "utf8", env: cleanEnv() });
  if (outer.status === 0 && outer.stdout.trim() !== "") return { refused: `root is not the top of its git work tree ${root}` };
  const listed = gitPaths(root, diff);
  if (listed.refused) return { refused: listed.refused };
  if (listed.failed) return { failed: listed.failed };
  const { paths } = listed;
  if (!paths.length) return { refused: `no files in the patch ${file}` };
  if (paths.length > MAX_FILES) return { refused: `more than ${MAX_FILES} files` };
  for (const p of paths) {
    const r = pathReason(p);
    if (r) return { refused: r };
  }
  const link = linkIn(root, paths);
  if (link) return { refused: `path crosses a link ${link}` };
  const g = git(root, ["apply", "--check", "-p1"], diff);
  if (g.error || g.status !== 0) return { failed: firstLine(g) };
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

/** True when the working tree shows the change: the patch applies in reverse. */
const reverses = (root, diff) => git(root, ["apply", "--check", "-R", "-p1"], diff).status === 0;

/** Run one command; returns the exit code. `verify` is replaceable so tests can reach its failure branch. */
export function main(argv, { verify = reverses } = {}) {
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
  // git apply returned 0, so files were written: never report "does not apply" from here on.
  if (!verify(r.root, r.diff)) return (console.log(`applied but not verified: ${r.paths.join(", ")} changed; review with git diff`), 1);
  const abs = resolve(file);
  writeFileSync(abs, readFileSync(abs, "utf8").replace(/^Status: proposed[ \t]*$/m, "Status: applied"));
  console.log(`applied: ${r.paths.length} files`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = main(process.argv.slice(2));
