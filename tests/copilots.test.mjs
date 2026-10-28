import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { groups, integrated, overlaps, parsePlan, size } from "../scripts/copilots.mjs";
import { node, tempDir } from "./helpers.mjs";

const plan = (rows) =>
  ["# Plan", "", "| # | Task | Agent | Skills | Blocked by | Touches |", "|---|---|---|---|---|---|",
    ...rows.map(([id, deps, touches]) => `| ${id} | t${id} | coder | none | ${deps} | ${touches} |`)].join("\n");

const tasks = (rows) => parsePlan(plan(rows));

describe("parsePlan", () => {
  test("parses the task graph", () => {
    const t = tasks([["01", "none", "a.js, b.js"], ["02", "01, 03", "c/"]]);
    assert.deepEqual(t, [
      { id: "01", deps: [], touches: ["a.js", "b.js"] },
      { id: "02", deps: ["01", "03"], touches: ["c"] },
    ]);
  });
  test("ignores brace and backtick decoration", () => {
    assert.deepEqual(tasks([["01", "none", "`lib/{x.js}`"]])[0].touches, ["lib/x.js"]);
  });
  test("ignores other tables", () => {
    assert.deepEqual(parsePlan("| a | b |\n|---|---|\n| 1 | 2 |\n"), []);
  });
});

test("overlaps: equal or directory prefix only", () => {
  assert.ok(overlaps("a.js", "a.js"));
  assert.ok(overlaps("skills/cockpit", "skills/cockpit/SCOUT.md"));
  assert.ok(!overlaps("skills/cock", "skills/cockpit/x"));
});

test("integrated reads ledger lines", () => {
  assert.deepEqual([...integrated("task 03: integrated\ntask 04: started\ntask 05: integrated abc\n")].sort(), ["03", "05"]);
});

describe("groups", () => {
  test("shared file joins", () => {
    assert.deepEqual(groups(tasks([["01", "none", "a.js"], ["02", "none", "a.js"], ["03", "none", "z.js"]])), [["01", "02"], ["03"]]);
  });
  test("prefix joins", () => {
    assert.deepEqual(groups(tasks([["01", "none", "skills/cockpit"], ["02", "none", "skills/cockpit/SCOUT.md"]])), [["01", "02"]]);
  });
  test("edges join", () => {
    assert.deepEqual(groups(tasks([["01", "none", "a"], ["02", "01", "b"], ["03", "02", "c"], ["04", "none", "d"]])), [["01", "02", "03"], ["04"]]);
  });
  test("done tasks leave", () => {
    const t = tasks([["01", "none", "a"], ["02", "01", "b"], ["03", "none", "c"]]);
    assert.deepEqual(groups(t, new Set(["01"])), [["02"], ["03"]]);
  });
  test("sorted by lowest id", () => {
    assert.deepEqual(groups(tasks([["05", "none", "e"], ["02", "none", "b"], ["03", "02", "c"]])), [["02", "03"], ["05"]]);
  });
});

describe("size", () => {
  const g = (n, start) => Array.from({ length: n }, (_, i) => String(start + i).padStart(2, "0"));
  test("K is the smaller of qualifying groups and host lanes", () => {
    const r = size({ groups: [g(3, 1), g(3, 11), g(3, 21)], hostLanes: 2 });
    assert.equal(r.copilots, 2);
    assert.equal(r.lanesEach, 1);
  });
  test("one group, no copilots", () => {
    assert.deepEqual(size({ groups: [g(5, 1), g(2, 11)], hostLanes: 8 }), { copilots: 0, crews: [], lanesEach: 0 });
  });
  test("crews cover every task", () => {
    const gs = [g(4, 1), g(3, 11), g(3, 21), g(1, 31), g(2, 41)];
    const r = size({ groups: gs, hostLanes: 3 });
    assert.equal(r.crews.length, 3);
    assert.deepEqual(r.crews.flat().sort(), gs.flat().sort());
  });
  test("largest first into the smallest crew", () => {
    const r = size({ groups: [g(3, 11), g(4, 1), g(3, 21)], hostLanes: 2 });
    assert.deepEqual(r.crews.map((c) => c.length), [7, 3]);
    assert.deepEqual(r.crews[0], [...g(4, 1), ...g(3, 21)]);
  });
  test("lanes never exceed host lanes", () => {
    const gs = [g(3, 1), g(3, 11), g(3, 21), g(3, 31)];
    for (let h = 2; h <= 9; h++) {
      const r = size({ groups: gs, hostLanes: h });
      assert.ok(r.copilots * r.lanesEach <= h, `h=${h}`);
      assert.ok(r.lanesEach >= 1);
    }
  });
});

describe("cli", () => {
  const t = tempDir();
  after(() => t.cleanup());
  const rows = [];
  for (const base of [0, 10, 20]) {
    rows.push([String(base + 1).padStart(2, "0"), "none", `f${base}.js`]);
    rows.push([String(base + 2).padStart(2, "0"), "none", `f${base}.js`]);
    rows.push([String(base + 3).padStart(2, "0"), "none", `f${base}.js`]);
  }
  writeFileSync(join(t.dir, "plan.md"), plan(rows));
  writeFileSync(join(t.dir, "ledger.md"), "task 01: integrated\n");

  test("prints the line", () => {
    const r = node(t.dir, "copilots.mjs", [t.dir, "2"]);
    assert.equal(r.status, 0);
    assert.match(r.out, /^copilots: 2 \(host lanes 2, 1 lanes each\) c1: .+ \| c2: .+$/);
  });
  test("ledger leaves done tasks", () => {
    const r = node(t.dir, "copilots.mjs", [t.dir, "3", "--ledger", join(t.dir, "ledger.md")]);
    assert.match(r.out, /copilots: 2 \(host lanes 3, 1 lanes each\)/);
    assert.ok(!/c\d: .*\b01\b/.test(r.out));
  });
  test("one group, no copilots", () => {
    const r = node(t.dir, "copilots.mjs", [t.dir, "1"]);
    assert.equal(r.out, "copilots: 0 (fewer than 2 independent groups of 3 or more tasks)");
  });
  test("--copilot never spawns", () => {
    const r = node(t.dir, "copilots.mjs", [t.dir, "4", "--copilot"]);
    assert.equal(r.status, 0);
    assert.equal(r.out, "copilots: 0 (a copilot never spawns copilots)");
  });
  test("missing plan", () => {
    const r = node(t.dir, "copilots.mjs", [join(t.dir, "nope"), "4"]);
    assert.equal(r.status, 0);
    assert.match(r.out, /^copilots: 0 \(no plan\.md at .*nope/);
  });
  test("json", () => {
    const r = node(t.dir, "copilots.mjs", [t.dir, "2", "--json"]);
    const j = JSON.parse(r.out);
    assert.deepEqual(Object.keys(j).sort(), ["copilots", "crews", "lanesEach"]);
    assert.equal(j.copilots, 2);
    assert.equal(j.crews.flat().length, 9);
  });
});
