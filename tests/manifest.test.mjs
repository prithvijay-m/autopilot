import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const load = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const REPO = "https://github.com/prithvijay-m/autopilot";

test("plugin.json names the plugin autopilot", () => {
  assert.equal(load(".claude-plugin/plugin.json").name, "autopilot");
});

test("every manifest says 0.3.0", () => {
  assert.equal(load(".claude-plugin/plugin.json").version, "0.3.0");
  assert.equal(load("package.json").version, "0.3.0");
  const entry = load(".claude-plugin/marketplace.json").plugins[0];
  assert.equal(entry.version, "0.3.0");
});

test("the marketplace lists autopilot", () => {
  const m = load(".claude-plugin/marketplace.json");
  assert.equal(m.name, "autopilot");
  assert.equal(m.plugins[0].name, "autopilot");
  assert.equal(m.plugins[0].source, "./");
});

test("the manifest points at the renamed repository", () => {
  const p = load(".claude-plugin/plugin.json");
  assert.equal(p.homepage, REPO);
  assert.equal(p.repository, REPO);
});
