import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { frontmatter } from "../tools/validate.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = readFileSync(join(repo, "agents", "reviewer.md"), "utf8").replace(/\r\n/g, "\n");
const section = (text.split(/^## ACCEPTANCE$/m)[1] || "").split(/^## /m)[0];

test("has an ACCEPTANCE mode after SECURITY", () => {
  assert.ok(section.length > 0);
  assert.ok(text.indexOf("## SECURITY") < text.indexOf("## ACCEPTANCE"));
});

test("names its inputs", () => {
  for (const w of ["request.md", "decisions.md", "BASE", "HEAD"]) assert.ok(section.includes(w), w);
});

test("verdict words", () => {
  for (const w of ["`MET`", "`PARTIAL`", "`NOT MET`"]) assert.ok(section.includes(w), w);
});

test("a verdict without evidence is NOT MET", () => {
  assert.match(section, /verdict without evidence (counts as|is) NOT MET/i);
});

test("report shape", () => {
  assert.ok(section.includes("| Item | Verdict | Evidence |"));
  assert.ok(section.includes("acceptance: <met>/<total> met, <partial> partial, <not met> not met"));
});

test("re-check names only the items to check again, and stays read-only", () => {
  assert.match(section, /RE-CHECK/);
  assert.match(section, /read-only/i);
});

test("frontmatter keeps Agent disallowed, names demands-met checks, stays short", () => {
  const fm = frontmatter(text);
  assert.match(fm.disallowedTools, /\bAgent\b/);
  assert.match(fm.disallowedTools, /NotebookEdit/);
  assert.match(fm.description, /demands-met/);
  assert.ok(fm.description.length < 1024);
});
