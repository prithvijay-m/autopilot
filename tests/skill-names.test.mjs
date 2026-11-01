import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const md = (dir) => readdirSync(join(root, dir), { recursive: true }).filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f.replace(/\\/g, "/")}`);
const files = [...md("agents"), ...md("skills"), ...md("commands")];
const readme = read("README.md");
const companion = readme.split(/^### Companion skills/m)[1].split(/^#{1,3} /m)[0];
const own = new Set(readdirSync(join(root, "skills")));
const RULE = "A skill name here is shorthand: call the Skill tool with the exact name from the session's skill listing - the bare name, or the same skill under any plugin prefix (for example `grilling`, `mattpocock-skills:grilling` or `supermatt:grilling`). If no listed skill matches, say so in one line and carry out the step yourself from first principles; do not stop.";

// the skill names a prompt tells an agent to load: the backticked name right after "Skill tool with"
const called = () => {
  const out = [];
  for (const f of files) for (const m of read(f).matchAll(/Skill tool with [^`\n]{0,60}`([^`\n]+)`/g)) if (/^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)?$/.test(m[1])) out.push([f, m[1]]);
  return out;
};

test("every skill the prompts call is one of the plugin's own or is listed under Companion skills", () => {
  const seen = called();
  assert.ok(seen.length >= 10, "found the skill calls");
  for (const [f, name] of seen) {
    if (name.startsWith("autopilot:") || own.has(name)) continue;
    const bare = name.replace(/^supermatt:/, "");
    assert.ok(companion.includes(`\`${name}\``) || companion.includes(`\`${bare}\``), `${f} calls ${name}, which the README's Companion skills do not list`);
  }
});

test("the README says how a skill name is resolved", () => {
  assert.match(companion, /shorthand/);
  assert.match(companion, /any plugin prefix/);
  assert.match(companion, /from first principles instead of stopping/);
});

test("the resolution rule is stated where skills are named, and no bare fallback special case is left", () => {
  for (const f of ["skills/blueprint/SKILL.md", "skills/blueprint/SKILL-ROUTING.md", "agents/conductor.md", "agents/reviewer.md", "agents/senior.md", "agents/senior-analyst.md", "agents/analyst.md", "agents/coder.md", "agents/ux.md", "agents/db.md"]) {
    assert.ok(read(f).includes(RULE), `${f} carries the rule`);
  }
  assert.match(read("agents/scout.md"), /you have no Skill tool/);
  assert.ok(!/\(`(pr|qa)` when (that is )?unavailable\)/.test(read("agents/conductor.md") + read("agents/reviewer.md")));
});
