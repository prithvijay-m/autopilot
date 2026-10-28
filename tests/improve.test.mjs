import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allowedPath, extractPatch, patchPaths, pluginRoot } from "../scripts/improve.mjs";
import { node, tempDir, tempRepo } from "./helpers.mjs";

const cleanups = [];
after(() => cleanups.forEach((c) => c()));
const plugin = (extra = {}) => {
  const r = tempRepo({
    ".claude-plugin/plugin.json": '{ "name": "autopilot" }\n',
    "scripts/a.mjs": "one\ntwo\n",
    "docs/improvements/.keep": "",
    ...extra,
  });
  cleanups.push(r.cleanup);
  return r;
};
const scratch = () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  return t.dir;
};
const EDIT = "diff --git a/scripts/a.mjs b/scripts/a.mjs\n--- a/scripts/a.mjs\n+++ b/scripts/a.mjs\n@@ -1,2 +1,2 @@\n-one\n+uno\n two\n";
const prop = (patch, status = "proposed") => `# Improvement: demo\nStatus: ${status}\n\n## Problem\n- x\n\n## Patch\n\`\`\`diff\n${patch}\`\`\`\n`;
const put = (r, name, text) => (r.write(`docs/improvements/${name}`, text), join(r.dir, "docs", "improvements", name));
const improve = (cwd, args) => node(cwd, "improve.mjs", args);
const run = (r, args) => improve(r.dir, args);

test("extractPatch", () => {
  assert.equal(extractPatch(prop(EDIT)), EDIT);
  assert.equal(extractPatch(prop("")), null);
  assert.equal(extractPatch("# x\n```diff\nzzz\n```\n"), null);
  assert.equal(extractPatch("no patch here"), null);
});

test("patchPaths", () => {
  const d = "--- a/x/one\n+++ b/x/one\nrename from y\nrename to z\ncopy from c1\ncopy to c2\n--- /dev/null\n+++ b/new\n";
  assert.deepEqual(patchPaths(d), ["x/one", "y", "z", "c1", "c2", "new"]);
});

test("allowedPath", () => {
  for (const p of ["agents/a.md", "scripts/x.mjs", "tests/t/x", "tools/v.mjs", "hooks/h.json", "skills/s/SKILL.md", "commands/c.md", "docs/d.md", "README.md"]) assert.equal(allowedPath(p), true, p);
  for (const p of ["/x", "C:\\x", "\\\\x", "scripts/../x", "..", "a/../scripts/x", ".claude-plugin/plugin.json", ".github/workflows/x.yml", "package.json", "scripts", "docs/.git/config", "scripts\\..\\x"]) assert.equal(allowedPath(p), false, p);
});

test("pluginRoot", () => {
  const r = plugin();
  assert.equal(pluginRoot(join(r.dir, "docs", "improvements", "p.md")), r.dir);
  assert.equal(pluginRoot(join(scratch(), "p.md")), null);
});

test("list", () => {
  const r = plugin();
  put(r, "a.md", prop(EDIT));
  put(r, "b.md", prop(EDIT, "applied"));
  const o = run(r, ["list"]);
  assert.equal(o.status, 0);
  assert.match(o.out, /a\.md: proposed, 1 files/);
  assert.match(o.out, /b\.md: applied, 1 files/);
});

test("list with none", () => {
  const d = scratch();
  const o = improve(d, ["list"]);
  assert.equal(o.status, 0);
  assert.equal(o.out, "improve: no proposals");
  assert.equal(improve(d, ["list", "--dir", join(d, "nope")]).out, "improve: no proposals");
});

test("check ok", () => {
  const r = plugin();
  const f = put(r, "p.md", prop(EDIT));
  const o = run(r, ["check", f]);
  assert.equal(o.status, 0, o.err);
  assert.equal(o.out, "ok: 1 files would change: scripts/a.mjs");
});

test("absolute refused", () => {
  const r = plugin();
  const f = put(r, "p.md", prop("--- a//etc/x\n+++ b//etc/x\n@@ -1 +1 @@\n-a\n+b\n"));
  const o = run(r, ["check", f]);
  assert.equal(o.status, 1);
  assert.match(o.out, /^refused: absolute path /);
});

test("dotdot refused", () => {
  const r = plugin();
  const f = put(r, "p.md", prop("--- a/scripts/../../x\n+++ b/scripts/../../x\n@@ -1 +1 @@\n-a\n+b\n"));
  const o = run(r, ["check", f]);
  assert.equal(o.status, 1);
  assert.match(o.out, /^refused: path leaves the plugin /);
});

