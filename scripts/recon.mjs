#!/usr/bin/env node
// Start Claude Code with the rea MCP server loaded for this one session, then run /recon.
// rea exposes ~200 tools; keeping it out of every other session saves their tool names on each turn,
// and nothing is written to ~/.claude.json, so there is nothing to switch off afterwards.
//
//   node recon.mjs "the target and what you want to learn"
//   node recon.mjs --print-config        show the MCP config it would pass, run nothing
//
// The server entry is the one rea-mcp.mjs pins, so both paths use the same rea-agents version.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ENTRY, REA_VERSION } from "./rea-mcp.mjs";

export const config = () => ({ mcpServers: { rea: ENTRY } });

// Node >= 20.12 refuses to spawn claude.cmd without a shell, and cmd.exe would run an & or | in an argument.
// So each argument is double-quoted for cmd.exe, with the characters it still interprets inside quotes
// (% expands, ^ & | < > ( ) and a newline break out) replaced by a space.
// shortcut: those characters are lost from the prompt rather than escaped, since cmd.exe has no safe escape for them; upgrade if a target needs them.
export const winArg = (a) => `"${String(a).replace(/[%^&|<>()\r\n]/g, " ").replace(/"/g, '""').replace(/(\\+)$/, "$1$1")}"`;

function main(argv) {
  if (argv[0] === "--print-config") {
    console.log(JSON.stringify(config(), null, 2));
    return 0;
  }
  const dir = mkdtempSync(join(tmpdir(), "autopilot-recon-"));
  const file = join(dir, "rea.mcp.json");
  writeFileSync(file, JSON.stringify(config()));
  try {
    const prompt = ["/autopilot:recon", ...argv].join(" ");
    const win = process.platform === "win32";
    // a temp path with ( ) % & would be altered by winArg, so the same config goes inline instead
    const mcp = win && /[%^&|<>()]/.test(file) ? JSON.stringify(config()) : file;
    console.error(`recon: loading rea-agents@${REA_VERSION} for this session only`);
    const args = ["--mcp-config", mcp, prompt];
    const r = win ? spawnSync("claude.cmd", args.map(winArg), { stdio: "inherit", shell: true }) : spawnSync("claude", args, { stdio: "inherit" });
    if (r.error) {
      console.error(`recon: could not start claude (${r.error.message})`);
      return 1;
    }
    return r.status ?? 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
