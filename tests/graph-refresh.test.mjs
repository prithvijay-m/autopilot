import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { node, tempDir, tempRepo } from "./helpers.mjs";

const hasGraphify = spawnSync("graphify", ["--help"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;

test("without graphify installed it says so and never fails the caller", () => {
  const r = tempRepo();
  try {
    const out = node(r.dir, "graph-refresh.mjs", [r.dir], { PATH: "/nonexistent" });
    assert.equal(out.status, 0);
    assert.match(out.out, /^graph: skipped \(graphify is not installed/);
  } finally {
    r.cleanup();
  }
});

test("a repository with no code reports 'none yet' (or skips) and keeps .autopilot out of git status", { skip: !hasGraphify && "graphify is not installed" }, () => {
  const r = tempRepo({ "README.md": "# docs only\n" });
  try {
    const out = node(r.dir, "graph-refresh.mjs", [r.dir]);
    assert.equal(out.status, 0);
    assert.match(out.out, /^graph: /);
    assert.match(readFileSync(join(r.dir, ".git", "info", "exclude"), "utf8"), /\.autopilot\//);
  } finally {
    r.cleanup();
  }
});

// A fake `graphify` on PATH: logs its arguments, fails with $FAKE_MSG unless called with --force.
function fakeGraphify(files) {
  const r = tempRepo(files);
  const bin = join(r.dir, ".bin");
  mkdirSync(bin);
  const log = join(r.dir, ".calls");
  writeFileSync(join(bin, "graphify"), `#!/bin/sh\necho "$@" >> "${log}"\ncase " $* " in *" --force "*) exit 0;; esac\necho "$FAKE_MSG"\nexit 1\n`, { mode: 0o755 });
  mkdirSync(join(r.dir, "graphify-out"));
  writeFileSync(join(r.dir, "graphify-out", "graph.json"), '{"nodes":[],"links":[]}');
  const run = (msg) => node(r.dir, "graph-refresh.mjs", [r.dir], { PATH: `${bin}:${process.env.PATH}`, FAKE_MSG: msg });
  const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
  return { r, run, calls };
}
const posix = { skip: process.platform === "win32" && "needs a shell script" };

test("a plain update failure is reported stale and never retried with --force", posix, () => {
  const { r, run, calls } = fakeGraphify({ "a.js": "1\n" });
  try {
    assert.match(run("boom").out, /^graph: stale \(update failed: boom\)/);
    assert.deepEqual(calls(), ["update ."]);
  } finally {
    r.cleanup();
  }
});

test("a shrink refusal without deleted files is not forced", posix, () => {
  const { r, run, calls } = fakeGraphify({ "a.js": "1\n" });
  try {
    assert.match(run("refusing: graph would shrink").out, /^graph: stale/);
    assert.deepEqual(calls(), ["update ."]);
  } finally {
    r.cleanup();
  }
});

test("a shrink refusal after tracked files were deleted is forced", posix, () => {
  const { r, run, calls } = fakeGraphify({ "a.js": "1\n" });
  try {
    rmSync(join(r.dir, "a.js"));
    assert.match(run("refusing: graph would shrink").out, /^graph: updated, 0 nodes, 0 edges .*forced/);
    assert.deepEqual(calls(), ["update .", "update . --force"]);
  } finally {
    r.cleanup();
  }
});

test("a linked .git/info is not written through", posix, () => {
  const { r, run } = fakeGraphify({ "a.js": "1\n" });
  const target = tempDir();
  try {
    rmSync(join(r.dir, ".git", "info"), { recursive: true, force: true });
    symlinkSync(target.dir, join(r.dir, ".git", "info"));
    run("boom");
    assert.equal(existsSync(join(target.dir, "exclude")), false);
  } finally {
    target.cleanup();
    r.cleanup();
  }
});
