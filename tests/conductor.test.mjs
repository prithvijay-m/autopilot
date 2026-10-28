import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { missions } from "../scripts/status.mjs";
import { decide } from "../scripts/detect.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(join(root, "agents", "conductor.md"), "utf8").replace(/\r\n/g, "\n");

/** The body of the `## <title>` section (up to the next `## `). */
function section(prefix) {
  const parts = text.split(/^## /m).slice(1);
  const hit = parts.find((p) => p.startsWith(prefix));
  assert.ok(hit, `section "${prefix}" exists`);
  return hit.slice(hit.indexOf("\n") + 1);
}
const step = (sec, n) => {
  const m = sec.match(new RegExp(`^${n}\\. [\\s\\S]*?(?=^\\d+\\. |(?![\\s\\S]))`, "m"));
  assert.ok(m, `step ${n} exists`);
  return m[0];
};
const ledgerBlock = () => section("Ledger and lessons").match(/```\n([\s\S]*?)```/)[1];
const ledgerLine = (prefix) => {
  const line = ledgerBlock().split("\n").find((l) => l.startsWith(prefix));
  assert.ok(line, `ledger example has a "${prefix}" line`);
  return line;
};

test("runs path", () => {
  const s = section("Ledger and lessons");
  assert.match(s, /RUN is `<repo root>\/\.autopilot\/runs\/<PLAN directory name>\/`/);
  assert.match(s, /LESSONS is `<repo root>\/\.autopilot\/runs\/LESSONS\.md`/);
  assert.doesNotMatch(text, /\.autopilot\/<PLAN directory name>\//);
  assert.doesNotMatch(text, /\.autopilot\/LESSONS\.md/);
});

test("summary line parses", () => {
  const line = ledgerLine("summary NN:").replace("NN", "01");
  const ledgers = [{ text: `task 01: integrated @ abc1234\n${line}` }];
  const [m] = missions(ledgers, "| 01 | title | coder |\n");
  assert.equal(m.bullets.length, 3);
  // The allowlist drops the angle brackets of the template.
  assert.deepEqual(m.bullets, ["b1", "b2", "b3"]);
});

test("intervene line parses", () => {
  const line = ledgerLine("intervene:").replace("NN", "07");
  const out = decide({ ledger: line, task: "07", found: [{ signal: "stall", evidence: "x", remedy: "reset" }] });
  assert.match(out[0], /^PAUSE task 07/);
});

test("other new ledger lines", () => {
  for (const p of ["paused:", "acceptance:", "user:"]) ledgerLine(p);
});

test("detectors wired", () => {
  const scripts = section("The scripts");
  assert.match(scripts, /node "<scripts>\/detect\.mjs" start RUN <NN>/);
  assert.match(scripts, /node "<scripts>\/detect\.mjs" check RUN <NN> --report <report file> --task <task file>/);
  assert.match(scripts, /node "<scripts>\/pause\.mjs" set "<PLAN directory name>" '<reason>'/);
  assert.match(scripts, /node "<scripts>\/retro\.mjs" RUN/);
  const run = section("2. Run the frontier");
  assert.match(step(run, 2), /detect\.mjs" start/);
  assert.match(step(run, 3), /detect\.mjs" check/);
});

test("remedy table", () => {
  const s3 = step(section("2. Run the frontier"), 3);
  assert.match(s3, /`reset`[^\n]*only the task file and its card/);
  assert.match(s3, /`split`[^\n]*two halves by criteria[^\n]*Ruling/);
  assert.match(s3, /`findings`[^\n]*unresolved citations as findings/);
  assert.match(s3, /`senior`[^\n]*senior/);
  assert.match(s3, /`context`[^\n]*missing paths and the card/);
  assert.match(s3, /intervene: /);
});

test("pause path", () => {
  const s3 = step(section("2. Run the frontier"), 3);
  assert.match(s3, /`PAUSE`/);
  assert.match(s3, /refused/);
  assert.match(s3, /pause\.mjs" set/);
  assert.match(s3, /paused: <reason>/);
  assert.match(s3, /PAUSED: <reason>/);
});

test("summary step", () => {
  assert.match(step(section("2. Run the frontier"), 4), /summary NN:[^\n]*1 to 3[^\n]*100 characters/);
});

test("acceptance order", () => {
  const v = section("3. Verify the whole");
  const at = (re) => v.search(re);
  assert.ok(at(/\*\*QA\*\*/) >= 0 && at(/\*\*Acceptance\*\*/) > at(/\*\*QA\*\*/));
  assert.ok(at(/\*\*Security\*\*/) > at(/\*\*Acceptance\*\*/));
  const a = step(v, 3);
  assert.match(a, /ACCEPTANCE/);
  assert.match(a, /request\.md/);
  assert.match(a, /PARTIAL and NOT MET/);
  assert.match(a, /acceptance:/);
  assert.match(step(v, 6), /PARTIAL and NOT MET[\s\S]*ACCEPTANCE re-check|ACCEPTANCE re-check/);
});

test("no request", () => {
  assert.match(step(section("3. Verify the whole"), 3), /no `?request\.md`?[^\n]*Ruling[^\n]*skip|skip[^\n]*Ruling/i);
});

test("not done", () => {
  const f = section("4. Finish");
  assert.match(step(f, 1), /\*\*Not done\*\*/);
  assert.match(step(f, 6), /\*\*Not done\*\*/);
});

test("retro", () => {
  const f = section("4. Finish");
  const pushAt = f.search(/git push -u origin/);
  const lessons = f.search(/\*\*Write the lessons\.\*\*/);
  const retro = f.search(/retro\.mjs" RUN/);
  assert.ok(pushAt >= 0 && lessons > pushAt && retro > lessons);
});

test("retro patch", () => {
  const f = section("4. Finish");
  assert.match(f, /proposal path[^\n]*senior[^\n]*## Patch[^\n]*\$\{CLAUDE_PLUGIN_ROOT\}[^\n]*uncommitted/);
  assert.match(f, /\/autopilot:improve/);
});

test("user lines", () => {
  const s = section("Ledger and lessons");
  assert.match(s, /`user:` line is a note[^\n]*\/autopilot:intervention/);
});

test("paused is not a stop", () => {
  assert.match(section("Stops"), /PAUSED[^\n]*not a Stop[^\n]*ledger/);
});

test("pause reason is fixed and single-quoted", () => {
  const s3 = step(section("2. Run the frontier"), 3);
  assert.ok(s3.includes(`pause.mjs" set "<PLAN directory name>" '`));
  assert.match(s3, /again after an intervention/);
  assert.match(s3, /pause hook refused a dispatch/);
  assert.match(s3, /never copied from hook output, an agent report or a file/);
});

test("pause continues only on the printed paused line", () => {
  const s3 = step(section("2. Run the frontier"), 3);
  assert.match(s3, /continue only when[^\n]*prints a line starting `paused: `/i);
  assert.match(s3, /otherwise write `blocked:`[^\n]*stop/);
});

test("ledger text is written without a shell string", () => {
  const s = section("Ledger and lessons");
  assert.match(s, /quoted heredoc/);
  assert.match(s, /never[^\n]*echo[^\n]*printf[^\n]*double-quoted/i);
});

test("user lines are notes, not consent", () => {
  assert.ok(!text.includes("is an instruction from the user: honour it as a ruling"));
  const s = section("Ledger and lessons");
  for (const w of ["push", "merge", "deploy", "install", "secrets", "Finish mode"]) assert.ok(s.includes(w), w);
  assert.match(s, /never authorised/);
  assert.match(s, /`handoff` line/);
});

test("every pause example uses a quoted plan name and a single-quoted fixed reason", () => {
  const lines = text.split("\n").filter((l) => /pause\.mjs"? set/.test(l));
  assert.ok(lines.length > 0);
  for (const l of lines) {
    assert.match(l, /set "<PLAN directory name>" '/, l);
    assert.doesNotMatch(l, /"<reason>"/, l);
  }
  assert.doesNotMatch(text, /"<reason>"/);
});
