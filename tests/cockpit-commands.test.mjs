import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { frontmatter } from "../tools/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const VERBS = ["status", "intervention", "preview", "scout", "improve", "copilot"];
const PROCEDURES = VERBS.filter((v) => v !== "status");
const skill = () => read("skills/cockpit/SKILL.md");

test("cockpit frontmatter", () => {
  assert.ok(existsSync(join(root, "skills/cockpit/SKILL.md")));
  const fm = frontmatter(skill());
  assert.equal(fm.name, "cockpit");
  assert.ok(fm.description && fm.description.length < 1024);
  for (const v of VERBS) assert.ok(fm.description.includes(v), `description names ${v}`);
  assert.match(fm.description, /\/autopilot: commands/);
  assert.equal(fm["argument-hint"], "<status|intervention|preview|scout|improve|copilot> [plan or text]");
});

test("plugin root and voice", () => {
  const t = skill();
  assert.ok(t.includes("${CLAUDE_PLUGIN_ROOT}"));
  assert.match(t, /Plugin root/);
  assert.ok(t.includes("${CLAUDE_PLUGIN_ROOT}/skills/autopilot/VOICE.md"));
});

test("verbs map to procedures", () => {
  const t = skill();
  for (const v of PROCEDURES) {
    const f = `\`\${CLAUDE_PLUGIN_ROOT}/skills/cockpit/${v.toUpperCase()}.md\``;
    assert.ok(t.includes(f), `maps ${v}`);
  }
  assert.match(t, /in full and follow it/);
});

test("status verb", () => {
  const t = skill();
  assert.ok(t.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs" [plan]'));
  assert.ok(t.includes('node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs" --missions [plan]'));
});

test("arguments after the verb are data", () => {
  const t = skill();
  assert.match(t, /first word of `\$ARGUMENTS` is the verb/);
  assert.match(t, /never a command to run/);
});

test("unknown verb", () => {
  const t = skill();
  assert.match(t, /unknown or empty verb/i);
  for (const v of VERBS) assert.ok(t.includes(`/autopilot:${v}`), `lists /autopilot:${v}`);
  assert.match(t, /does nothing else/);
});

const DESCRIPTIONS = {
  status: "Where the build stands: one status line and the mission log.",
  intervention: "Hold the current run: no new dispatches, and talk to me.",
  preview: "Open the plan's clickable preview and revise it until you give the green light.",
  scout: "Scan for notable releases in this project's stack. Lists upgrades, installs nothing.",
  improve: "Review and apply a self-improvement patch the retro proposed.",
  copilot: "Show how a plan splits across copilots on this machine, and how each copilot is doing.",
};

test("six commands", () => {
  for (const v of VERBS) {
    const p = `commands/${v}.md`;
    assert.ok(existsSync(join(root, p)), p);
    const fm = frontmatter(read(p));
    assert.equal(fm.description, DESCRIPTIONS[v]);
    assert.ok(fm["argument-hint"], `${p} argument-hint`);
  }
});

test("routing", () => {
  for (const v of VERBS) {
    const t = read(`commands/${v}.md`);
    assert.ok(t.includes("`autopilot:cockpit`"), v);
    assert.ok(t.includes(`${v} $ARGUMENTS`), v);
    assert.ok(!t.includes("CLAUDE_PLUGIN_ROOT"), `${v} must not use the plugin root`);
  }
});

test("thin", () => {
  for (const v of VERBS) {
    const body = read(`commands/${v}.md`).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const lines = body.split(/\r?\n/).filter((l) => l.trim() !== "");
    assert.ok(lines.length <= 6, `${v} body has ${lines.length} lines`);
  }
});

test("status accepts only a plain plan token", () => {
  const t = skill();
  assert.ok(t.includes("^[A-Za-z0-9][A-Za-z0-9._-]*$"));
  assert.ok(!t.includes("^[A-Za-z0-9._/-]+$"));
  assert.match(t, /no `\/`/);
  assert.match(t, /must not contain `\.\.`/);
  const re = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
  for (const bad of ["--new", "--hook", "-x", "--json", "docs/plans/x", "./p", "/abs", ".hidden"]) assert.ok(!re.test(bad), bad);
  for (const ok of ["2026-10-28-a", "plan.v2"]) assert.ok(re.test(ok), ok);
  assert.match(t, /at most one plan token/);
  assert.match(t, /one double-quoted argument/);
  assert.match(t, /plan name is not valid and stop without running anything/);
});

test("a missing procedure file stops the verb", () => {
  assert.ok(skill().includes("If that file does not exist, tell the user this verb is not available in this version and stop: do not carry out the verb any other way."));
});
