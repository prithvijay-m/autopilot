import { test } from "node:test";
import assert from "node:assert/strict";
import { tempDir, node } from "./helpers.mjs";
import { ENTRY, REA_VERSION } from "../scripts/rea-mcp.mjs";
import { winArg } from "../scripts/recon.mjs";

test("recon passes the same pinned rea server that rea-mcp enables, and writes nothing to the user's config", () => {
  const home = tempDir();
  try {
    const r = node(home.dir, "recon.mjs", ["--print-config"], { HOME: home.dir, USERPROFILE: home.dir });
    assert.equal(r.status, 0);
    const cfg = JSON.parse(r.out);
    assert.deepEqual(cfg.mcpServers.rea, ENTRY);
    assert.ok(cfg.mcpServers.rea.args.some((a) => /^rea-agents@\d+\.\d+\.\d+$/.test(a)), "pinned to an exact version");
  } finally {
    home.cleanup();
  }
});

test("recon names the pinned version it loads", () => {
  assert.match(REA_VERSION, /^\d+\.\d+\.\d+$/);
  assert.ok(ENTRY.args.includes(`rea-agents@${REA_VERSION}`));
});

test("winArg quotes for cmd.exe and neutralises its metacharacters", () => {
  assert.equal(winArg("plain words"), '"plain words"');
  assert.equal(winArg('say "hi"'), '"say ""hi"""');
  assert.equal(winArg("a & calc | b > c < d ^ e (f) %PATH%"), '"a   calc   b   c   d   e  f   PATH "');
  for (const c of "%^&|<>()") assert.ok(!winArg(`x${c}y`).slice(1, -1).includes(c), `${c} removed`);
  assert.equal(winArg("line1\nline2"), '"line1 line2"');
  assert.equal(winArg("C:\\dir\\"), '"C:\\dir\\\\"', "a trailing backslash cannot escape the closing quote");
  assert.equal(winArg(12), '"12"');
});
