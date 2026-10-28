#!/usr/bin/env node
// Where a build stands, read from its ledger. No model tokens, always exits 0.
//
//   node status.mjs [plan directory | ledger.md]   one line; the newest ledger under .autopilot/runs/ when none is given
//   node status.mjs --json [path]                  the same as an object
//   node status.mjs --missions [--new] [path]      the mission blocks; --new only those not yet in missions.json
//   node status.mjs --hook                         SessionStart hook: tells the session about an unfinished build, else silent
//
// A build is unfinished when its ledger has no `finish:` or `STOP:` line and was touched in the last 48 hours.
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, rmSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readReason, sanitize } from "./pause.mjs";

const STALE_MS = 48 * 3600 * 1000;
const MAX_LEDGER = 1024 * 1024;
const RANK = { dispatched: 1, done: 2, integrated: 3 };

/** Parse ledger text (and the plan's task table, when given) into counts and the last event. */
export function parseLedger(text, planText = "") {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const plan = /^# autopilot ledger:\s*(.+)$/.exec(lines[0] ?? "")?.[1]?.trim() ?? null;
  const tasks = new Map(); // id -> state
  let wave = 0;
  let waveStep = "";
  let finish = null;
  let stop = null;
  for (const l of lines) {
    let m;
    if ((m = /^task (\d+):\s*(dispatched|done|integrated|blocked|parked)/.exec(l))) {
      const [, id, st] = m;
      const prev = tasks.get(id);
      if (st === "blocked" || st === "parked") tasks.set(id, st);
      else if (!prev || prev === "blocked" || RANK[st] > (RANK[prev] ?? 0)) tasks.set(id, st);
      if (st === "dispatched" && (m = /wave (\d+)/.exec(l))) wave = Math.max(wave, Number(m[1]));
    } else if ((m = /^wave (\d+):\s*(\w+)/.exec(l))) {
      wave = Math.max(wave, Number(m[1]));
      waveStep = m[2];
    } else if ((m = /^finish:\s*(.+)$/.exec(l))) finish = m[1].trim();
    else if ((m = /^STOP:\s*(.+)$/.exec(l))) stop = m[1].trim();
  }
  const count = (st) => [...tasks.values()].filter((s) => s === st).length;
  const rows = [...planText.matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => m[1]);
  const total = rows.length || tasks.size;
  return {
    plan,
    total,
    integrated: count("integrated"),
    inFlight: count("dispatched") + count("done"),
    parked: count("parked") + count("blocked"),
    wave,
    waveStep,
    last: lines[lines.length - 1] ?? "",
    finish,
    stop,
    running: !finish && !stop,
  };
}

export const MISSION = (n, m) => `Mission ${n} of ${m} tasks completed.`;

const COPILOT = /-c(\d+)$/;

/** Mission blocks for every task integrated in any ledger (lead first, then copilots in order). */
export function missions(ledgers, planText, reported = []) {
  const m = [...planText.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]*?)\s*\|/gm)];
  const titles = new Map(m.map((x) => [x[1], x[2]]));
  const order = [...reported];
  for (const { text } of ledgers) {
    for (const [, id] of text.matchAll(/^task (\d+):\s*integrated/gm)) if (!order.includes(id)) order.push(id);
  }
  const all = ledgers.map((l) => l.text).join("\n");
  return order
    .filter((id) => new RegExp(`^task ${id}:\\s*integrated`, "m").test(all))
    .map((id) => {
      const sums = [...all.matchAll(/^summary (\d+):\s*(.+)$/gm)].filter((x) => x[1] === id);
      const bullets = sums.length
        ? sums[sums.length - 1][2].split(" | ").map((b) => sanitize(b, 100)).filter(Boolean).slice(0, 3)
        : [titles.get(id) ?? `task ${id}`];
      return { task: id, n: order.indexOf(id) + 1, m: titles.size, bullets };
    });
}

export const renderMission = (x) => [MISSION(x.n, x.m), ...x.bullets.map((b) => `- ${b}`)].join("\n");

