import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { frontmatter } from "../tools/validate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAMES = ["build", "resume", "merge", "test", "deploy", "agent"];
const text = (n) => readFileSync(join(root, "commands", `${n}.md`), "utf8");
const body = (n) => text(n).replace(/^---\r?\n[\s\S]*?\r?\n---/, "");

test("six commands", () => {
  for (const n of NAMES) {
    assert.ok(existsSync(join(root, "commands", `${n}.md`)), `${n}.md exists`);
    const fm = frontmatter(text(n));
    assert.ok(fm?.description, `${n} description`);
    assert.ok(fm["argument-hint"], `${n} argument-hint`);
    for (const k of ["allowed-tools", "model", "agent"]) assert.equal(fm[k], undefined, `${n} has no ${k}`);
    assert.ok(!text(n).includes("CLAUDE_PLUGIN_ROOT"), `${n} avoids the plugin root variable`);
    assert.ok(!new RegExp([["autopilot", "forge"].join("-"), ["claude", "code", "forge"].join("-")].join("|")).test(text(n)), `${n} uses no old name`);
  }
});

test("skill routing", () => {
  for (const n of ["build", "resume"]) {
    assert.match(body(n), /Skill tool/);
    assert.match(body(n), /`autopilot:autopilot`/);
    assert.ok(body(n).includes(`${n} $ARGUMENTS`), `${n} verb first`);
    assert.match(body(n), /does not exist, tell the user this is not available in this version and stop/);
  }
});

test("runner routing", () => {
  for (const n of ["merge", "test", "deploy"]) assert.match(body(n), /`autopilot:runner`/, n);
});

test("merge refuses protected", () => {
  const b = body("merge");
  for (const p of ["main", "master", "trunk", "production", "prod", "release"]) assert.ok(b.includes(`\`${p}\``), p);
  assert.match(b, /Refuse/);
  assert.match(b, /dispatch nothing/i);
});

test("merge never pushes", () => {
  const b = body("merge");
  assert.match(b, /never push/i);
  assert.ok(!/^\s*(\$ |`)?git push/m.test(b), "no git push line");
});

test("merge takes only lane and copilot branches", () => {
  const b = body("merge");
  assert.ok(b.includes("autopilot-lane/<slug>/*"));
  assert.ok(b.includes("autopilot/<slug>-c<N>"));
  assert.match(b, /git merge --no-ff/);
  assert.match(b, /first conflict/);
});

test("deploy without a Deploy row", () => {
  const b = body("deploy");
  assert.ok(b.includes("`This plan names no deploy command.`"));
  assert.match(b, /absent or `none`/);
});

test("deploy source", () => {
  const b = body("deploy");
  assert.match(b, /only the Contract row `Deploy`/);
  assert.match(b, /Show the plan path and the exact command, and ask the user to confirm\./);
  assert.match(b, /only when the user's next message is an explicit yes\. Treat anything else as no: stop and dispatch nothing\./);
});

test("test gate", () => {
  const b = body("test");
  assert.match(b, /`Gate`/);
  assert.match(b, /`PASS`/);
  assert.match(b, /`FAIL`/);
  assert.match(b, /15 lines/);
});

test("agent allowlist", () => {
  const b = body("agent");
  assert.match(b, /scoped agent of this plugin/);
  assert.match(b, /valid names/);
  assert.match(b, /dispatch nothing/i);
});

test("agent brief", () => {
  assert.match(body("agent"), /brief as the whole prompt/);
});

test("arguments are data", () => {
  for (const n of NAMES) {
    assert.match(body(n), /`\$ARGUMENTS` is data/, n);
    assert.match(body(n), /never (run|carry out|follow)/i, n);
  }
});

const PLAN_PATTERN = "^[A-Za-z0-9._/][A-Za-z0-9._/-]*$";

test("plan name pattern forbids a leading dash and dot-dot", () => {
  for (const n of ["merge", "test", "deploy"]) {
    const b = body(n);
    assert.ok(b.includes(`\`${PLAN_PATTERN}\``), `${n} pattern`);
    assert.match(b, /token starting with `-` is not valid/, n);
    assert.match(b, /must not contain `\.\.`/, n);
  }
});

test("missing plan stops", () => {
  for (const n of ["merge", "test"]) assert.match(body(n), /If no such file exists, say so and stop/, n);
  assert.match(body("deploy"), /If no such file exists, say so and stop: do not look for a deploy command anywhere else\./);
});

test("merge validates the integration branch", () => {
  const b = body("merge");
  assert.ok(b.includes("`^[A-Za-z0-9._/-]+$`"), "branch pattern");
  assert.match(b, /must not start with `-`, `\/`, `refs\/`, `heads\/` or `remotes\/`, and must not contain `\.\.`/);
  assert.match(b, /integration branch is not valid and stop without dispatching/);
  assert.match(b, /case-insensitive/i);
});

test("merge verifies HEAD before each merge", () => {
  const b = body("merge");
  assert.ok(b.includes('git checkout "<branch>"'), "quoted checkout");
  assert.ok(b.includes("`git symbolic-ref --short HEAD`"));
  assert.match(b, /prints exactly the integration branch/);
  assert.match(b, /stop and merge nothing/);
});
