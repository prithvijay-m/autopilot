import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { node, tempDir } from "./helpers.mjs";

test("rea-mcp toggles the server in ~/.claude.json, keeps a backup, and touches nothing else", () => {
  const home = tempDir();
  const env = { HOME: home.dir, USERPROFILE: home.dir };
  const cfg = join(home.dir, ".claude.json");
  try {
    writeFileSync(cfg, JSON.stringify({ theme: "dark", mcpServers: { other: { command: "x" } } }));
    assert.match(node(home.dir, "rea-mcp.mjs", ["status"], env).out, /off/);
    assert.match(node(home.dir, "rea-mcp.mjs", ["enable"], env).out, /ENABLED/);
    const on = JSON.parse(readFileSync(cfg, "utf8"));
    assert.equal(on.theme, "dark");
    assert.ok(on.mcpServers.other);
    assert.ok(on.mcpServers.rea.args.some((a) => /^rea-agents@\d+\.\d+\.\d+$/.test(a)), "pinned to an exact version");
    assert.ok(existsSync(`${cfg}.rea-toggle.backup`));
    assert.match(node(home.dir, "rea-mcp.mjs", ["enable"], env).out, /already on/);
    assert.match(node(home.dir, "rea-mcp.mjs", ["disable"], env).out, /disabled/);
    assert.equal(JSON.parse(readFileSync(cfg, "utf8")).mcpServers.rea, undefined);
    assert.equal(node(home.dir, "rea-mcp.mjs", ["bogus"], env).status, 1);
  } finally {
    home.cleanup();
  }
});

test("rea-mcp leaves an unreadable config alone", () => {
  const home = tempDir();
  const env = { HOME: home.dir, USERPROFILE: home.dir };
  try {
    writeFileSync(join(home.dir, ".claude.json"), "{ not json");
    const r = node(home.dir, "rea-mcp.mjs", ["enable"], env);
    assert.equal(r.status, 0);
    assert.match(r.out, /cannot read/);
    assert.equal(readFileSync(join(home.dir, ".claude.json"), "utf8"), "{ not json");
  } finally {
    home.cleanup();
  }
});

test("rea-mcp keeps the config's permissions and writes through a symlink", { skip: process.platform === "win32" }, async () => {
  const { chmodSync, lstatSync, statSync, symlinkSync, mkdirSync } = await import("node:fs");
  const home = tempDir();
  const env = { HOME: home.dir, USERPROFILE: home.dir };
  try {
    mkdirSync(join(home.dir, "dotfiles"));
    const real = join(home.dir, "dotfiles", "claude.json");
    writeFileSync(real, JSON.stringify({ mcpServers: {} }));
    chmodSync(real, 0o600);
    symlinkSync(real, join(home.dir, ".claude.json"));
    assert.match(node(home.dir, "rea-mcp.mjs", ["enable"], env).out, /ENABLED/);
    assert.ok(lstatSync(join(home.dir, ".claude.json")).isSymbolicLink(), "still a symlink");
    assert.equal(statSync(real).mode & 0o777, 0o600);
    assert.ok(JSON.parse(readFileSync(real, "utf8")).mcpServers.rea, "the target was updated");
  } finally {
    home.cleanup();
  }
});

test("every rea-agents@ in the repository uses the one pinned REA_VERSION, and none is unpinned", async () => {
  const { readdirSync } = await import("node:fs");
  const { dirname, relative } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { REA_VERSION } = await import("../scripts/rea-mcp.mjs");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const skip = new Set([".git", "node_modules", "graphify-out", ".autopilot", ".impeccable", "tests"]);
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (skip.has(e.name) ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  assert.match(REA_VERSION, /^\d+\.\d+\.\d+$/);
  let seen = 0;
  for (const f of walk(root)) {
    const rel = relative(root, f).replace(/\\/g, "/");
    if (!/\.(md|mjs|json|ya?ml)$/.test(rel) || /^docs\/plans\//.test(rel) || rel === "CHANGELOG.md" || rel === "tools/rea-bump.mjs") continue; // the bump tool names rea-agents@latest on purpose
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/rea-agents@(\$\{REA_VERSION\}|[\w.-]*)/g)) {
      seen++;
      assert.equal(m[1] === "${REA_VERSION}" ? REA_VERSION : m[1], REA_VERSION, `${rel} names rea-agents@${m[1]}`);
    }
    assert.ok(!/npx\s+(-y\s+)?rea-agents(?![@\w-])/.test(text), `${rel} runs rea-agents unpinned`);
  }
  assert.ok(seen >= 3, "found the pinned references");
});
