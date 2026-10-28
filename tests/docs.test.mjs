import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const readme = read("README.md");
const arch = read("ARCHITECTURE.md");
const changelog = read("CHANGELOG.md");
const plugin = JSON.parse(read(".claude-plugin/plugin.json"));

// The fifteen commands of D9: the commands/ files plus the skills that own their own name.
const SKILL_COMMANDS = ["blueprint", "recon", "verify"];
const roster = [
  ...readdirSync(join(root, "commands")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)),
  ...SKILL_COMMANDS,
].sort();

test("roster", () => {
  assert.deepEqual(roster, [
    "agent", "blueprint", "build", "copilot", "deploy", "improve", "intervention",
    "merge", "preview", "recon", "resume", "scout", "status", "test", "verify",
  ]);
  for (const s of SKILL_COMMANDS) assert.ok(readdirSync(join(root, "skills")).includes(s), `skills/${s}`);
});

test("readme lists every command", () => {
  const section = readme.split(/^## /m).find((s) => s.startsWith("Commands"));
  assert.ok(section, "a ## Commands section");
  for (const name of roster) {
    assert.match(section, new RegExp(`^\\|\\s*\`/autopilot:${name}\`\\s*\\|[^|]*\\S[^|]*\\|`, "m"), `/autopilot:${name} row`);
  }
});

test("name clash", () => {
  assert.match(readme, /^### Name clash/m);
  const note = readme.split(/^### Name clash/m)[1].split(/^#{1,3} /m)[0];
  assert.match(note, /AUTOPILOT_SKILL/);
  assert.match(note, /autopilot-auto\.skill/);
  assert.match(note, /scoped/);
});

test("feature sections", () => {
  const headings = [...readme.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1].toLowerCase());
  for (const word of ["voice", "pause", "copilot", "preview", "scout", "improve"]) {
    assert.ok(headings.some((h) => h.includes(word)), `a heading about ${word}`);
  }
  assert.match(readme, /\.autopilot\/runs\/<plan>\//);
  assert.match(readme, /\.autopilot\/runs\/LESSONS\.md/);
  assert.match(readme, /Mission <n> of <m> tasks completed\./);
});

test("state table", () => {
  const table = arch.split(/^## State on disk/m)[1];
  assert.ok(table, "a State on disk section");
  assert.match(table, /\.autopilot\/runs\/<plan>\//);
  assert.match(table, /\.autopilot\/runs\/<plan>-c<N>\//);
  assert.match(table, /\.autopilot\/runs\/LESSONS\.md/);
  assert.match(table, /PAUSE/);
  assert.doesNotMatch(table, /`\.autopilot\/<plan>\/`/);
  assert.doesNotMatch(table, /`\.autopilot\/LESSONS\.md`/);
  assert.match(arch.split(/^## Who does what/m)[1].split(/^## /m)[0], /copilot[\s\S]*cockpit[\s\S]*scout|cockpit[\s\S]*scout[\s\S]*copilot/i);
  assert.match(arch.split(/^```/m)[1], /copilot/i);
});

test("pause rule", () => {
  const rules = arch.split(/^## Rules that matter/m)[1].split(/^## /m)[0];
  assert.match(rules, /^8\. .*PAUSE.*\/autopilot:resume/ms);
});

test("routing rule", () => {
  const rules = arch.split(/^## Rules that matter/m)[1].split(/^## /m)[0];
  assert.match(rules, /^7\. .*thin.*scoped name.*CLAUDE_PLUGIN_ROOT/ms);
});

test("changelog version", () => {
  const top = changelog.match(/^## (\S+)/m)[1];
  assert.equal(top, "0.3.0");
  assert.equal(top, plugin.version);
});

test("migration note", () => {
  const entry = changelog.split(/^## 0\.2\.2/m)[0];
  assert.ok(entry.includes("A build started on 0.2.x keeps its ledger at the old path: finish it on 0.2.x."));
});
