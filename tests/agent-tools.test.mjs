import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { frontmatter } from "../tools/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fm = (name) => frontmatter(readFileSync(join(root, "agents", `${name}.md`), "utf8"));
const list = (s) => (s ?? "").split(",").map((t) => t.trim()).filter(Boolean);

test("the conductor has an allowlist that drops what its prompt never uses", () => {
  const tools = list(fm("conductor").tools);
  for (const t of ["Agent", "Bash", "Read", "Write", "Edit", "Grep", "Glob", "Skill", "Monitor", "TaskStop", "ToolSearch"]) assert.ok(tools.includes(t), `${t} stays`);
  for (const t of ["WebFetch", "WebSearch", "NotebookEdit"]) assert.ok(!tools.includes(t), `${t} is not allowed`);
});

test("the planner writes plan files and runs graphify, and never dispatches or browses", () => {
  const tools = list(fm("planner").tools);
  for (const t of ["Bash", "Read", "Write", "Edit", "Grep", "Glob"]) assert.ok(tools.includes(t), `${t} stays`);
  for (const t of ["Agent", "WebFetch", "WebSearch", "NotebookEdit"]) assert.ok(!tools.includes(t), `${t} is not allowed`);
});

test("the reviewer keeps Write for its temp-directory evidence but cannot Edit the repository", () => {
  const f = fm("reviewer");
  assert.equal(f.tools, undefined, "no allowlist: web QA reaches the browser's MCP tools");
  for (const t of ["Agent", "Edit", "NotebookEdit"]) assert.match(f.disallowedTools, new RegExp(`\\b${t}\\b`));
  assert.ok(!/\bWrite\b/.test(f.disallowedTools));
});

test("the analysts keep every tool but Agent, so the rea MCP tools stay reachable", () => {
  for (const n of ["analyst", "senior-analyst"]) {
    assert.equal(fm(n).tools, undefined, `${n} has no allowlist`);
    assert.match(fm(n).disallowedTools, /\bAgent\b/);
  }
});
