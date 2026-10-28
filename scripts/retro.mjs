#!/usr/bin/env node
// End-of-run retro: find the problems that repeated and write them, with evidence, to a proposal
// file in docs/improvements/. A senior agent writes the Patch section; /autopilot:improve applies it.
// No model tokens. Always exits 0.
//
//   node retro.mjs <RUN> [--out <repo root>] [--date YYYY-MM-DD]
//
// Prints `retro: none`, `retro: <n> repeated problems -> <path>` or `retro: no ledger at <path>`.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { applicable, detectStack, load, projectRoot } from "./lessons.mjs";

const CUT = 200;
const cut = (s) => (s.length > CUT ? s.slice(0, CUT) : s);
const fwd = (p) => String(p).replace(/\\/g, "/");

/** The repeated problems of one run: [{ kind, evidence: [string] }]. */
export function problems({ ledger = "", lessons = [] }) {
  const out = [];
  for (const l of lessons) if (l.count >= 2) out.push({ kind: "lesson", evidence: [l.text] });
  const lines = String(ledger).split(/\r?\n/);
  const byTask = new Map();
  for (const l of lines) {
    const m = /^\s*intervene: task (\S+)/.exec(l);
    if (m) byTask.set(m[1], [...(byTask.get(m[1]) ?? []), l]);
  }
  for (const ev of byTask.values()) if (ev.length >= 2) out.push({ kind: "intervened", evidence: ev });
  for (const l of lines) if (/fix round 3\/3/.test(l)) out.push({ kind: "escalated", evidence: [l] });
  for (const l of lines) if (/^\s*task \S+: parked\b/.test(l)) out.push({ kind: "parked", evidence: [l] });
  return out;
}

const slugOf = (plan) => fwd(plan).replace(/\/+$/, "").split("/").pop().replace(/^\d{4}-\d{2}-\d{2}-/, "");

const summary = (p) => {
  const first = cut(p.evidence[0]).replace(/\s+/g, " ").trim();
  if (p.kind === "lesson") return `lesson seen 2 or more times: ${first}`;
  if (p.kind === "intervened") return `${p.evidence.length} interventions on one task: ${first}`;
  if (p.kind === "escalated") return `fix round 3/3 reached senior escalation: ${first}`;
  return `task parked: ${first}`;
};

export function proposal({ plan, run, date, problems: ps }) {
  const evidence = ps.flatMap((p) => p.evidence).map((e) => `- \`${cut(e).replace(/`/g, "'")}\``);
  return [
    `# Improvement: ${slugOf(plan)}`,
    "Status: proposed",
    `Run: ${fwd(run)}`,
    `Date: ${date}`,
    "",
    "## Problem",
    ...ps.map((p) => `- ${p.kind}: ${summary(p)}`),
    "",
    "## Evidence",
    ...evidence,
    "",
    "## Patch",
    "```diff",
    "```",
    "",
  ].join("\n");
}

// existsSync is false for a dangling link, so a link counts as taken.
const present = (p) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

const realDir = (p) => {
  try {
    return lstatSync(p).isDirectory();
  } catch (e) {
    return e.code === "ENOENT";
  }
};

export function proposalPath(root, date, slug) {
  const dir = join(root, "docs", "improvements");
  let file = join(dir, `${date}-${slug}.md`);
  for (let n = 2; present(file); n++) file = join(dir, `${date}-${slug}-${n}.md`);
  return file;
}

function main(args) {
  const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const run = resolve(args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--"))) ?? ".");
  const ledgerFile = join(run, "ledger.md");
  if (!existsSync(ledgerFile)) return console.log(`retro: no ledger at ${fwd(ledgerFile)}`);
  const ledger = readFileSync(ledgerFile, "utf8");
  const root = resolve(flag("--out") ?? projectRoot());
  const date = flag("--date") ?? new Date().toISOString().slice(0, 10);
  const a = applicable(load(), projectRoot(root), detectStack(root));
  const ps = problems({ ledger, lessons: [...a.repo, ...a.stack, ...a.machine] });
  if (!ps.length) return console.log("retro: none");
  const plan = /^# autopilot ledger:\s*(.+)$/m.exec(ledger)?.[1].trim() ?? run;
  const file = proposalPath(root, date, slugOf(plan));
  const dir = join(root, "docs", "improvements");
  const refuse = () => console.log(`retro: refused (a link in the path of ${fwd(file)}); nothing written`);
  if (![join(root, "docs"), dir].every(realDir)) return refuse();
  try {
    mkdirSync(dir, { recursive: true });
    if (![join(root, "docs"), dir].every((d) => lstatSync(d).isDirectory())) return refuse();
    writeFileSync(file, proposal({ plan, run, date, problems: ps }), { flag: "wx" });
  } catch {
    return refuse();
  }
  console.log(`retro: ${ps.length} repeated problems -> ${fwd(file)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.log(`retro: none (could not run: ${e.message})`);
  }
}
