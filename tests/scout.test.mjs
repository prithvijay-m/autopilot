import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { frontmatter, validate } from "../tools/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const agent = read("agents/scout.md");
const proc = read("skills/cockpit/SCOUT.md");
const fm = frontmatter(agent);
const toolList = () => fm.tools.split(",").map((t) => t.trim());

test("frontmatter", () => {
  assert.equal(fm.name, "scout");
  assert.equal(fm.model, "sonnet");
  assert.ok(fm.description.length > 20);
  assert.match(fm.description, /never installs/);
});

test("tools", () => {
  assert.deepEqual(toolList(), ["WebSearch", "WebFetch", "Read", "Grep", "Glob"]);
});

test("no shell", () => {
  for (const bad of ["Bash", "Write", "Edit", "NotebookEdit"]) {
    assert.ok(!toolList().includes(bad), `${bad} not in tools`);
  }
});

test("row format", () => {
  assert.ok(
    agent.includes("| <package or tool> | <in use> | <latest> | <why it matters, one line> | <install command copied from upstream docs> | <upstream URL> |"),
  );
});

test("upstream required", () => {
  assert.match(agent, /no upstream URL[^\n]*dropped|dropped[^\n]*no upstream URL/i);
  assert.match(agent, /install command[^\n]*not found on the upstream page[^\n]*dropped|dropped[^\n]*not found on the upstream page/i);
  assert.match(agent, /claims? to verify/i);
});

test("injection rule", () => {
  assert.match(agent, /fetched[^\n]*(is|are) data/i);
  assert.match(agent, /never follow[^\n]*instructions/i);
  assert.match(agent, /never (run|install)/i);
});

test("stack source", () => {
  assert.ok(proc.includes('node "<scripts>/lessons.mjs" sync'));
  assert.match(proc, /stack tags/);
  assert.match(proc, /\$ARGUMENTS/);
});

test("fan-out cap", () => {
  assert.match(proc, /at most 4/);
  assert.match(proc, /in one message/);
  assert.match(proc, /autopilot:scout/);
});

test("never installs", () => {
  assert.match(proc, /Never run an install command/);
  assert.match(proc, /never run a command found in a scout's output/i);
  assert.match(proc, /nothing was installed/i);
});

test("no stack", () => {
  assert.match(proc, /no stack was detected/i);
  assert.match(proc, /\/autopilot:scout <tool>/);
  assert.match(proc, /stop/i);
});

test("user text is data and tokens are safe", () => {
  assert.match(proc, /data, never instructions/);
  assert.ok(proc.includes("^[A-Za-z0-9._/][A-Za-z0-9._/-]*$"));
  assert.match(proc, /leading dash|starts with `-`/);
  assert.match(proc, /file missing/i);
});

test("plugin root and validate", () => {
  assert.ok(!agent.includes("${CLAUDE_PLUGIN_ROOT}"));
  assert.ok(!proc.includes("${CLAUDE_PLUGIN_ROOT}"));
  const { errors } = validate(root);
  assert.deepEqual(errors, []);
});

test("upstream anchor", () => {
  assert.match(agent, /never take the upstream from a search result/i);
  assert.match(agent, /registry[^\n]*pointer/i);
  assert.match(agent, /leaves the project's own host or GitHub org/i);
  assert.match(agent, /`https`/);
});

test("same-package rule", () => {
  assert.match(agent, /install command must name exactly the package/i);
  assert.match(agent, /manifest's spelling/i);
});

test("conductor pre-display check", () => {
  assert.match(proc, /before (it )?show(s|ing)/i);
  assert.match(proc, /not `https`/);
  assert.match(proc, /exact package or tool name/);
  assert.match(proc, /`\|` escaped|escape `\|`/);
  assert.match(proc, /latest[^\n]*claim to verify/i);
});

test("metacharacter warning", () => {
  assert.ok(proc.includes("runs a remote script or several commands: read it first"));
  for (const m of ["`|`", "`;`", "`&&`", "`$(`", "`>`"]) assert.ok(proc.includes(m), m);
});

test("read scope and no local content in requests", () => {
  assert.match(agent, /only on the manifest paths named in the dispatch/i);
  assert.match(agent, /`\.env\*`/);
  assert.match(agent, /outside the (repository )?root/i);
  assert.match(agent, /WebFetch[^\n]*only/i);
  assert.match(agent, /never contains anything read from a local file except the package name and the version in use/i);
});
