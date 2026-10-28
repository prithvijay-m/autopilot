import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { node, scripts, sh, tempDir, tempRepo } from "./helpers.mjs";
import { CREW, PLAN_NAME, blocks, pausedRuns, runsDir, sanitize } from "../scripts/pause.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cleanups = [];
const repo = () => {
  const r = tempRepo();
  cleanups.push(r.cleanup);
  return r;
};
after(() => cleanups.forEach((c) => c()));

const scoped = (m) => "autopilot" + ":" + m;
const flag = (r, plan) => join(r.dir, ".autopilot", "runs", plan, "PAUSE");
const hook = (cwd, input, raw) =>
  spawnSync(process.execPath, [join(scripts, "pause.mjs"), "--hook"], {
    cwd,
    encoding: "utf8",
    input: raw ?? JSON.stringify(input),
  });
const dispatch = (type, tool = "Agent") => ({ tool_name: tool, tool_input: { subagent_type: type } });

describe("pause CLI", () => {
  it("set writes the flag", () => {
    const r = repo();
    const o = node(r.dir, "pause.mjs", ["set", "plan-a", "manual", "intervention"]);
    assert.equal(o.status, 0);
    assert.equal(o.out, "paused: plan-a: manual intervention");
    assert.equal(readFileSync(flag(r, "plan-a"), "utf8").split("\n")[0], "manual intervention");
  });

  it("reason is sanitized", () => {
    const r = repo();
    node(r.dir, "pause.mjs", ["set", "p", "a\nb\r\u001b[31m" + "x".repeat(400)]);
    const text = readFileSync(flag(r, "p"), "utf8");
    const line = text.split("\n")[0];
    assert.ok(line.length <= 200);
    assert.ok(!/[\u0000-\u001f\u007f]/.test(line));
    assert.ok(text.trimEnd() === line);
    assert.equal(sanitize("  a \n\n b\t\u0000c  "), "a b c");
    assert.equal(sanitize("y".repeat(300)).length, 200);
  });

  it("bad names refused", () => {
    const r = repo();
    for (const bad of ["../x", "a/b", "a\\b", "..", ".hidden", "a..b", "", "-x"]) {
      const o = node(r.dir, "pause.mjs", ["set", bad, "why"]);
      assert.equal(o.status, 0);
      // the echoed name goes through the allowlist too
      assert.equal(o.out, `pause: refused plan name "${sanitize(bad)}"`);
    }
    assert.ok(!existsSync(join(r.dir, "x")));
    assert.ok(!existsSync(join(r.dir, ".autopilot", "x")));
    const runs = join(r.dir, ".autopilot", "runs");
    assert.deepEqual(existsSync(runs) ? readdirSync(runs) : [], []);
    assert.equal(node(r.dir, "pause.mjs", ["clear", "../x"]).out, 'pause: refused plan name "../x"');
    assert.ok(PLAN_NAME.test("ok.name_1-2"));
  });

  it("set does not follow links", (t) => {
    const r = repo();
    const out = tempDir("forge-victim-");
    cleanups.push(out.cleanup);
    const victim = join(out.dir, "file");
    writeFileSync(victim, "keep");
    mkdirSync(join(r.dir, ".autopilot", "runs", "a"), { recursive: true });
    try {
      symlinkSync(victim, flag(r, "a"));
      symlinkSync(out.dir, join(r.dir, ".autopilot", "runs", "b"), "dir");
    } catch (e) {
      if (e.code === "EPERM") return t.skip("no symlinks");
      throw e;
    }
    const a = node(r.dir, "pause.mjs", ["set", "a", "why"]);
    assert.equal(a.status, 0);
    assert.equal(readFileSync(victim, "utf8"), "keep");
    const b = node(r.dir, "pause.mjs", ["set", "b", "why"]);
    assert.equal(b.status, 0);
    assert.match(b.out, /^pause: refused/);
    assert.ok(!existsSync(join(out.dir, "PAUSE")));
  });

  it("clear", () => {
    const r = repo();
    node(r.dir, "pause.mjs", ["set", "p", "why"]);
    const o = node(r.dir, "pause.mjs", ["clear", "p"]);
    assert.equal(o.out, "resumed: p");
    assert.ok(!existsSync(flag(r, "p")));
    const again = node(r.dir, "pause.mjs", ["clear", "p"]);
    assert.equal(again.out, "not paused: p");
    assert.equal(again.status, 0);
  });

  it("show", () => {
    const r = repo();
    assert.equal(node(r.dir, "pause.mjs", ["show"]).out, "no paused run");
    node(r.dir, "pause.mjs", ["set", "one", "r1"]);
    node(r.dir, "pause.mjs", ["set", "two", "r2"]);
    assert.equal(node(r.dir, "pause.mjs", ["show"]).out, "paused: one: r1\npaused: two: r2");
  });

  it("worktree resolves to main", () => {
    const r = repo();
    const wt = tempDir("forge-wt-");
    cleanups.push(wt.cleanup);
    const lane = join(wt.dir, "lane");
    assert.equal(r.git("worktree", "add", "-q", "-b", "lane", lane).status, 0);
    const o = node(lane, "pause.mjs", ["set", "p", "from lane"]);
    assert.equal(o.status, 0);
    assert.ok(existsSync(flag(r, "p")));
    assert.ok(!existsSync(join(lane, ".autopilot")));
    assert.equal(node(lane, "pause.mjs", ["show"]).out, "paused: p: from lane");
  });

  it("runsDir falls back to cwd outside git", () => {
    const d = tempDir("forge-nogit-");
    cleanups.push(d.cleanup);
    assert.ok(runsDir(d.dir).replace(/\\/g, "/").endsWith("/.autopilot/runs"));
  });
});

