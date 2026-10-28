import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { problems, proposal, proposalPath } from "../scripts/retro.mjs";
import { node, tempDir, tempRepo } from "./helpers.mjs";

const cleanups = [];
after(() => cleanups.forEach((c) => c()));
const scratch = () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  return t.dir;
};
const repo = () => {
  const r = tempRepo();
  cleanups.push(r.cleanup);
  return r;
};
const lesson = (text, count) => ({ id: "x", scope: "repo", tags: [], text, count, last: "2026-10-01", projects: ["/a"] });
const HEAD = "# autopilot ledger: /w/docs/plans/2026-10-28-demo-plan\n";
const kinds = (ps) => ps.map((p) => p.kind);

test("repeated lesson", () => {
  const ps = problems({ ledger: HEAD, lessons: [lesson("seen twice -> fix it", 2), lesson("seen once -> ignore", 1)] });
  assert.deepEqual(kinds(ps), ["lesson"]);
  assert.match(ps[0].evidence[0], /seen twice/);
});

test("intervened twice", () => {
  const two = `${HEAD}intervene: task 03 stalled\nintervene: task 03 circular\nintervene: task 04 stalled\n`;
  const ps = problems({ ledger: two, lessons: [] });
  assert.deepEqual(kinds(ps), ["intervened"]);
  assert.equal(ps[0].evidence.length, 2);
  assert.ok(ps[0].evidence.every((l) => l.includes("task 03")));
});

test("escalation", () => {
  const ps = problems({ ledger: `${HEAD}task 05: fix round 3/3 senior\n`, lessons: [] });
  assert.deepEqual(kinds(ps), ["escalated"]);
  assert.deepEqual(problems({ ledger: `${HEAD}task 05: fix round 2/3\n`, lessons: [] }), []);
});

test("parked", () => {
  const ps = problems({ ledger: `${HEAD}task 07: parked no answer\n`, lessons: [] });
  assert.deepEqual(kinds(ps), ["parked"]);
});

test("evidence verbatim", () => {
  const long = `task 07: parked ${"x".repeat(300)}`;
  const ps = problems({ ledger: `${HEAD}${long}\n`, lessons: [] });
  const md = proposal({ plan: "/w/docs/plans/2026-10-28-demo-plan", run: "C:\\r\\run", date: "2026-10-28", problems: ps });
  assert.ok(md.includes(`- \`${long.slice(0, 200)}\``));
  assert.ok(!md.includes("x".repeat(201)));
  assert.match(md, /^# Improvement: demo-plan\nStatus: proposed\nRun: C:\/r\/run\nDate: 2026-10-28\n/);
  for (const s of ["## Problem", "## Evidence", "## Patch"]) assert.ok(md.includes(s));
  assert.match(md, /```diff\n```/);
});

test("no overwrite", () => {
  const r = repo();
  const p1 = proposalPath(r.dir, "2026-10-28", "demo");
  assert.ok(p1.replace(/\\/g, "/").endsWith("docs/improvements/2026-10-28-demo.md"));
  mkdirSync(join(r.dir, "docs", "improvements"), { recursive: true });
  writeFileSync(p1, "old");
  const p2 = proposalPath(r.dir, "2026-10-28", "demo");
  assert.ok(p2.endsWith("2026-10-28-demo-2.md"));
  writeFileSync(p2, "old");
  assert.ok(proposalPath(r.dir, "2026-10-28", "demo").endsWith("-3.md"));
});

function runCli(args) {
  const home = scratch();
  return node(home, "retro.mjs", args, { AUTOPILOT_HOME: home, HOME: home, USERPROFILE: home });
}

test("CLI: none, written, missing", () => {
  const r = repo();
  const run = scratch();
  writeFileSync(join(run, "ledger.md"), `${HEAD}task 01: done\n`);
  let o = runCli([run, "--out", r.dir, "--date", "2026-10-28"]);
  assert.equal(o.status, 0);
  assert.equal(o.out, "retro: none");
  assert.ok(!existsSync(join(r.dir, "docs", "improvements")));

  writeFileSync(join(run, "ledger.md"), `${HEAD}task 07: parked why\ntask 05: fix round 3/3\n`);
  o = runCli([run, "--out", r.dir, "--date", "2026-10-28"]);
  assert.equal(o.status, 0);
  const file = join(r.dir, "docs", "improvements", "2026-10-28-demo-plan.md");
  assert.match(o.out, /^retro: 2 repeated problems -> .*2026-10-28-demo-plan\.md$/);
  const md = readFileSync(file, "utf8");
  assert.match(md, /Status: proposed/);
  assert.match(md, /```diff\n```/);

  o = runCli([run, "--out", r.dir, "--date", "2026-10-28"]);
  assert.ok(existsSync(join(r.dir, "docs", "improvements", "2026-10-28-demo-plan-2.md")));

  o = runCli([join(run, "nope"), "--out", r.dir]);
  assert.equal(o.status, 0);
  assert.match(o.out, /^retro: no ledger at /);
});

test("CLI: a dangling proposal link creates no file at its target", () => {
  const r = repo();
  const run = scratch();
  const outside = scratch();
  writeFileSync(join(run, "ledger.md"), `${HEAD}task 07: parked why\ntask 05: fix round 3/3\n`);
  mkdirSync(join(r.dir, "docs", "improvements"), { recursive: true });
  const link = join(r.dir, "docs", "improvements", "2026-10-28-demo-plan.md");
  symlinkSync(join(outside, "never.md"), link);
  const o = runCli([run, "--out", r.dir, "--date", "2026-10-28"]);
  assert.equal(o.status, 0);
  assert.ok(!existsSync(join(outside, "never.md")), "nothing written through the link");
  assert.ok(existsSync(join(r.dir, "docs", "improvements", "2026-10-28-demo-plan-2.md")), "proposal goes to the -2 name");
});

test("CLI: a docs/improvements link creates nothing in its target directory", () => {
  const r = repo();
  const run = scratch();
  const outside = scratch();
  writeFileSync(join(run, "ledger.md"), `${HEAD}task 07: parked why\ntask 05: fix round 3/3\n`);
  mkdirSync(join(r.dir, "docs"), { recursive: true });
  symlinkSync(outside, join(r.dir, "docs", "improvements"));
  const o = runCli([run, "--out", r.dir, "--date", "2026-10-28"]);
  assert.equal(o.status, 0);
  assert.match(o.out, /refused/);
  assert.deepEqual(readdirSync(outside), []);
});
