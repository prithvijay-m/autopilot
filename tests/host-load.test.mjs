import { test, after } from "node:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { lanes, explain, reserveFor, readCgroup } from "../scripts/host-load.mjs";
import { node, tempDir } from "./helpers.mjs";

const scratch = [];
after(() => scratch.forEach((t) => t.cleanup()));
/** A fake cgroup directory holding the given files. */
function cgroup(files) {
  const t = tempDir("forge-cg-");
  scratch.push(t);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(t.dir, name), text);
  return t.dir;
}
const GIB = 2 ** 30;

test("lanes shrink with load and memory, never below one or above the plan", () => {
  assert.equal(lanes({ max: 5, cores: 8, load: 0.5, freeGb: 32 }), 5, "idle: the plan's maximum");
  assert.equal(lanes({ max: 5, cores: 8, load: 5.5, freeGb: 32 }), 2, "busy cpu");
  assert.equal(lanes({ max: 5, cores: 8, load: 0, freeGb: 4 }), 2, "tight memory");
  assert.equal(lanes({ max: 5, cores: 4, load: 14, freeGb: 0.2 }), 1, "overloaded: still one");
  assert.equal(lanes({ max: 1, cores: 64, load: 0, freeGb: 512 }), 1, "plan says serial");
  assert.equal(lanes({ max: 5, cores: 4, load: 0, freeGb: 3, laneGb: 1 }), 3, "lane memory is tunable");
});

test("CLI prints one line and exits 0, whatever it is given", () => {
  for (const arg of [["5"], ["0"], ["x"], []]) {
    const r = node(process.cwd(), "host-load.mjs", arg);
    assert.equal(r.status, 0);
    assert.match(r.out, /^lanes: [1-9]\d* of [1-9]\d* \(cores [\d.]+, load [\d.]+, free [\d.]+ of [\d.]+ GB, reserve [\d.]+ GB, bound by (plan|cpu|memory)\)$/);
  }
});

test("cpu quota caps cores", () => {
  assert.equal(readCgroup(cgroup({ "cpu.max": "200000 100000\n" })).cpus, 2);
});

test("no quota, no cap", () => {
  assert.equal(readCgroup(cgroup({ "cpu.max": "max 100000\n" })).cpus, null);
});

test("memory limit caps free memory", () => {
  const dir = cgroup({ "memory.max": String(4 * GIB), "memory.current": String(1 * GIB) });
  assert.equal(readCgroup(dir).memFreeGb, 3);
});

test("no memory limit, no cap", () => {
  assert.equal(readCgroup(cgroup({ "memory.max": "max\n", "memory.current": "1000" })).memFreeGb, null);
});

test("no cgroup", () => {
  const dir = join(cgroup({}), "absent");
  assert.deepEqual(readCgroup(dir), { cpus: null, memFreeGb: null });
});

test("reserve is the larger of 1 GB and 10% of total", () => {
  assert.equal(reserveFor(8), 1);
  assert.equal(reserveFor(64), 6.4);
});

test("reserve comes off free memory before sizing, never below one lane", () => {
  assert.equal(lanes({ max: 5, cores: 8, load: 0, freeGb: 4, laneGb: 1, reserveGb: 1 }), 3);
  assert.equal(lanes({ max: 5, cores: 8, load: 0, freeGb: 0.5, reserveGb: 1 }), 1);
});

test("explain names the binding limit", () => {
  assert.deepEqual(explain({ max: 2, cores: 8, load: 0, freeGb: 32 }), { lanes: 2, bound: "plan" });
  assert.equal(explain({ max: 5, cores: 8, load: 5.5, freeGb: 32 }).bound, "cpu", "bound by cpu");
  assert.equal(explain({ max: 5, cores: 8, load: 0, freeGb: 4 }).bound, "memory", "bound by memory");
});

test("ties go to plan, then cpu, then memory", () => {
  assert.equal(explain({ max: 3, cores: 3, load: 0, freeGb: 4.5 }).bound, "plan");
  assert.equal(explain({ max: 5, cores: 3, load: 0, freeGb: 4.5 }).bound, "cpu");
});

test("json", () => {
  const r = node(process.cwd(), "host-load.mjs", ["5", "--json"]);
  assert.equal(r.status, 0);
  const o = JSON.parse(r.out);
  assert.equal(o.max, 5);
  assert.ok(o.lanes >= 1 && ["plan", "cpu", "memory"].includes(o.bound));
  for (const k of ["cores", "load", "freeGb", "totalGb", "reserveGb"]) assert.equal(typeof o[k], "number");
});
