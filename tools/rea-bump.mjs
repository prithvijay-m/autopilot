#!/usr/bin/env node
// Keep the pinned rea-agents version at npm's latest, without ever running unvetted code on a user's machine:
// a scheduled workflow runs this, and a human merges the pull request it opens.
//   node tools/rea-bump.mjs [--check]     --check changes nothing; exit 1 when a bump is available or refused
// Prints one line. Refuses (exit 1, nothing written) when the new version has a preinstall, install or
// postinstall script: those run on `npx -y`, so the version needs a human read first.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LIFECYCLE = ["preinstall", "install", "postinstall"];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
// Files that name the pin or its Node range. History (CHANGELOG, docs/plans) is left alone.
const FILES = ["scripts/rea-mcp.mjs", "README.md", "skills/recon/SKILL.md"];

const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => SEMVER.exec(v).slice(1).map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

/** What to do about npm's latest: { action: "none" | "bump" | "refuse", why }. `info` is `npm view rea-agents@latest --json`. */
export function decide(current, info) {
  const latest = info?.version;
  if (typeof latest !== "string" || !SEMVER.test(latest)) return { action: "refuse", why: `npm latest "${latest}" is not a plain x.y.z version` };
  if (!newer(latest, current)) return { action: "none", why: `${current} is the latest` };
  const bad = LIFECYCLE.filter((k) => info.scripts?.[k]);
  if (bad.length) return { action: "refuse", why: `${latest} has ${bad.join(", ")} script(s), which run on npx; read them before bumping` };
  return { action: "bump", why: `${current} -> ${latest}` };
}

/** "^22.23.4 || ^24.22.1 || >=26.12.1" -> "22.23.4+, 24.22.1+ or 26.12.1+"; null for any other shape. */
export function engineText(range) {
  const v = String(range ?? "").split("||").map((p) => /^\s*(?:\^|>=)(\d+\.\d+\.\d+)\s*$/.exec(p)?.[1]);
  return v.length === 3 && v.every(Boolean) ? `${v[0]}+, ${v[1]}+ or ${v[2]}+` : null;
}

/** The file text with the old pin and Node range replaced. */
export function rewrite(text, from, to, engines) {
  let out = text.split(from).join(to);
  if (engines) out = out.replace(/\d+\.\d+\.\d+\+, \d+\.\d+\.\d+\+ or \d+\.\d+\.\d+\+/g, engines);
  return out;
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const src = readFileSync(join(root, "scripts", "rea-mcp.mjs"), "utf8");
  const current = /REA_VERSION = "(\d+\.\d+\.\d+)"/.exec(src)?.[1];
  if (!current) return console.log("rea-bump: cannot find REA_VERSION"), 1;
  const info = JSON.parse(execFileSync("npm", ["view", "rea-agents@latest", "--json"], { encoding: "utf8" }));
  const d = decide(current, info);
  console.log(`rea-bump: ${d.action} (${d.why})`);
  if (d.action === "refuse") return 1;
  if (d.action === "none") return 0;
  if (argv.includes("--check")) return 1;
  const engines = engineText(info.engines?.node);
  if (!engines) console.log("rea-bump: node range has an unexpected shape; update the Node text by hand");
  for (const f of FILES) {
    const p = join(root, f);
    writeFileSync(p, f === "scripts/rea-mcp.mjs" ? rewrite(readFileSync(p, "utf8"), current, info.version, null) : rewrite(readFileSync(p, "utf8"), `rea-agents@${current}`, `rea-agents@${info.version}`, engines));
  }
  console.log(`rea-bump: rewrote ${FILES.join(", ")}; run npm test, then review the diff`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
