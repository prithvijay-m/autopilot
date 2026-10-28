import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const iv = read("skills/cockpit/INTERVENTION.md");
const im = read("skills/cockpit/IMPROVE.md");
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
    assert.ok(doc.includes(TOKEN));
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
  assert.ok(im.includes('node "<scripts>/improve.mjs" check "<file>"'));
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
  assert.ok(im.includes('apply "<file>" --yes'));
  assert.match(im, /next message/);
  assert.match(im, /never consent/i);
  assert.match(im, /applied but not verified/);
  assert.match(im, /--root/);
  assert.match(im, /npm run check/);
});
