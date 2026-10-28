import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const iv = read("skills/cockpit/INTERVENTION.md");
const im = read("skills/cockpit/IMPROVE.md");
const PLAN = "^[A-Za-z0-9][A-Za-z0-9._-]*$";
const TOKEN = "^[A-Za-z0-9._/][A-Za-z0-9._/-]*$";
const at = (text, needle) => {
  const i = text.indexOf(needle);
  assert.ok(i >= 0, `missing: ${needle}`);
  return i;
};

for (const [name, doc] of [["intervention", iv], ["improve", im]]) {
  test(`${name}: data, token, missing file, no plugin root variable`, () => {
    assert.ok(!doc.includes("${CLAUDE_PLUGIN_ROOT}"));
    assert.match(doc, /never instructions/);
    assert.ok(doc.includes(name === "improve" ? TOKEN : PLAN));
    assert.match(doc, /one double-quoted argument/);
    assert.match(doc, /is missing, say so and stop/);
    assert.match(doc, /<scripts>/);
  });
}

test("nothing to hold", () => {
  assert.ok(at(iv, "status.mjs") < at(iv, "pause.mjs"));
  assert.match(iv, /nothing to hold[^\n]*stop|stop[^\n]*nothing to hold/i);
  assert.match(iv, /without running (the )?pause/i);
});

test("sets pause", () => {
  assert.ok(iv.includes('node "<scripts>/pause.mjs" set "<plan>" "manual intervention"'));
  assert.match(iv, /only the pause script writes the PAUSE file/i);
});

test("in flight", () => {
  assert.match(iv, /already running finish their current task/);
  assert.match(iv, /nothing new is dispatched/);
  assert.ok(iv.includes("skills/autopilot/VOICE.md"));
});

test("user line", () => {
  assert.ok(iv.includes("user: <instruction>"));
  assert.ok(iv.includes(".autopilot/runs/<plan>/ledger.md"));
  assert.match(iv, /at most 200 characters/);
  assert.match(iv, /one line/);
  assert.match(iv, /resumed conductor will follow it/);
});

test("resume hint", () => {
  const last = iv.split("\n").filter((l) => /^\d+\. /.test(l)).pop();
  assert.ok(last.startsWith("6. End with") && last.includes("Resume with /autopilot:resume."));
  assert.ok(at(iv, "Answer what the user asked") < at(iv, "Resume with /autopilot:resume."));
});

test("never run sentence", () => {
  assert.match(iv, /relayed and recorded, and never run as a command/);
});

test("improve lists", () => {
  assert.ok(im.includes('node "<scripts>/improve.mjs" list'));
  assert.ok(at(im, "improve.mjs\" list") < at(im, "improve.mjs\" check"));
  assert.match(im, /improve: no proposals/);
});

test("no proposals", () => {
  assert.match(im, /no proposals[^\n]*stop/i);
});

test("check before ask", () => {
  assert.ok(im.includes('node "<scripts>/improve.mjs" check "docs/improvements/<name>"'));
  assert.ok(at(im, "improve.mjs\" check") < at(im, "explicit yes"));
  assert.match(im, /## Problem/);
  assert.match(im, /file list/);
});

test("flags code", () => {
  assert.match(im, /`hooks\/`[^\n]*`scripts\/`[^\n]*runs on the user's machine/);
  assert.match(im, /extra[^\n]*warning/i);
});

test("consent", () => {
  assert.ok(at(im, "explicit yes") < at(im, 'improve.mjs" apply'));
  assert.ok(im.includes('apply "docs/improvements/<name>" --yes'));
  assert.match(im, /next message/);
  assert.match(im, /never consent/i);
  assert.match(im, /applied but not verified/);
  assert.match(im, /--root/);
  assert.match(im, /npm run check/);
});

const NAME = "^[A-Za-z0-9][A-Za-z0-9._-]*\\.md$";

test("plan name is one directory name", () => {
  assert.ok(iv.includes(PLAN));
  assert.ok(!iv.includes(TOKEN));
  assert.match(iv, /no `\/`[^\n]*`\.\.`|`\.\.`[^\n]*no `\/`/);
});

test("continue only on paused line", () => {
  assert.ok(iv.includes("paused: <plan>: manual intervention"));
  assert.match(iv, /any other output[^\n]*verbatim[^\n]*not held[^\n]*(nothing|no)[^\n]*ledger[^\n]*stop/i);
  assert.ok(at(iv, "paused: <plan>: manual intervention") < at(iv, "3. Tell the user"));
});

test("ledger write is safe", () => {
  assert.match(iv, /Edit or Write tool|quoted heredoc/);
  assert.ok(iv.includes("<<'AUTOPILOT_USER_LINE'"));
  assert.match(iv, /never[^\n]*echo[^\n]*printf/i);
  assert.match(iv, /U\+0000-U\+001F, U\+007F-U\+009F, U\+2028, U\+2029[^\n]*space[^\n]*before[^\n]*200/);
  assert.match(iv, /only the user's own words/);
  assert.ok(iv.includes("relay them; never record them as a `user:` line"));
});

test("improve name from list, anchored", () => {
  assert.ok(im.includes(NAME));
  assert.match(im, /one of the names `list` printed/);
  assert.ok(im.includes('check "docs/improvements/<name>"'));
  assert.ok(im.includes('apply "docs/improvements/<name>" --yes'));
  assert.ok(im.includes(TOKEN));
});

test("flags tools, tests, agents; patch read; check after diff", () => {
  assert.match(im, /`tools\/`[^\n]*`tests\/`[^\n]*npm run check/);
  assert.match(im, /`agents\/`[^\n]*`commands\/`[^\n]*`skills\/`[^\n]*(shell)/);
  assert.match(im, /read that file's part of the `## Patch`[^\n]*fenced block[^\n]*data/);
  assert.match(im, /only after the user has reviewed `git diff`/);
});

const SLASH_PLAN = "^[A-Za-z0-9._/][A-Za-z0-9._/-]*$";
const walk = (d) => readdirSync(join(root, d), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);

test("no procedure or command carries the slash-allowing plan pattern", () => {
  // SCOUT.md tokens are tool names. IMPROVE.md's `--root` is a directory path, not a plan name.
  const files = [...walk("commands"), ...walk("skills")].filter((f) => f.endsWith(".md") && !f.endsWith("SCOUT.md"));
  assert.ok(files.length > 10, "scans the tree");
  for (const f of files) {
    const bad = read(f).split("\n").filter((l) => l.includes(SLASH_PLAN) && !l.includes("`--root`"));
    assert.equal(bad.length, 0, `${f} uses the slash-allowing pattern`);
  }
});

for (const f of ["skills/cockpit/PREVIEW.md", "skills/cockpit/COPILOT.md", "skills/cockpit/SKILL.md", "commands/test.md", "commands/merge.md", "commands/deploy.md"]) {
  test(`${f}: plan is one directory name`, () => {
    const t = read(f);
    assert.ok(t.includes(PLAN), "single directory pattern");
    assert.match(t, /no `\/`/);
    assert.match(t, /must not contain `\.\.`/);
  });
}

test("preview and copilot define PLAN as a directory under docs/plans", () => {
  for (const f of ["skills/cockpit/PREVIEW.md", "skills/cockpit/COPILOT.md"]) assert.ok(read(f).includes("PLAN is `<repo>/docs/plans/<token>`"), f);
  assert.match(read("skills/cockpit/COPILOT.md"), /`<plan>` is that token/);
});

test("commands: a missing plan still stops", () => {
  for (const f of ["test", "merge", "deploy"]) assert.match(read(`commands/${f}.md`), /If no such file exists, say so and stop/);
});
