import assert from "node:assert/strict";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PLAN_NAME, readRepoFile, runNames, sanitize, validName } from "../scripts/repo-read.mjs";
import { tempDir } from "./helpers.mjs";

const linux = process.platform === "linux";
const scripts = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts");

test("validName: one plain directory name", () => {
  for (const ok of ["demo", "a.b-c_d", "2026-01-01-x", "demo-c1"]) assert.equal(validName(ok), true, ok);
  for (const bad of ["", "-x", ".x", "a..b", "a/b", "a b", "x`id`", "x$(id)", "x|sh", "a".repeat(101), null, 5, undefined]) assert.equal(validName(bad), false, String(bad));
  assert.equal(validName("a".repeat(100)), true);
  assert.ok(PLAN_NAME.test("demo"));
});

test("sanitize keeps only the plain allowlist", () => {
  assert.equal(sanitize("a `b` $(c) | d\u001b[31m"), "a b (c) d 31m");
  assert.equal(sanitize("x".repeat(500)).length, 200);
  assert.equal(sanitize("x".repeat(500), 10).length, 10);
  assert.equal(sanitize(null), "");
});

test("readRepoFile reads a regular file and refuses links, directories and missing paths", () => {
  const t = tempDir("forge-rr-");
  try {
    const f = join(t.dir, "f.txt");
    writeFileSync(f, "hello");
    assert.equal(readRepoFile(f), "hello");
    symlinkSync(f, join(t.dir, "link.txt"));
    assert.equal(readRepoFile(join(t.dir, "link.txt")), null);
    mkdirSync(join(t.dir, "d"));
    assert.equal(readRepoFile(join(t.dir, "d")), null);
    assert.equal(readRepoFile(join(t.dir, "missing")), null);
    symlinkSync(join(t.dir, "missing"), join(t.dir, "dangling"));
    assert.equal(readRepoFile(join(t.dir, "dangling")), null);
  } finally {
    t.cleanup();
  }
});

test("readRepoFile returns null for a link to /dev/zero, at once", { skip: !linux }, () => {
  const t = tempDir("forge-rr-");
  try {
    symlinkSync("/dev/zero", join(t.dir, "z"));
    const t0 = Date.now();
    assert.equal(readRepoFile(join(t.dir, "z")), null);
    assert.ok(Date.now() - t0 < 2000);
  } finally {
    t.cleanup();
  }
});

test("readRepoFile reads at most max bytes", () => {
  const t = tempDir("forge-rr-");
  try {
    const f = join(t.dir, "big");
    writeFileSync(f, "x".repeat(5000));
    assert.equal(readRepoFile(f, 100).length, 100);
    assert.equal(readRepoFile(f).length, 5000);
    writeFileSync(f, "y".repeat(3 * 1024 * 1024));
    assert.equal(readRepoFile(f).length, 1024 * 1024);
  } finally {
    t.cleanup();
  }
});

test("runNames keeps only valid real run directories", { skip: process.platform === "win32" }, () => {
  const t = tempDir("forge-rr-");
  const out = tempDir("forge-rr-out-");
  try {
    const runs = join(t.dir, ".autopilot", "runs");
    mkdirSync(runs, { recursive: true });
    for (const n of ["good", "good-c1", "x `id` $(id) | sh", "a..b", "-x", ".x", "a".repeat(101)]) mkdirSync(join(runs, n));
    symlinkSync(out.dir, join(runs, "linked"));
    writeFileSync(join(runs, "afile"), "x");
    assert.deepEqual(runNames(t.dir).sort(), ["good", "good-c1"]);
  } finally {
    t.cleanup();
    out.cleanup();
  }
});

test("runNames is empty when .autopilot or runs is a link or absent", () => {
  const t = tempDir("forge-rr-");
  const out = tempDir("forge-rr-out-");
  try {
    mkdirSync(join(out.dir, "runs", "y"), { recursive: true });
    assert.deepEqual(runNames(t.dir), []);
    symlinkSync(out.dir, join(t.dir, ".autopilot"));
    assert.deepEqual(runNames(t.dir), []);
    const u = tempDir("forge-rr-");
    try {
      mkdirSync(join(u.dir, ".autopilot"));
      symlinkSync(join(out.dir, "runs"), join(u.dir, ".autopilot", "runs"));
      assert.deepEqual(runNames(u.dir), []);
    } finally {
      u.cleanup();
    }
  } finally {
    t.cleanup();
    out.cleanup();
  }
});

test("class guard: scripts that read repository state use no raw read", () => {
  const allowed = ["readFileSync(0", "existsSync(file)", "existsSync(join(repo, p))"];
  for (const name of ["status", "pause", "detect", "retro", "copilots"]) {
    let src = readFileSync(join(scripts, `${name}.mjs`), "utf8");
    for (const a of allowed) src = src.split(a).join("");
    for (const raw of ["readFileSync(", "readdirSync(", "existsSync("]) assert.ok(!src.includes(raw), `${name}.mjs has a raw ${raw}: route it through repo-read.mjs`);
  }
});
