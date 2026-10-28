#!/usr/bin/env node
// How many lanes this machine can carry right now. No model tokens, always exits 0.
//
//   node host-load.mjs <max lanes>      prints `lanes: N of <max> (cores 4.0, load 1.2, free 6.1 of 8.0 GB, reserve 1.0 GB, bound by memory)`;
//   add --json for an object. Limits of a cgroup v2 container (CPU quota, memory) count when present.
//
// The conductor asks at the start of every wave and runs min(plan Lanes, N). A lane is a worktree with
// its own dependency install, test run and often a browser, so a machine that is already busy gets fewer
// of them. It never says 0: one lane is always progress, and the wave before it has finished.
// AUTOPILOT_LANE_GB (default 1.5) is the memory one lane is assumed to need.
import { cpus, freemem, loadavg, totalmem } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const terms = ({ max, cores, load, freeGb, laneGb = 1.5, reserveGb = 0 }) => ({
  plan: max,
  cpu: Math.floor(cores - load),
  memory: Math.floor((freeGb - reserveGb) / laneGb),
});

/** Lanes by load and by memory (less the reserve), at least one and at most max. */
export function lanes(args) {
  const t = terms(args);
  return Math.max(1, Math.min(t.plan, t.cpu, t.memory));
}

/** The lane count and which limit set it. Ties go to plan, then cpu, then memory. */
export function explain(args) {
  const t = terms(args);
  const least = Math.min(t.plan, t.cpu, t.memory);
  const bound = t.plan === least ? "plan" : t.cpu === least ? "cpu" : "memory";
  return { lanes: lanes(args), bound };
}

/** Memory kept free for the OS and the session: the larger of 1 GB and 10% of total. */
export const reserveFor = (totalGb) => Math.max(1, totalGb * 0.1);

/** cgroup v2 limits as { cpus, memFreeGb }; null where there is no limit or it cannot be read. Never throws. */
export function readCgroup(dir = "/sys/fs/cgroup") {
  const read = (name) => {
    try {
      return readFileSync(join(dir, name), "utf8").trim();
    } catch {
      return null;
    }
  };
  let cpusLimit = null;
  const [quota, period] = (read("cpu.max") ?? "").split(/\s+/);
  if (Number(quota) > 0 && Number(period) > 0) cpusLimit = Number(quota) / Number(period);
  let memFreeGb = null;
  const limit = read("memory.max");
  const used = read("memory.current");
  if (limit !== null && used !== null && limit !== "max" && Number.isFinite(Number(limit)) && Number.isFinite(Number(used))) {
    memFreeGb = Math.max(0, Number(limit) - Number(used)) / 2 ** 30;
  }
  return { cpus: cpusLimit, memFreeGb };
}

function main() {
  const max = Math.max(1, Math.floor(Number(process.argv[2])) || 1);
  const cg = readCgroup();
  const cores = Math.max(1, Math.min(cpus().length, cg.cpus ?? Infinity));
  const load = loadavg()[0]; // 0 on Windows, where only memory limits the lanes
  const totalGb = totalmem() / 2 ** 30;
  const freeGb = Math.min(freemem() / 2 ** 30, cg.memFreeGb ?? Infinity);
  const reserveGb = reserveFor(totalGb);
  const laneGb = Number(process.env.AUTOPILOT_LANE_GB) > 0 ? Number(process.env.AUTOPILOT_LANE_GB) : 1.5;
  const { lanes: n, bound } = explain({ max, cores, load, freeGb, laneGb, reserveGb });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ lanes: n, max, cores, load, freeGb, totalGb, reserveGb, bound }));
    return;
  }
  const f = (x) => x.toFixed(1);
  console.log(
    `lanes: ${n} of ${max} (cores ${f(cores)}, load ${f(load)}, free ${f(freeGb)} of ${f(totalGb)} GB, reserve ${f(reserveGb)} GB, bound by ${bound})`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.log(`lanes: 1 (could not read the host: ${e.message})`);
  }
  process.exit(0);
}
