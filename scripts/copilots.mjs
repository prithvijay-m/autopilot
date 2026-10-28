#!/usr/bin/env node
// How many copilots, and which tasks each. Deterministic, no model tokens, always exits 0.
//
//   node copilots.mjs <plan dir> <host lanes> [--ledger <ledger.md>] [--copilot] [--json]
//
// Prints `copilots: K (host lanes H, L lanes each) c1: 03,05 | c2: 04,06`, or `copilots: 0 (<reason>)`.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readRepoFile } from "./repo-read.mjs";

const clean = (s) => s.trim().replace(/[`{}]/g, "").replace(/\/+$/, "");

/** [{ id, deps, touches }] from the table whose header has #, Blocked by and Touches. */
export function parsePlan(text) {
  const out = [];
  let cols = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) {
      cols = null;
      continue;
    }
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (!cols) {
      const id = cells.indexOf("#");
      const deps = cells.indexOf("Blocked by");
      const touches = cells.indexOf("Touches");
      if (id >= 0 && deps >= 0 && touches >= 0) cols = { id, deps, touches };
      continue;
    }
    if (/^:?-+:?$/.test(cells[0])) continue;
    const list = (c) => (cells[c] ?? "").split(",").map(clean).filter(Boolean);
    const deps = list(cols.deps).filter((d) => d.toLowerCase() !== "none");
    if (/^\d{1,4}$/.test(cells[cols.id] ?? "")) out.push({ id: cells[cols.id], deps, touches: list(cols.touches) });
  }
  return out;
}

/** Ids with a `task NN: integrated` ledger line. */
export function integrated(ledgerText) {
  const ids = new Set();
  for (const m of String(ledgerText ?? "").matchAll(/^\s*task (\S+?): integrated\b/gm)) ids.add(m[1]);
  return ids;
}

/** True when the entries are equal or one is a directory prefix of the other. */
export function overlaps(a, b) {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** Independent groups of unfinished task ids, sorted by lowest id, ids sorted inside. */
export function groups(tasks, done = new Set()) {
  const open = tasks.filter((t) => !done.has(t.id));
  const parent = new Map(open.map((t) => [t.id, t.id]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const join2 = (a, b) => parent.set(find(a), find(b));
  for (const t of open) for (const d of t.deps) if (parent.has(d)) join2(t.id, d);
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      if (open[i].touches.some((a) => open[j].touches.some((b) => overlaps(a, b)))) join2(open[i].id, open[j].id);
    }
  }
  const by = new Map();
  for (const t of open) {
    const r = find(t.id);
    by.set(r, [...(by.get(r) ?? []), t.id]);
  }
  return [...by.values()].map((g) => g.sort()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** Crews for K copilots, or none when K < 2. Lanes summed over crews never exceed hostLanes. */
export function size({ groups: gs, hostLanes, minTasks = 3 }) {
  const q = gs.filter((g) => g.length >= minTasks).length;
  const k = Math.min(q, hostLanes);
  if (k < 2) return { copilots: 0, crews: [], lanesEach: 0 };
  const crews = Array.from({ length: k }, () => []);
  const order = [...gs].sort((a, b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
  for (const g of order) {
    let best = 0;
    for (let i = 1; i < k; i++) if (crews[i].length < crews[best].length) best = i;
    crews[best].push(...g);
  }
  return { copilots: k, crews: crews.map((c) => c.sort()), lanesEach: Math.max(1, Math.floor(hostLanes / k)) };
}

function main(argv) {
  const args = argv.slice(2);
  const flag = (n) => args.includes(n);
  const li = args.indexOf("--ledger");
  const ledger = li >= 0 ? args[li + 1] : null;
  const pos = args.filter((a, i) => !a.startsWith("--") && !(li >= 0 && i === li + 1));
  const [dir = "", lanesArg = "0"] = pos;
  const none = (reason) => {
    console.log(flag("--json") ? JSON.stringify({ copilots: 0, crews: [], lanesEach: 0 }) : `copilots: 0 (${reason})`);
  };
  if (flag("--copilot")) return none("a copilot never spawns copilots");
  const file = join(dir, "plan.md");
  const planText = readRepoFile(file);
  if (planText === null) return none(`no plan.md at ${file}`);
  const hostLanes = Math.max(0, Math.floor(Number(lanesArg)) || 0);
  const done = integrated(ledger ? readRepoFile(ledger) : "");
  const r = size({ groups: groups(parsePlan(planText), done), hostLanes });
  if (flag("--json")) return console.log(JSON.stringify(r));
  if (!r.copilots) return none("fewer than 2 independent groups of 3 or more tasks");
  const crews = r.crews.map((c, i) => `c${i + 1}: ${c.join(",")}`).join(" | ");
  console.log(`copilots: ${r.copilots} (host lanes ${hostLanes}, ${r.lanesEach} lanes each) ${crews}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv);
