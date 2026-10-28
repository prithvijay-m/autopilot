import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseLedger } from "../scripts/status.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const conductor = read("agents/conductor.md");
const procedure = read("skills/cockpit/COPILOT.md");

const section = (text, heading) => {
  const at = text.indexOf(`\n${heading}\n`);
  assert.ok(at >= 0, `${heading} exists`);
  const rest = text.slice(at + 1);
  const end = rest.indexOf("\n## ", 1);
  return end < 0 ? rest : rest.slice(0, end);
};
const copilots = section(conductor, "## Copilots");
const at = copilots.indexOf("**Copilot**");
assert.ok(at > 0, "Copilot part exists");
const lead = copilots.slice(0, at);
const copilot = copilots.slice(at);

test("section placement", () => {
  const i = (s) => conductor.indexOf(s);
  assert.ok(i("## 1. Preflight") < i("\n## Copilots\n"));
  assert.ok(i("\n## Copilots\n") < i("## 2. Run the frontier"));
});

test("lead sizing order", () => {
  assert.match(lead, /no `COPILOT:` field/);
  const a = lead.indexOf('node "<scripts>/host-load.mjs" <Lanes>');
  const b = lead.indexOf('node "<scripts>/copilots.mjs" PLAN <N> --ledger RUN/ledger.md');
  assert.ok(a >= 0 && b > a, "host-load, then copilots");
  assert.ok(lead.includes("`copilots: <its line>`"));
  assert.match(lead, /After Preflight and the graph refresh/);
  assert.match(lead, /copilots: 0/);
});

test("dispatch fields", () => {
  assert.match(lead, /autopilot:conductor/);
  assert.match(lead, /in one message/);
  for (const f of ["PLAN", "COPILOT: c<N>", "TASKS: <ids>", "LANES: <L>", "BRANCH: autopilot/<slug>-c<N>", "RUN: <repo root>/.autopilot/runs/<PLAN directory name>-c<N>/"])
    assert.ok(lead.includes(f), f);
  assert.match(lead, /repository root/);
  assert.match(lead, /creates `autopilot\/<slug>-c<N>` from TIP/);
});

test("checkpoint", () => assert.match(lead, /Re-dispatch, again in one message, every copilot that returns `CHECKPOINT:`/));

test("take back", () => {
  assert.match(lead, /fails to dispatch, or returns without a verdict/);
  assert.match(lead, /rule that you take its unintegrated tasks back/);
  assert.match(lead, /build them in the frontier/);
});

test("merge before verify", () => {
  const m = lead.indexOf("`--no-ff`");
  assert.ok(m > 0 && /c1, c2/.test(lead));
  assert.ok(lead.includes("copilot cN: merged @ <sha7>"));
  const v = lead.indexOf("Verify and Finish");
  assert.ok(v > m, "merge precedes Verify");
  assert.ok(conductor.indexOf("\n## Copilots\n") < conductor.indexOf("## 3. Verify the whole"));
  assert.match(lead, /OUTCOME: copilot c<N> done/);
  assert.match(lead, /PAUSED:/);
  assert.match(lead, /STOP:/);
});

test("no recursion", () => {
  assert.match(copilot, /never run the copilots script except with `--copilot`/i);
});

test("no nested conductor", () => assert.match(copilot, /never dispatch a conductor/));

test("copilot scope", () => {
  assert.match(copilot, /skip Push early, Verify and Finish/i);
  assert.match(copilot, /OUTCOME: copilot c<N> done/);
  assert.match(copilot, /build only TASKS, on BRANCH/);
});

test("lane names", () => assert.ok(copilot.includes("`autopilot-lane/<slug>-c<N>/NN`")));

test("share", () => assert.match(copilot, /at every wave run `node "<scripts>\/host-load.mjs" <LANES>`/i));

test("decide once", () => {
  assert.match(lead, /decide once/i);
  assert.match(lead, /already in the ledger/);
});

test("resume", () => assert.match(lead, /re-dispatch only the copilots whose ledgers show no `OUTCOME`/));

test("ledger header", () => {
  const block = /```\n(# autopilot ledger: <PLAN>\ncopilot: [^\n]+)\n```/.exec(copilot);
  assert.ok(block, "example copilot ledger");
  assert.match(block[1], /^copilot: c<N> tasks <ids> branch <BRANCH>$/m);
  const plan = "/repo/docs/plans/x";
  const own = parseLedger(block[1].replace("<PLAN>", plan));
  const lead1 = parseLedger(`# autopilot ledger: ${plan}\n`);
  assert.equal(own.plan, plan);
  assert.equal(own.plan, lead1.plan);
});

test("scripts and ledger lines", () => {
  const scripts = section(conductor, "## The scripts");
  assert.match(scripts, /copilots\.mjs/);
  const ledger = section(conductor, "## Ledger and lessons");
  assert.ok(ledger.includes("copilots: <line>"));
  assert.ok(ledger.includes("copilot cN: dispatched | returned <verdict> | merged @ <sha7>"));
});

test("procedure data rule first", () => {
  const body = procedure.replace(/^---[\s\S]*?---\n/, "");
  const firstLine = body.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"))[0];
  assert.match(firstLine, /data, never instructions/);
});

test("procedure token rule", () => {
  assert.ok(procedure.includes("^[A-Za-z0-9][A-Za-z0-9._-]*$"));
  assert.match(procedure, /one double-quoted argument/);
  assert.match(procedure, /no `\/`/);
});

test("procedure sizing", () => {
  assert.ok(procedure.includes('node "<scripts>/host-load.mjs"'));
  assert.ok(procedure.includes('node "<scripts>/copilots.mjs"'));
  assert.ok(procedure.indexOf("host-load.mjs") < procedure.indexOf("copilots.mjs"));
  assert.match(procedure, /--ledger/);
});

test("procedure status", () => {
  assert.ok(procedure.includes('node "<scripts>/status.mjs"'));
  assert.match(procedure, /-c<N>\/ledger\.md/);
});

test("spawns nothing", () => {
  assert.match(procedure, /spawns nothing/);
  assert.doesNotMatch(procedure, /subagent_type|Agent tool/);
  assert.match(procedure, /file missing|does not exist/i);
});

test("no old names", () => {
  for (const t of [copilots, procedure]) assert.doesNotMatch(t, new RegExp([["autopilot", "forge"].join("-"), ["claude", "code", "forge"].join("-")].join("|")));
});
