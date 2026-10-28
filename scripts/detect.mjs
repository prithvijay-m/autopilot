#!/usr/bin/env node
// Names a stalled, hallucinating, looping or under-briefed agent, and the remedy. No model tokens, always exits 0.
//
//   node detect.mjs start <RUN> <NN>                      records the dispatch time in RUN/clock.json
//   node detect.mjs check <RUN> <NN> [--report <file>] [--task <task file>] [--now <ISO>]
//                                                         one line per tripped signal, `clear task NN`, or a PAUSE line
//
// The conductor runs `start` at dispatch and `check` when the report arrives, then applies the remedy and logs
// `intervene: task NN <signal> -> <remedy>`. A second trip after that line pauses the run instead.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { similarity } from "./lessons.mjs";

const VERDICT = /\b(DONE_WITH_CONCERNS|DONE|BLOCKED|READY|APPROVE|CHANGES|PASS|FAIL)\b/;
const MISSING = /not found|missing|no such|cannot find|unknown|which file|where is/i;
const HEX = /^[0-9a-f]{7,40}$/i;
const STALL_MIN = 90;
const BIG_TASK = 8;
const SIMILAR = 0.6;

/** Backticked paths (optional :line) and 7 to 40 hex shas (after `@ ` or in backticks) found in text. */
export function citations(text) {
  const paths = new Set();
  const shas = new Set();
  for (const m of String(text ?? "").matchAll(/`([^`\s]+)`/g)) {
    const tok = m[1];
    if (HEX.test(tok)) {
      shas.add(tok);
      continue;
    }
    const p = tok.replace(/:\d+$/, "");
    if (p.includes("/") || /\.[A-Za-z0-9]+$/.test(p)) paths.add(p);
  }
  for (const m of String(text ?? "").matchAll(/@ ([0-9a-f]{7,40})\b/gi)) shas.add(m[1]);
  return { paths: [...paths], shas: [...shas] };
}

const git = (repo, args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
const norm = (p) => p.replace(/\\/g, "/");

/** Citations that do not resolve: paths at the commit (or HEAD), shas as commits. Unverifiable ones are skipped. */
export function unresolvedCitations(repo, sha, cites) {
  const out = [];
  const inRepo = git(repo, ["rev-parse", "--git-dir"]).status === 0;
  const root = norm(resolve(repo));
  for (const sh of cites.shas ?? []) {
    if (inRepo && git(repo, ["cat-file", "-e", `${sh}^{commit}`]).status !== 0) out.push(sh);
  }
  for (const raw of cites.paths ?? []) {
    let p = norm(raw);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p) || /[<>*?[\]{}]/.test(p)) continue;
    if (isAbsolute(p) || /^[A-Za-z]:\//.test(p)) {
      if (!p.startsWith(root + "/")) continue;
      p = p.slice(root.length + 1);
    }
    p = p.replace(/^\.\//, "");
    if (!p) continue;
    if (p.startsWith(".autopilot/")) {
      if (!existsSync(join(repo, p))) out.push(p);
    } else if (inRepo) {
      const at = sha && git(repo, ["cat-file", "-e", `${sha}^{commit}`]).status === 0 ? sha : "HEAD";
      if (git(repo, ["cat-file", "-e", `${at}:${p}`]).status !== 0) out.push(p);
    }
  }
  return out;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The trip lines for one task. Each input is optional; a signal without its input is simply not checked. */
export function signals({ ledger = "", task, report, elapsedMin, criteria, unresolved }) {
  const found = [];
  const nn = esc(task ?? "\\d+");
  const lines = String(ledger).split(/\r?\n/);
  const remedyStall = criteria >= BIG_TASK ? "split" : "reset";

  if (typeof elapsedMin === "number" && elapsedMin >= STALL_MIN) {
    found.push({ signal: "stall", evidence: `${Math.round(elapsedMin)} minutes since dispatch`, remedy: remedyStall });
  } else if (typeof report === "string" && !VERDICT.test(report)) {
    found.push({ signal: "stall", evidence: "report has no verdict word", remedy: remedyStall });
  }

  if (unresolved?.length) {
    found.push({ signal: "hallucination", evidence: `unresolved citations: ${unresolved.join(", ")}`, remedy: "findings" });
  }

  const blocked = lines.map((l) => new RegExp(`task ${nn}: blocked: (.+)$`).exec(l)?.[1]?.trim()).filter(Boolean);
  let loop = null;
  for (let i = 0; i < blocked.length && !loop; i++) {
    for (let j = i + 1; j < blocked.length; j++) {
      if (similarity(blocked[i], blocked[j]) >= SIMILAR) {
        loop = `blocked twice for the same reason: ${blocked[j]}`;
        break;
      }
    }
  }
  const wave = lines.map((l) => new RegExp(`task ${nn}: dispatched \\(wave (\\d+)`).exec(l)?.[1]).filter(Boolean).pop();
  if (!loop && wave) {
    const rounds = lines
      .map((l) => new RegExp(`wave ${wave}: fix round (\\d+)/3: (\\d+)/\\d+ addressed`).exec(l))
      .filter(Boolean)
      .map((m) => Number(m[2]));
    const [a, b] = rounds.slice(-2);
    if (rounds.length >= 2 && b <= a) loop = `fix rounds in wave ${wave} stuck at ${b} addressed`;
  }
  if (loop) found.push({ signal: "circular", evidence: loop, remedy: "senior" });

  const unknowns = typeof report === "string" ? (report.match(/^UNKNOWN:/gm) ?? []).length : 0;
  const latest = blocked.at(-1);
  if (latest && MISSING.test(latest)) {
    found.push({ signal: "missing-context", evidence: `blocked: ${latest}`, remedy: "context" });
  } else if (unknowns >= 2) {
    found.push({ signal: "missing-context", evidence: `${unknowns} UNKNOWN lines in the report`, remedy: "context" });
  }
  return found;
}

/** The output lines: the trips, `clear`, or one PAUSE when the task was already intervened on. */
export function decide({ ledger = "", task, found }) {
  if (!found.length) return [`clear task ${task}`];
  if (new RegExp(`intervene: task ${esc(task)}\\b`).test(ledger)) {
    return [`PAUSE task ${task}: ${found[0].signal} again after an intervention`];
  }
  return found.map((f) => `${f.signal} task ${task}: ${f.evidence} -> ${f.remedy}`);
}

const read = (p) => (p && existsSync(p) ? readFileSync(p, "utf8") : undefined);
const readJson = (p) => {
  try {
    return JSON.parse(read(p) ?? "{}");
  } catch {
    return {};
  }
};
const flag = (args, name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

// A repository can commit links in a run directory, so the clock is written through a temp file and a rename.
const realDir = (p) => {
  try {
    return lstatSync(p).isDirectory();
  } catch (e) {
    return e.code === "ENOENT";
  }
};
const plainOrAbsent = (p) => {
  try {
    return lstatSync(p).isFile();
  } catch (e) {
    return e.code === "ENOENT";
  }
};

function start(run, nn) {
  const file = join(run, "clock.json");
  const refuse = () => console.log(`clock: refused (a link or non-file in the path of ${file.replace(/\\/g, "/")}); nothing written`);
  const dirs = [dirname(dirname(run)), dirname(run), run];
  if (!dirs.every(realDir) || !plainOrAbsent(file)) return refuse();
  mkdirSync(run, { recursive: true });
  if (!dirs.every(realDir)) return refuse();
  const iso = new Date().toISOString();
  const tmp = join(run, `.clock.json.${process.pid}`);
  try {
    rmSync(tmp, { force: true });
    writeFileSync(tmp, JSON.stringify({ ...readJson(file), [nn]: iso }, null, 2) + "\n", { flag: "wx" });
    renameSync(tmp, file);
  } catch {
    rmSync(tmp, { force: true });
    return refuse();
  }
  console.log(`clock: task ${nn} started ${iso}`);
}

function check(run, nn, args) {
  const ledger = read(join(run, "ledger.md")) ?? "";
  const report = read(flag(args, "--report"));
  const taskText = read(flag(args, "--task"));
  const started = readJson(join(run, "clock.json"))[nn];
  const now = flag(args, "--now") ? Date.parse(flag(args, "--now")) : Date.now();
  const elapsedMin = started && Number.isFinite(now) && Number.isFinite(Date.parse(started)) ? (now - Date.parse(started)) / 60000 : undefined;
  const criteria = taskText === undefined ? undefined : (taskText.match(/^\s*- \[[ xX]\]/gm) ?? []).length;
  let unresolved;
  if (report !== undefined) {
    const repo = resolve(run, "..", "..", "..");
    const sha = /@ ([0-9a-f]{7,40})\b/i.exec(report)?.[1] ?? new RegExp(`task ${esc(nn)}: done \\S+ @ ([0-9a-f]{7,40})`).exec(ledger)?.[1] ?? null;
    unresolved = unresolvedCitations(repo, sha, citations(report));
  }
  const found = signals({ ledger, task: nn, report, elapsedMin, criteria, unresolved });
  for (const l of decide({ ledger, task: nn, found })) console.log(l);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, run, nn, ...rest] = process.argv.slice(2);
  try {
    if (cmd === "start" && run && nn) start(resolve(run), nn);
    else if (cmd === "check" && run && nn) check(resolve(run), nn, rest);
    else console.log("usage: detect.mjs start <RUN> <NN> | check <RUN> <NN> [--report f] [--task f] [--now ISO]");
  } catch (e) {
    console.log(`clear task ${nn} (detector could not run: ${e.message})`);
  }
  process.exit(0);
}
