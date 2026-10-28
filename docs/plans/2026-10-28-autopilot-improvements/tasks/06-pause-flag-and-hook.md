# 06: Pause flag and its PreToolUse hook

Security: yes (a hook, and a flag any process can write: prompt-injection surface)
Graph: hooks.json is not in the graph. Model the script on runActive() and projectRoot().
Spec: 3.7.1, 3.7.2, 3.7.3, 3.7.4
Decisions: D10, D26

## Goal
One flag file pauses a run at the next dispatch. A new script, `scripts/{pause.mjs}`, sets it, clears it and lists it. Registered as a PreToolUse hook, the same script refuses to dispatch build-crew agents while any run in the repository is paused.

## Interfaces
Provides:
- CLI `pause.mjs set <plan> <reason...>` writes `<root>/.autopilot/runs/<plan>/PAUSE` (the reason as its one line) and prints `paused: <plan>: <reason>`.
- `pause.mjs clear <plan>` prints `resumed: <plan>`, or `not paused: <plan>`.
- `pause.mjs show` prints `paused: <plan>: <reason>` per run, or `no paused run`.
- A bad plan name prints `pause: refused plan name "<name>"`. Every CLI form exits 0.
- `pause.mjs --hook` reads the PreToolUse JSON on stdin. It exits 2 with a stderr message when it blocks, and exits 0 otherwise.
- `export const PLAN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/`. A name containing `..` is also refused.
- `export const CREW = ["conductor", "coder", "ux", "db", "reviewer", "runner", "senior"]`
- `export function sanitize(reason)`: control characters (including CR and LF) become spaces, runs of spaces collapse, the result is trimmed and cut to 200 characters.
- `export function runsDir(cwd)` returns `<root>/.autopilot/runs`, where root is the parent of `git rev-parse --path-format=absolute --git-common-dir` (so a lane worktree resolves to the main checkout). Outside git it is cwd.
- `export function pausedRuns(runs)` returns `[{ plan, reason }]`, with the reason sanitized again on read.
- `export function blocks(input, paused)` returns a message or null. It blocks only when `input.tool_name` is `Agent` or `Task`, `input.tool_input.subagent_type` equals the plugin's scoped name for a CREW member (the string "autopilot" + ":" + the member), and `paused` is not empty. The message is: `autopilot: the run <plan> is paused (<reason>). Do not dispatch build agents. A conductor ends its turn with PAUSED: <reason>; the user resumes with /autopilot:resume.`
- `hooks/hooks.json` gains a PreToolUse group: `{ "matcher": "Agent|Task", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/{pause.mjs}\" --hook", "timeout": 10 }] }`. Write the real path without braces.

Consumes: nothing. Task 03 reads the PAUSE file; tasks 15, 16 and 17 run the CLI.

## Acceptance criteria
- [ ] `set` writes PAUSE with the reason as its first line. Proof: tests/pause.test.mjs "set writes the flag".
- [ ] A reason with newlines and control characters is stored as one line of at most 200 characters. Proof: tests/pause.test.mjs "reason is sanitized".
- [ ] A plan name with `/`, `\`, `..` or a leading `.` is refused, and nothing is written. Proof: tests/pause.test.mjs "bad names refused" checks that no file exists outside runs/.
- [ ] `clear` removes the flag. Proof: tests/pause.test.mjs "clear".
- [ ] `clear` on a plan that is not paused says `not paused: <plan>`. Proof: same test.
- [ ] `show` lists paused runs, or `no paused run`. Proof: tests/pause.test.mjs "show".
- [ ] From a linked worktree, `set` writes under the main checkout's `.autopilot/runs`. Proof: tests/pause.test.mjs "worktree resolves to main" (`tempRepo()` plus `git worktree add`).
- [ ] The hook blocks a scoped crew dispatch while paused, with exit 2 and a message naming the plan and `/autopilot:resume`. Proof: tests/pause.test.mjs hook case.
- [ ] The hook lets a non-crew agent through while paused. Proof: tests/pause.test.mjs, where `Explore` exits 0.
- [ ] The hook lets the user's own unscoped `coder` through while paused. Proof: tests/pause.test.mjs "unscoped names pass".
- [ ] The hook lets everything through when no run is paused. Proof: tests/pause.test.mjs "nothing paused".
- [ ] The hook exits 0 on stdin it cannot parse. Proof: tests/pause.test.mjs "bad input passes".
- [ ] The hook message carries no control characters, even from a hand-edited PAUSE file. Proof: tests/pause.test.mjs, where a PAUSE written with `\u001b[31m` and a newline gives a one-line message.
- [ ] hooks.json registers the hook on `Agent|Task`. Proof: tests/pause.test.mjs reads hooks/hooks.json and finds the matcher and the script path; `npm run validate` prints `plugin ok`.

## Tests (red first)
New `tests/pause.test.mjs`. Repositories come from `tempRepo()`, removed in `after()`. Hook cases spawn the script with JSON on stdin, through `spawnSync(process.execPath, ...)` with `input`. Each case goes red first.

## Touches
scripts/{pause.mjs}, tests/pause.test.mjs, hooks/hooks.json

## Out of scope
The conductor, skill and cockpit prose that runs the script (15, 16, 17). Status display (03).
