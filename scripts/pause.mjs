#!/usr/bin/env node
// Pause flag for a run: `.autopilot/runs/<plan>/PAUSE` holds one line, the reason.
//   pause.mjs set <plan> <reason...> | clear <plan> | show   (every form exits 0)
//   pause.mjs --hook   PreToolUse hook on Agent|Task: exits 2 while a run is paused and a
//                      build-crew agent of this plugin is dispatched; fails open otherwise.
// The plan name and the file text are untrusted: names are checked, reads are bounded,
// text is sanitized and never executed.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PLAN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const CREW = ["conductor", "coder", "ux", "db", "reviewer", "runner", "senior"];
const SCOPE = "autopilot" + ":";
const MAX_REASON = 200;
const MAX_READ = 1024;

const validPlan = (name) => typeof name === "string" && PLAN_NAME.test(name) && !name.includes("..");

export function sanitize(reason) {
  return String(reason ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, MAX_REASON);
}

export function runsDir(cwd = process.cwd()) {
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, encoding: "utf8" });
  // The common dir is <main checkout>/.git, also from inside a linked worktree.
  const root = r.status === 0 && r.stdout.trim() ? resolve(r.stdout.trim(), "..") : resolve(cwd);
  return join(root, ".autopilot", "runs");
}

function readReason(file) {
  let fd;
  try {
    if (!lstatSync(file).isFile()) return null;
    fd = openSync(file, "r");
    if (!fstatSync(fd).isFile()) return null;
    const buf = Buffer.alloc(MAX_READ);
    const n = readSync(fd, buf, 0, MAX_READ, 0);
    return sanitize(buf.toString("utf8", 0, n).split(/\r\n|\r|\n/)[0]);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function pausedRuns(runs) {
  let names;
  try {
    names = readdirSync(runs);
  } catch {
    return [];
  }
  const out = [];
  for (const plan of names.sort()) {
    if (!validPlan(plan)) continue;
    const reason = readReason(join(runs, plan, "PAUSE"));
    if (reason !== null) out.push({ plan, reason });
  }
  return out;
}

export function blocks(input, paused) {
  if (!paused?.length) return null;
  if (input?.tool_name !== "Agent" && input?.tool_name !== "Task") return null;
  const type = input.tool_input?.subagent_type;
  if (typeof type !== "string" || !CREW.some((m) => type === SCOPE + m)) return null;
  const { plan, reason } = paused[0];
  return (
    `autopilot: the run ${sanitize(plan)} is paused (${sanitize(reason)}). Do not dispatch build agents. ` +
    `A conductor ends its turn with PAUSED: ${sanitize(reason)}; the user resumes with /autopilot:resume.`
  );
}

function hook() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return 0;
  }
  if (!input || typeof input !== "object") return 0;
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const msg = blocks(input, pausedRuns(runsDir(cwd)));
  if (!msg) return 0;
  process.stderr.write(msg + "\n");
  return 2;
}

// A repository can commit links under .autopilot, so the write path never follows one.
function realDir(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch (e) {
    return e.code === "ENOENT";
  }
}

function writeFlag(dir, file, reason) {
  const runs = dirname(dir);
  for (const p of [dirname(runs), runs, dir]) if (!realDir(p)) return false;
  try {
    mkdirSync(dir, { recursive: true });
    for (const p of [dirname(runs), runs, dir]) if (!lstatSync(p).isDirectory()) return false;
    rmSync(file, { force: true, recursive: false });
    writeFileSync(file, reason + "\n", { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

function cli(args) {
  const [cmd, plan, ...rest] = args;
  const say = (s) => console.log(s);
  if (cmd === "show") {
    const runs = pausedRuns(runsDir());
    say(runs.length ? runs.map((r) => `paused: ${r.plan}: ${r.reason}`).join("\n") : "no paused run");
    return 0;
  }
  if (cmd !== "set" && cmd !== "clear") {
    say("usage: pause.mjs set <plan> <reason...> | clear <plan> | show");
    return 0;
  }
  if (!validPlan(plan)) {
    say(`pause: refused plan name "${sanitize(plan)}"`);
    return 0;
  }
  const dir = join(runsDir(), plan);
  const file = join(dir, "PAUSE");
  if (cmd === "set") {
    const reason = sanitize(rest.join(" "));
    if (!writeFlag(dir, file, reason)) {
      say(`pause: refused plan name "${plan}"`);
      return 0;
    }
    say(`paused: ${plan}: ${reason}`);
  } else if (existsSync(file)) {
    rmSync(file, { force: true });
    say(`resumed: ${plan}`);
  } else {
    say(`not paused: ${plan}`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  process.exit(args[0] === "--hook" ? hook() : cli(args));
}
