import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFileSync(join(repo, "agents", name), "utf8").replace(/\r\n/g, "\n");
const conductor = read("conductor.md");
const section = (conductor.split(/^A \*\*Ponytail level\*\*/m)[1] || "").split(/\n\n/)[0];

test("conductor sets a Ponytail level on every builder dispatch", () => {
  assert.ok(section.length > 0, "no Ponytail level paragraph");
  for (const w of ["coder", "ux", "db", "senior", "Ponytail: <lite|full|off>"]) assert.ok(section.includes(w), w);
});

test("conductor picks the level from the brief, with a default", () => {
  assert.match(section, /`lite`/);
  assert.match(section, /`full`/);
  assert.match(section, /`off`/);
  assert.match(section, /Security: yes/);
  assert.match(section, /unsure/);
});

test("conductor never picks ultra, because nobody can answer its pushback", () => {
  assert.match(section, /Never `ultra`/);
  assert.match(section, /nobody/i);
});

test("the dispatch line is the only per-task switch", () => {
  assert.match(section, /machine-wide/);
});

for (const name of ["coder.md", "ux.md", "db.md"]) {
  test(`${name} obeys the brief's Ponytail line over the loaded level`, () => {
    const t = read(name);
    assert.match(t, /`Ponytail:` line/);
    assert.match(t, /wins over the level/);
    assert.match(t, /name the smaller option under CONCERNS/);
    assert.match(t, /validation at trust boundaries/);
  });
}
