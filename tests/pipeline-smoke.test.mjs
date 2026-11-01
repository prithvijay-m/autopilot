// One behavioural check of the run-state scripts together, the way a session meets them: a repository with a plan
// and a ledger, then status, copilots, host-load, pause set/show/clear and the pause hook, each as its own process.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { node, scripts, tempRepo } from "./helpers.mjs";

const rows = [["01", "none", "a/"], ["02", "01", "a/x.js"], ["03", "02", "a/y.js"], ["04", "none", "b/"], ["05", "04", "b/x.js"], ["06", "05", "b/y.js"]];
const planText = [
  "# Plan", "", "Status: approved", "",
  "| Field | Value |", "|---|---|", "| Integration branch | `autopilot/x` |", "| Lanes | 4 |", "",
  "| # | Task | Agent | Skills | Blocked by | Touches |", "|---|---|---|---|---|---|",
  ...rows.map(([id, deps, touches]) => `| ${id} | t${id} | coder | none | ${deps} | ${touches} |`),
].join("\n") + "\n";

const r = tempRepo();
after(() => r.cleanup());
const planDir = join(r.dir, "docs", "plans", "x");
const ledger = join(r.dir, ".autopilot", "runs", "x", "ledger.md");
r.write("docs/plans/x/plan.md", planText);
r.write(".autopilot/runs/x/ledger.md", `# autopilot ledger: ${planDir}\ntask 01: dispatched (wave 1, start abc1234)\ntask 01: done autopilot-lane/x/01 @ abc1234\ntask 01: integrated @ abc1234\ntask 02: dispatched (wave 2, start abc1234)\n`);
const hook = (type) =>
  spawnSync(process.execPath, [join(scripts, "pause.mjs"), "--hook"], {
    cwd: r.dir,
    encoding: "utf8",
    input: JSON.stringify({ tool_name: "Task", tool_input: { subagent_type: type }, cwd: r.dir }),
  });

test("status reads the ledger", () => {
  const s = node(r.dir, "status.mjs");
  assert.equal(s.status, 0);
  assert.match(s.out, /^autopilot x: 1\/\d+ tasks integrated, 1 in flight, wave 2\./);
  const j = JSON.parse(node(r.dir, "status.mjs", ["--json"]).out);
  assert.equal(j.plan, "x");
  assert.equal(j.integrated, 1);
  assert.equal(j.inFlight, 1);
  assert.equal(j.paused, null);
});

test("copilots splits the plan into two independent crews, and shrinks it as tasks integrate", () => {
  assert.match(node(r.dir, "copilots.mjs", [planDir, "4"]).out, /^copilots: 2 \(.*\) c1: 01,02,03 \| c2: 04,05,06$/);
  assert.match(node(r.dir, "copilots.mjs", [planDir, "4", "--ledger", ledger]).out, /^copilots: 0 \(/);
  assert.match(node(r.dir, "copilots.mjs", [planDir, "4", "--copilot"]).out, /^copilots: 0 \(a copilot never spawns copilots\)$/);
});

test("host-load never says zero lanes and never exceeds the plan", () => {
  const out = node(r.dir, "host-load.mjs", ["3"]).out;
  assert.match(out, /^lanes: [1-3] of 3 \(/);
  const j = JSON.parse(node(r.dir, "host-load.mjs", ["3", "--json"]).out);
  assert.ok(j.lanes >= 1 && j.lanes <= 3 && j.max === 3);
});

test("pause set, show, the hook and clear agree", () => {
  assert.equal(node(r.dir, "pause.mjs", ["show"]).out, "no paused run");
  assert.equal(hook("autopilot:coder").status, 0, "nothing paused: the dispatch goes through");

  assert.equal(node(r.dir, "pause.mjs", ["set", "x", "task 02 stuck again"]).out, "paused: x: task 02 stuck again");
  assert.equal(node(r.dir, "pause.mjs", ["show"]).out, "paused: x: task 02 stuck again");
  assert.equal(JSON.parse(node(r.dir, "status.mjs", ["--json"]).out).paused, "task 02 stuck again");

  const blocked = hook("autopilot:coder");
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /run x is paused \(task 02 stuck again\)/);
  assert.match(blocked.stderr, /\/autopilot:resume/);
  assert.equal(hook("autopilot:scout").status, 0, "an agent outside the build crew is not held");

  assert.match(node(r.dir, "pause.mjs", ["clear", "x"]).out, /^resumed: x/);
  assert.equal(node(r.dir, "pause.mjs", ["show"]).out, "no paused run");
  assert.equal(hook("autopilot:coder").status, 0, "cleared: the dispatch goes through");
});