test("rename refused", () => {
  const r = plugin();
  const f = put(r, "p.md", prop("diff --git a/scripts/a.mjs b/.github/workflows/x.yml\nsimilarity index 100%\nrename from scripts/a.mjs\nrename to .github/workflows/x.yml\n"));
  const o = run(r, ["check", f]);
  assert.equal(o.status, 1);
  assert.match(o.out, /^refused: path outside the plugin's own folders \.github\/workflows\/x\.yml/);
});

test("header-only path refused", () => {
  const r = plugin();
  const f = put(r, "p.md", prop("diff --git a/.github/x.yml b/.github/x.yml\nnew file mode 100644\nindex 0000000..e69de29\n"));
  const o = run(r, ["check", f]);
  assert.equal(o.status, 1);
  assert.match(o.out, /^refused: path outside/);
});

test("outside refused", () => {
  const r = plugin();
  const f = put(r, "p.md", prop("--- a/.claude-plugin/plugin.json\n+++ b/.claude-plugin/plugin.json\n@@ -1 +1 @@\n-a\n+b\n"));
  const o = run(r, ["check", f]);
  assert.equal(o.status, 1);
  assert.match(o.out, /^refused: path outside the plugin's own folders \.claude-plugin\/plugin\.json/);
});

test("unprefixed path refused", () => {
  const r = plugin();
  const f = put(r, "p.md", prop("--- scripts/a.mjs\n+++ scripts/a.mjs\n@@ -1 +1 @@\n-one\n+x\n"));
  assert.equal(run(r, ["check", f]).status, 1);
});

test("symlink and binary refused", () => {
  const r = plugin();
  const l = put(r, "l.md", prop("diff --git a/scripts/l b/scripts/l\nnew file mode 120000\nindex 0000000..e69de29\n--- /dev/null\n+++ b/scripts/l\n@@ -0,0 +1 @@\n+/etc/passwd\n\\ No newline at end of file\n"));
  assert.match(run(r, ["check", l]).out, /^refused: /);
  const b = put(r, "b.md", prop("diff --git a/scripts/b b/scripts/b\nnew file mode 100644\nGIT binary patch\nliteral 0\n"));
  assert.match(run(r, ["check", b]).out, /^refused: /);
});

test("link in the target path refused", () => {
  const r = plugin();
  const out = scratch();
  writeFileSync(join(out, "a.mjs"), "one\ntwo\n");
  mkdirSync(join(r.dir, "tests"), { recursive: true });
  try {
    symlinkSync(out, join(r.dir, "tests", "ln"), "dir");
  } catch {
    return; // no symlink permission on this host
  }
  const f = put(r, "p.md", prop("--- a/tests/ln/a.mjs\n+++ b/tests/ln/a.mjs\n@@ -1,2 +1,2 @@\n-one\n+uno\n two\n"));
  const o = run(r, ["apply", f, "--yes"]);
  assert.equal(o.status, 1);
  assert.equal(readFileSync(join(out, "a.mjs"), "utf8"), "one\ntwo\n");
});

test("empty patch", () => {
  const r = plugin();
  const f = put(r, "p.md", prop(""));
  const o = run(r, ["check", f]);
  assert.equal(o.status, 1);
  assert.match(o.out, /^refused: no patch in /);
});

test("apply without yes", () => {
  const r = plugin();
  const f = put(r, "p.md", prop(EDIT));
  const o = run(r, ["apply", f]);
  assert.equal(o.status, 0);
  assert.match(o.out, /^ok: 1 files would change: scripts\/a\.mjs/);
  assert.match(o.out, /pass --yes to apply/);
  assert.equal(readFileSync(join(r.dir, "scripts", "a.mjs"), "utf8"), "one\ntwo\n");
  assert.match(readFileSync(f, "utf8"), /^Status: proposed$/m);
});

test("apply", () => {
  const r = plugin();
  const f = put(r, "p.md", prop(EDIT));
  const o = run(r, ["apply", f, "--yes"]);
  assert.equal(o.status, 0, o.err + o.out);
  assert.equal(o.out, "applied: 1 files");
  assert.equal(readFileSync(join(r.dir, "scripts", "a.mjs"), "utf8"), "uno\ntwo\n");
  assert.match(readFileSync(f, "utf8"), /^Status: applied$/m);
});

test("stale patch", () => {
  const r = plugin({ "scripts/a.mjs": "changed\nlines\n" });
  const f = put(r, "p.md", prop(EDIT));
  const o = run(r, ["apply", f, "--yes"]);
  assert.equal(o.status, 1);
  assert.match(o.out, /^does not apply: /);
  assert.match(readFileSync(f, "utf8"), /^Status: proposed$/m);
  assert.equal(readFileSync(join(r.dir, "scripts", "a.mjs"), "utf8"), "changed\nlines\n");
});

test("no root", () => {
  const d = scratch();
  const f = join(d, "p.md");
  writeFileSync(f, prop(EDIT));
  const o = improve(d, ["check", f]);
  assert.equal(o.status, 1);
  assert.equal(o.out, "refused: no autopilot plugin root; pass --root");
});

test("--root given", () => {
  const r = plugin();
  const d = scratch();
  const f = join(d, "p.md");
  writeFileSync(f, prop(EDIT));
  const o = improve(d, ["check", f, "--root", r.dir]);
  assert.equal(o.status, 0, o.out);
});

test("oversized proposal refused", () => {
  const r = plugin();
  const f = put(r, "p.md", prop(EDIT) + "x".repeat(2_000_000));
  const o = run(r, ["check", f]);
  assert.equal(o.status, 1);
  assert.match(o.out, /^refused: /);
});
