import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { citations, decide, signals, unresolvedCitations } from "../scripts/detect.mjs";
import { node, scripts, tempDir, tempRepo } from "./helpers.mjs";

const cleanups = [];
after(() => cleanups.forEach((c) => c()));
const scratch = () => {
  const t = tempDir("forge-detect-");
  cleanups.push(t.cleanup);
  return t.dir;
};
const repoOf = (files) => {
  const r = tempRepo(files);
  cleanups.push(r.cleanup);
  return r;
};
const names = (xs) => xs.map((s) => s.signal);
const DONE = "DONE\nall good\n";

test("start writes clock.json", () => {
  const run = scratch();
  writeFileSync(join(run, "clock.json"), JSON.stringify({ "01": "2026-01-01T00:00:00.000Z" }));
  const r = node(run, "detect.mjs", ["start", run, "05"]);
  assert.equal(r.status, 0);
  assert.match(r.out, /^clock: task 05 started \d{4}-\d\d-\d\dT/);
  const clock = JSON.parse(readFileSync(join(run, "clock.json"), "utf8"));
  assert.equal(clock["01"], "2026-01-01T00:00:00.000Z");
  assert.ok(clock["05"]);
});

test("start refuses a clock.json link and leaves its target unchanged", () => {
  const run = scratch();
  const outside = scratch();
  writeFileSync(join(outside, "victim.json"), "user file\n");
  symlinkSync(join(outside, "victim.json"), join(run, "clock.json"));
  const r = node(run, "detect.mjs", ["start", run, "01"]);
  assert.equal(r.status, 0);
  assert.match(r.out, /refused/);
  assert.equal(readFileSync(join(outside, "victim.json"), "utf8"), "user file\n");
});

test("start refuses a dangling clock.json link and creates nothing at its target", () => {
  const run = scratch();
  const outside = scratch();
  symlinkSync(join(outside, "never.json"), join(run, "clock.json"));
  const r = node(run, "detect.mjs", ["start", run, "01"]);
  assert.equal(r.status, 0);
  assert.match(r.out, /refused/);
  assert.ok(!existsSync(join(outside, "never.json")));
});

test("stall at 90 minutes", () => {
  const s = signals({ ledger: "", report: DONE, elapsedMin: 90, criteria: 3 });
  assert.deepEqual(names(s), ["stall"]);
  assert.equal(s[0].remedy, "reset");
  assert.deepEqual(names(signals({ ledger: "", report: DONE, elapsedMin: 89, criteria: 3 })), []);
});

test("no verdict", () => {
  const s = signals({ ledger: "", report: "I ran out of ideas\n", elapsedMin: 5, criteria: 2 });
  assert.deepEqual(names(s), ["stall"]);
  assert.deepEqual(names(signals({ ledger: "", report: "BLOCKED: x\n", elapsedMin: 5 })).filter((n) => n === "stall"), []);
});

test("split big tasks", () => {
  const s = signals({ ledger: "", report: DONE, elapsedMin: 120, criteria: 8 });
  assert.equal(s[0].remedy, "split");
});

test("citations extracts paths and shas", () => {
  const c = citations("see `scripts/a.mjs:12` and `README.md` and `npm run x` done @ abc1234 also `deadbeef0`");
  assert.deepEqual(c.paths.sort(), ["README.md", "scripts/a.mjs"]);
  assert.deepEqual(c.shas.sort(), ["abc1234", "deadbeef0"]);
});

test("missing path", () => {
  const r = repoOf({ "src/a.js": "x\n" });
  const sha = r.git("rev-parse", "HEAD").out;
  const cites = citations("`src/a.js` and `src/ghost.js:3`");
  const bad = unresolvedCitations(r.dir, sha, cites);
  assert.deepEqual(bad, ["src/ghost.js"]);
  const s = signals({ ledger: "", report: DONE, unresolved: bad });
  assert.equal(s[0].signal, "hallucination");
  assert.equal(s[0].remedy, "findings");
  assert.match(s[0].evidence, /src\/ghost\.js/);
});

test("bogus sha", () => {
  const r = repoOf();
  const bad = unresolvedCitations(r.dir, null, citations("fixed @ 1234567abcdef"));
  assert.deepEqual(bad, ["1234567abcdef"]);
  const good = r.git("rev-parse", "HEAD").out.slice(0, 10);
  assert.deepEqual(unresolvedCitations(r.dir, null, citations(`ok @ ${good}`)), []);
});

test("skipped citations", () => {
  const r = repoOf();
  const text = "`https://example.test/a/b.js` `<plan>/x.md` `src/*.js` `/etc/hosts` `C:/Windows/x.dll`";
  assert.deepEqual(unresolvedCitations(r.dir, null, citations(text)), []);
});

test("autopilot paths are checked on disk", () => {
  const r = repoOf();
  mkdirSync(join(r.dir, ".autopilot", "reports"), { recursive: true });
  writeFileSync(join(r.dir, ".autopilot", "reports", "05.md"), "x");
  const c = citations("`.autopilot/reports/05.md` `.autopilot/reports/99.md`");
  assert.deepEqual(unresolvedCitations(r.dir, null, c), [".autopilot/reports/99.md"]);
});

test("blocked twice", () => {
  const ledger = [
    "task 05: blocked: cannot reach the registry for the install step",
    "task 05: blocked: cannot reach the registry for install step again",
  ].join("\n");
  const s = signals({ ledger, task: "05", report: DONE });
  assert.ok(names(s).includes("circular"));
  assert.equal(s.find((x) => x.signal === "circular").remedy, "senior");
  const other = "task 05: blocked: schema drift in tests\ntask 05: blocked: registry unreachable";
  assert.ok(!names(signals({ ledger: other, task: "05" })).includes("circular"));
});