describe("pause hook", () => {
  it("blocks a scoped crew dispatch while paused", () => {
    const r = repo();
    node(r.dir, "pause.mjs", ["set", "plan-a", "stalled"]);
    for (const [m, tool] of [["coder", "Agent"], ["conductor", "Task"], ["senior", "Agent"]]) {
      const o = hook(r.dir, dispatch(scoped(m), tool));
      assert.equal(o.status, 2);
      assert.ok(o.stderr.includes("plan-a") && o.stderr.includes("/autopilot:resume") && o.stderr.includes("stalled"));
    }
    assert.equal(CREW.length, 7);
  });

  it("lets a non-crew agent through while paused", () => {
    const r = repo();
    node(r.dir, "pause.mjs", ["set", "p", "x"]);
    assert.equal(hook(r.dir, dispatch("Explore")).status, 0);
    assert.equal(hook(r.dir, dispatch(scoped("other"))).status, 0);
    assert.equal(hook(r.dir, { tool_name: "Bash", tool_input: { subagent_type: scoped("coder") } }).status, 0);
  });

  it("unscoped names pass", () => {
    const r = repo();
    node(r.dir, "pause.mjs", ["set", "p", "x"]);
    assert.equal(hook(r.dir, dispatch("coder")).status, 0);
  });

  it("nothing paused", () => {
    const r = repo();
    assert.equal(hook(r.dir, dispatch(scoped("coder"))).status, 0);
  });

  it("bad input passes", () => {
    const r = repo();
    node(r.dir, "pause.mjs", ["set", "p", "x"]);
    for (const raw of ["", "not json", "null", "[1]", '{"tool_name":"Agent"}']) assert.equal(hook(r.dir, null, raw).status, 0);
  });

  it("message is one clean line even from a hand-edited PAUSE", () => {
    const r = repo();
    r.write(".autopilot/runs/p/PAUSE", "bad \u001b[31mred\nsecond line\u0007\n");
    const o = hook(r.dir, dispatch(scoped("coder")));
    assert.equal(o.status, 2);
    assert.ok(!/[\u0000-\u0009\u000b-\u001f\u007f]/.test(o.stderr));
    assert.equal(o.stderr.trimEnd().split("\n").length, 1);
  });

  it("pausedRuns ignores odd directory names and bounds the read", () => {
    const r = repo();
    r.write(".autopilot/runs/.hid/PAUSE", "x");
    r.write(".autopilot/runs/ok/PAUSE", "y".repeat(100000));
    const runs = pausedRuns(join(r.dir, ".autopilot", "runs"));
    assert.equal(runs.length, 1);
    assert.equal(runs[0].plan, "ok");
    assert.ok(runs[0].reason.length <= 200);
  });

  it("blocks() unit", () => {
    const paused = [{ plan: "p", reason: "r" }];
    assert.equal(blocks(dispatch(scoped("ux")), []), null);
    assert.match(blocks(dispatch(scoped("ux")), paused), /^autopilot: the run p is paused \(r\)\./);
    assert.equal(blocks(null, paused), null);
  });

  it("hooks.json registers the hook", () => {
    const h = JSON.parse(readFileSync(join(root, "hooks", "hooks.json"), "utf8"));
    const g = h.hooks.PreToolUse.find((x) => x.matcher === "Agent|Task");
    assert.ok(g);
    assert.ok(g.hooks[0].command.includes("scripts/pause.mjs") && g.hooks[0].command.includes("--hook"));
    assert.ok(!g.hooks[0].command.includes("{pause"));
    const v = sh(root, process.execPath, [join(root, "tools", "validate.mjs")]);
    assert.equal(v.status, 0);
  });
});

