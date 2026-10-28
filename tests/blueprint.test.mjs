import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");
const bp = () => read("skills/blueprint/SKILL.md");
const planner = () => read("agents/planner.md");
const preview = () => read("skills/cockpit/PREVIEW.md");
const format = () => read("skills/blueprint/PLAN-FORMAT.md");
const section = (t, from, to) => {
  const a = t.indexOf(from);
  const b = to ? t.indexOf(to, a + 1) : t.length;
  return a < 0 ? "" : t.slice(a, b < 0 ? t.length : b);
};

test("request first", () => {
  const t = bp();
  const step1 = section(t, "## 1. Ground", "## 2. Grill");
  assert.match(step1, /- \*\*Request\*\*[^\n]*`\$ARGUMENTS`[^\n]*`PLAN\/request\.md`[^\n]*# Original request \(verbatim\)/);
  assert.ok(step1.indexOf("request.md") < step1.indexOf("- **Repository**"), "request.md is the first bullet");
  assert.ok(t.indexOf("request.md") < t.indexOf("## 2. Grill"));
  assert.match(step1, /before anything else/i);
});

test("keep existing request", () => {
  assert.match(bp(), /An existing `request\.md` is kept, and nothing edits it later/);
});

test("lessons path", () => {
  assert.ok(bp().includes(".autopilot/runs/LESSONS.md"));
  assert.ok(!bp().includes("writes `.autopilot/LESSONS.md`"));
});

test("step order", () => {
  const t = bp();
  const audit = t.indexOf("## 4. Audit");
  const step5 = t.indexOf("## 5. Preview, approve and hand off");
  const link = t.indexOf("[PREVIEW.md](../cockpit/PREVIEW.md)");
  const ask = t.indexOf("ask whether to approve");
  assert.ok(audit > 0 && step5 > audit && link > step5 && ask > link);
  assert.match(section(t, "## 3. Draft", "## 4."), /PLAN\/preview\/index\.html/);
});

test("numbering", () => {
  const heads = [...bp().matchAll(/^## (\d+)\. /gm)].map((m) => m[1]);
  assert.deepEqual(heads, ["1", "2", "3", "4", "5"]);
});

test("green light gate", () => {
  const s = section(bp(), "## 5. Preview", null);
  assert.match(s, /never starts before the user's green light on the preview/);
  assert.match(s, /carry it out/);
});

test("planner preview rules", () => {
  const s = section(planner(), "5. **Cut the tasks**", "6. **Check");
  assert.match(s, /PLAN\/preview\/index\.html/);
  assert.match(s, /one self-contained file/);
  assert.match(s, /no external scripts, styles, fonts or requests/);
  assert.match(s, /inline CSS and JS/);
  assert.match(s, /phone width/);
  assert.match(s, /light and dark/);
  assert.match(s, /under about 60 kB/);
  assert.match(s, /mocked data/);
  assert.match(s, /spec\.md[^\n]*preview/);
});

test("preview changes", () => {
  assert.match(planner(), /\*\*PREVIEW CHANGES\*\*[^\n]*revises the plan and the preview together/);
});

test("preview procedure shape", () => {
  const t = preview();
  assert.ok(t.length > 0, "PREVIEW.md exists");
  assert.ok(t.includes("<scripts>") && !t.includes("${CLAUDE_PLUGIN_ROOT}"));
  assert.ok(t.includes("^[A-Za-z0-9][A-Za-z0-9._-]*$"));
  assert.match(t, /newest plan[^\n]*preview\/index\.html/);
  assert.match(t, /file missing/);
});

test("artifact", () => {
  assert.match(preview(), /Artifact tool is available[^\n]*private Artifact[^\n]*link/);
});

test("fallback", () => {
  assert.match(preview(), /Otherwise[^\n]*absolute path[^\n]*open/);
});

test("loop", () => {
  const t = preview();
  assert.match(t, /PREVIEW CHANGES/);
  assert.match(t, /republish, and go back to 3/);
  assert.match(t, /Preview approved <YYYY-MM-DD>[^\n]*Status line/);
  assert.match(t, /main session, never in an agent/);
});

test("deploy row", () => {
  const t = format();
  assert.ok(t.includes("| Deploy | <the repository's documented deploy command, or none> |"));
  assert.match(t, /request\.md/);
  assert.match(t, /preview\/index\.html/);
});