test("fix rounds stuck", () => {
  const head = "task 05: dispatched (wave 2, lane 1)\n";
  const stuck = head + "wave 2: fix round 1/3: 3/6 addressed\nwave 2: fix round 2/3: 3/6 addressed\n";
  assert.ok(names(signals({ ledger: stuck, task: "05" })).includes("circular"));
  const rising = head + "wave 2: fix round 1/3: 3/6 addressed\nwave 2: fix round 2/3: 5/6 addressed\n";
  assert.ok(!names(signals({ ledger: rising, task: "05" })).includes("circular"));
  const otherWave = head + "wave 1: fix round 1/3: 3/6 addressed\nwave 1: fix round 2/3: 3/6 addressed\n";
  assert.ok(!names(signals({ ledger: otherWave, task: "05" })).includes("circular"));
});

test("missing context cue", () => {
  const s = signals({ ledger: "task 05: blocked: schema file not found in repo", task: "05" });
  assert.equal(s.find((x) => x.signal === "missing-context").remedy, "context");
});

test("unknowns", () => {
  const s = signals({ ledger: "", task: "05", report: "DONE\nUNKNOWN: a\nUNKNOWN: b\n" });
  assert.ok(names(s).includes("missing-context"));
  assert.ok(!names(signals({ ledger: "", task: "05", report: "DONE\nUNKNOWN: a\n" })).includes("missing-context"));
});

test("second trip pauses", () => {
  const found = [{ signal: "stall", evidence: "e", remedy: "reset" }, { signal: "circular", evidence: "e", remedy: "senior" }];
  const ledger = "intervene: task 05 stall -> reset\n";
  assert.deepEqual(decide({ ledger, task: "05", found }), ["PAUSE task 05: stall again after an intervention"]);
  assert.deepEqual(decide({ ledger: "", task: "05", found }), ["stall task 05: e -> reset", "circular task 05: e -> senior"]);
});

test("clear", () => {
  assert.deepEqual(decide({ ledger: "", task: "05", found: [] }), ["clear task 05"]);
});

test("CLI exits 0 with a missing RUN", () => {
  const dir = scratch();
  const r = node(dir, "detect.mjs", ["check", join(dir, "nope"), "05", "--report", join(dir, "none.md")]);
  assert.equal(r.status, 0);
  assert.equal(r.out, "clear task 05");
});

test("CLI check end to end", () => {
  const r = repoOf();
  const run = join(r.dir, ".autopilot", "runs", "p");
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, "clock.json"), JSON.stringify({ "05": "2026-01-01T00:00:00.000Z" }));
  writeFileSync(join(run, "ledger.md"), "# autopilot ledger: p\n");
  const rep = join(r.dir, "rep.md");
  writeFileSync(rep, DONE + "touched `nothing/here.js`\n");
  const out = node(r.dir, "detect.mjs", ["check", run, "05", "--report", rep, "--now", "2026-01-01T01:30:00.000Z"]);
  assert.equal(out.status, 0);
  assert.match(out.out, /^stall task 05: .* -> reset$/m);
  assert.match(out.out, /^hallucination task 05: .*nothing\/here\.js.* -> findings$/m);
  assert.ok(existsSync(rep));
});

test("start refuses when .autopilot or .autopilot/runs is a link and writes nothing outside", () => {
  for (const which of ["ap", "runs"]) {
    const repo = scratch();
    const outside = scratch();
    if (which === "ap") symlinkSync(outside, join(repo, ".autopilot"));
    else {
      mkdirSync(join(repo, ".autopilot"));
      symlinkSync(outside, join(repo, ".autopilot", "runs"));
    }
    const run = join(repo, ".autopilot", "runs", "p");
    const r = node(repo, "detect.mjs", ["start", run, "01"]);
    assert.equal(r.status, 0);
    assert.match(r.out, /refused/, which);
    assert.ok(!existsSync(join(outside, "p")) && !existsSync(join(outside, "runs")), which);
  }
});

// ---- round 3 (R3-5): repository text is data ----
const FAKE_SHELL = "missing file $(id) `x` | sh";

test("check prints evidence without shell metacharacters", () => {
  const run = scratch();
  writeFileSync(join(run, "ledger.md"), `task 01: blocked: ${FAKE_SHELL}\ntask 01: blocked: ${FAKE_SHELL} again\n`);
  const r = node(run, "detect.mjs", ["check", run, "01"]);
  assert.equal(r.status, 0);
  const lines = r.out.split("\n");
  assert.ok(lines.some((l) => /^circular task 01: .* -> senior$/.test(l)), r.out);
  assert.ok(lines.some((l) => /^missing-context task 01: .* -> context$/.test(l)), r.out);
  for (const l of lines) assert.doesNotMatch(l.split(": ").slice(1).join(": "), /[$`|]/, l);
});

test("check with a ledger link to /dev/zero returns at once", { skip: process.platform !== "linux" }, () => {
  const run = scratch();
  symlinkSync("/dev/zero", join(run, "ledger.md"));
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(scripts, "detect.mjs"), "check", run, "01"], { encoding: "utf8", timeout: 5000 });
  assert.equal(r.signal, null);
  assert.equal(r.status, 0);
  assert.ok(Date.now() - t0 < 2000);
});

test("check ignores a clock.json link", () => {
  const run = scratch();
  const out = scratch();
  writeFileSync(join(out, "c.json"), JSON.stringify({ "01": "2000-01-01T00:00:00Z" }));
  symlinkSync(join(out, "c.json"), join(run, "clock.json"));
  const r = node(run, "detect.mjs", ["check", run, "01"]);
  assert.doesNotMatch(r.out, /stall/);
});