describe("pause hardening (verify round 1)", () => {
  it("sanitize allowlists the reason", () => {
    assert.doesNotMatch(sanitize('a "$(x)" `y`; z\\w $HOME'), /["$`;\\]/);
    assert.equal(sanitize("task 03: reset again after an intervention"), "task 03: reset again after an intervention");
    assert.equal(sanitize("manual intervention"), "manual intervention");
  });

  it("set prints the allowlisted reason and blocks() carries no shell metacharacters", () => {
    const r = repo();
    assert.equal(node(r.dir, "pause.mjs", ["set", "p", "r $(x)"]).out, "paused: p: r (x)");
    const msg = blocks(dispatch(scoped("coder")), [{ plan: "p", reason: "$(touch f)" }]);
    assert.doesNotMatch(msg, /[$`]/);
  });

  it("clear refuses a linked runs dir and leaves the linked PAUSE", () => {
    const r = repo();
    const out = tempDir();
    cleanups.push(out.cleanup);
    mkdirSync(join(out.dir, "p"), { recursive: true });
    writeFileSync(join(out.dir, "p", "PAUSE"), "keep\n");
    mkdirSync(join(r.dir, ".autopilot"), { recursive: true });
    symlinkSync(out.dir, join(r.dir, ".autopilot", "runs"));
    assert.equal(node(r.dir, "pause.mjs", ["clear", "p"]).out, 'pause: refused plan name "p"');
    assert.ok(existsSync(join(out.dir, "p", "PAUSE")));
  });

  it("clear refuses a PAUSE that is a symlink and leaves the target", () => {
    const r = repo();
    const out = tempDir();
    cleanups.push(out.cleanup);
    const target = join(out.dir, "t");
    writeFileSync(target, "keep\n");
    mkdirSync(join(r.dir, ".autopilot", "runs", "p"), { recursive: true });
    symlinkSync(target, flag(r, "p"));
    assert.match(node(r.dir, "pause.mjs", ["clear", "p"]).out, /refused/);
    assert.equal(readFileSync(target, "utf8"), "keep\n");
  });
});

describe("a linked run directory is never read", () => {
  it("show lists no linked run, and the hook is not blocked by its PAUSE", { skip: process.platform === "win32" }, () => {
    const r = repo();
    const out = tempDir("forge-pause-out-");
    cleanups.push(out.cleanup);
    writeFileSync(join(out.dir, "PAUSE"), "outside\n");
    mkdirSync(join(r.dir, ".autopilot", "runs"), { recursive: true });
    symlinkSync(out.dir, join(r.dir, ".autopilot", "runs", "p"));
    assert.equal(node(r.dir, "pause.mjs", ["show"]).out, "no paused run");
    assert.equal(hook(r.dir, dispatch(scoped("coder"))).status, 0);
  });
});