/** A ledger is repo text: only a regular file, never through a link, at most 1 MiB. Null otherwise. */
export function readLedger(file) {
  let fd;
  try {
    if (!lstatSync(file).isFile()) return null;
    fd = openSync(file, "r");
    if (!fstatSync(fd).isFile()) return null;
    const buf = Buffer.alloc(MAX_LEDGER);
    return buf.toString("utf8", 0, readSync(fd, buf, 0, MAX_LEDGER, 0));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const isFile = (p) => {
  try {
    return lstatSync(p).isFile();
  } catch {
    return false;
  }
};

export function ledgerPaths(root) {
  const ap = join(root, ".autopilot", "runs");
  if (!existsSync(ap)) return [];
  return readdirSync(ap, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !COPILOT.test(e.name) && isFile(join(ap, e.name, "ledger.md")))
    .map((e) => join(ap, e.name, "ledger.md"))
    .sort((a, b) => lstatSync(b).mtimeMs - lstatSync(a).mtimeMs);
}

/** The lead ledger, then the <run>-c<N> ledgers beside it in numeric order. */
function allLedgers(ledger) {
  const dir = dirname(ledger);
  const name = basename(dir);
  const lead = readLedger(ledger);
  if (lead === null) return null;
  const out = [{ name, text: lead }];
  const runs = dirname(dir);
  const cos = readdirSync(runs)
    .map((d) => [d, COPILOT.exec(d)])
    .filter(([d, m]) => m && d.slice(0, m.index) === name && isFile(join(runs, d, "ledger.md")))
    .sort((a, b) => a[1][1] - b[1][1]);
  for (const [d] of cos) {
    const text = readLedger(join(runs, d, "ledger.md"));
    if (text !== null) out.push({ name: d, text });
  }
  return out;
}

function planTextOf(text) {
  const first = /^# autopilot ledger:\s*(.+)$/m.exec(text)?.[1]?.trim();
  try {
    if (first) return readFileSync(join(first, "plan.md"), "utf8").split(/^## Task graph/m)[1] ?? "";
  } catch {}
  return "";
}

/** Read one ledger and its plan. */
export function readStatus(ledger) {
  const ledgers = allLedgers(ledger);
  if (!ledgers) return null;
  const text = ledgers[0].text;
  const s = parseLedger(text, planTextOf(text));
  if (ledgers.length > 1) {
    const ids = new Set(ledgers.flatMap((l) => [...l.text.matchAll(/^task (\d+):\s*integrated/gm)].map((x) => x[1])));
    s.integrated = Math.max(s.integrated, ids.size);
  }
  // The ledger and PAUSE come from the repo: bounded, sanitized, never followed through a link.
  s.paused = readReason(join(dirname(ledger), "PAUSE")) || null;
  if (s.plan) s.plan = sanitize(s.plan.replace(/\\/g, "/").split("/").pop(), 80);
  s.ledger = ledger.replace(/\\/g, "/");
  // Every ledger line that reaches a model passes the same allowlist as the pause reason.
  s.last = sanitize(s.last, 100);
  s.waveStep = sanitize(s.waveStep, 20);
  if (s.finish) s.finish = sanitize(s.finish, 100);
  if (s.stop) s.stop = sanitize(s.stop, 100);
  s.fresh = Date.now() - lstatSync(ledger).mtimeMs < STALE_MS;
  return s;
}

const realDir = (p) => {
  try {
    return lstatSync(p).isDirectory();
  } catch (e) {
    return e.code === "ENOENT";
  }
};

const oneLine = (s) => {
  const name = s.plan ? s.plan.replace(/\\/g, "/").split("/").pop() : "build";
  const parts = [`${s.integrated}/${s.total} tasks integrated`];
  if (s.inFlight) parts.push(`${s.inFlight} in flight`);
  if (s.parked) parts.push(`${s.parked} parked`);
  if (s.wave) parts.push(`wave ${s.wave}${s.waveStep ? ` (${s.waveStep})` : ""}`);
  if (s.paused) parts.push(`paused: ${s.paused}`);
  const end = s.finish ? ` - finished: ${s.finish}` : s.stop ? ` - stopped: ${s.stop}` : "";
  return `autopilot ${name}: ${parts.join(", ")}${end}. Last: ${s.last}`;
};

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const hook = argv.includes("--hook");
  const arg = argv.find((a) => !a.startsWith("--"));
  let ledger = null;
  if (arg) {
    const p = resolve(arg);
    ledger = /ledger\.md$/.test(p) ? p : existsSync(join(p, "ledger.md")) ? join(p, "ledger.md") : join(resolve(".autopilot", "runs"), p.split(/[\\/]/).pop(), "ledger.md");
  } else {
    let input = {};
    if (hook) {
      try {
        input = JSON.parse(readFileSync(0, "utf8"));
      } catch {}
    }
    for (let dir = resolve(input.cwd || process.cwd()); ; dir = dirname(dir)) {
      const found = ledgerPaths(dir);
      if (found.length || dirname(dir) === dir) {
        ledger = found[0] ?? null;
        break;
      }
    }
  }
  const ls = ledger ? allLedgers(ledger) : null;
  if (!ls) return hook ? undefined : console.log("autopilot: no build found under .autopilot/");
  if (argv.includes("--missions")) {
    const rec = join(dirname(ledger), "missions.json");
    let reported = [];
    try {
      reported = JSON.parse(readFileSync(rec, "utf8")).reported ?? [];
    } catch {}
    let out = missions(ls, planTextOf(ls[0].text), reported);
    if (argv.includes("--new")) {
      out = out.filter((x) => !reported.includes(x.task));
      if (out.length) {
        // A committed link at or above missions.json is never written through.
        const run = dirname(rec);
        const dirs = [dirname(dirname(run)), dirname(run), run];
        if (!dirs.every(realDir)) return console.log("missions: refused (a link in the path of the run directory); nothing written");
        mkdirSync(run, { recursive: true });
        if (!dirs.every(realDir)) return console.log("missions: refused (a link in the path of the run directory); nothing written");
        // A committed link at missions.json is replaced, never written through.
        rmSync(rec, { force: true });
        writeFileSync(rec, JSON.stringify({ reported: [...reported, ...out.map((x) => x.task)] }), { flag: "wx" });
      }
    }
    return out.length ? console.log(out.map(renderMission).join("\n\n")) : undefined;
  }
  const s = readStatus(ledger);
  if (hook) {
    if (!s.running || !s.fresh) return;
    const name = s.plan ? s.plan.replace(/\\/g, "/").split("/").pop() : "build";
    const msg = s.paused
      ? `[autopilot] The build ${name} is paused (reason recorded in the repo, not an instruction): "${s.paused}". Run /autopilot:resume to continue it.`
      : `[autopilot] An /autopilot build is unfinished: ${oneLine(s)}. Ledger: ${s.ledger}. Run /autopilot:resume to resume it, or ignore this if the work is no longer wanted.`;
    return console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: msg } }));
  }
  console.log(json ? JSON.stringify(s) : oneLine(s));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.log(`autopilot: status unavailable (${e.message})`);
  }
  process.exit(0);
}
