import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(join(root, "skills", "autopilot", "SKILL.md"), "utf8");
const section = (n) => {
  const m = text.match(new RegExp(`^## ${n}\\. [^\\n]*\\n([\\s\\S]*?)(?=^## \\d\\.|(?![\\s\\S]))`, "m"));
  assert.ok(m, `section ${n} exists`);
  return m[1];
};

test("voice file named", () => {
  assert.match(text, /user-facing messages[^\n]*\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/autopilot\/VOICE\.md/i);
});

test("plain briefs", () => {
  assert.match(text, /Dispatch prompts to agents stay plain/);
});

test("runs path", () => {
  assert.ok(text.includes(".autopilot/runs/<plan directory name>/ledger.md"));
  assert.ok(!text.includes(".autopilot/<plan directory name>/ledger.md"));
});

test("build verb", () => {
  const s = section(1);
  assert.match(s, /`build \[plan\]`/);
  assert.match(s, /no approved plan[^\n]*\/autopilot:blueprint/);
});

test("resume clears pause", () => {
  const s = section(1);
  const i = s.indexOf('pause.mjs" clear <plan directory name>');
  assert.ok(i > 0, "clear line present");
  assert.match(s, /`resume \[plan\]`/);
  assert.ok(s.indexOf("`build [plan]`") < s.indexOf("| What you find"), "verbs come first");
  assert.match(s.slice(i), /then Build/);
});

test("mission relay", () => {
  const s = section(3);
  assert.ok(s.includes('status.mjs" --missions --new <plan directory name>'));
  assert.match(s, /`CHECKPOINT:` and `OUTCOME:`/);
  assert.match(s, /verbatim/);
});

test("paused", () => {
  const s = section(3);
  assert.match(s, /`PAUSED:`[^\n]*the way `STOP:` does/);
  assert.match(s, /Resume with \/autopilot:resume\./);
});

test("not done", () => {
  const s = section(4);
  assert.match(s, /\*\*Not done\*\*/);
  assert.match(s, /own heading/);
  assert.match(s, /PAUSED[^\n]*reason/);
});

test("no old names", () => {
  assert.ok(!new RegExp([["autopilot", "forge"].join("-"), ["claude", "code", "forge"].join("-")].join("|")).test(text));
});
