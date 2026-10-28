# 03: Status: runs path, mission lines, pause display, voice file

Security: no
Graph: parseLedger(), readStatus(), ledgerPaths(), oneLine(), main()
Spec: 3.2.1, 3.2.4, 3.4, 3.7.9
Decisions: D4, D16, D18, D22, D23, D26, D35

## Goal
`status.mjs` reads runs from `.autopilot/runs/`, counts copilot ledgers with their plan, shows a paused run, and prints the pinned mission lines. `skills/autopilot/VOICE.md` defines the pilot voice and pins the same line.

## Interfaces
Provides (in `scripts/status.mjs`):
- `export const MISSION = (n, m) => \`Mission ${n} of ${m} tasks completed.\``
- `export function missions(ledgers, planText, reported = [])`. `ledgers` is `[{ name, text }]`, ordered lead first, then `<plan>-c1`, `<plan>-c2` and so on. It returns `[{ task, n, m, bullets }]` for every task with an `integrated` line in any ledger. Tasks in `reported` keep n = their index + 1. New tasks follow in ledger order. m = the task rows in `planText`.
- Bullets come from the last `summary NN: <b1> | <b2> | <b3>` line (regex `^summary (\d+):\s*(.+)$`, split on ` | `, trimmed, at most 3, each cut to 100 characters). With no summary line, the one bullet is the task's title (the plan row's Task cell).
- `export function renderMission(m)` returns the MISSION line, then each bullet as `- <text>` on its own line.
- `ledgerPaths(root)` lists `<root>/.autopilot/runs/*/ledger.md`, newest first, and leaves out directories ending in `-c<digits>`.
- `readStatus(ledger)` also returns `paused` (the first line of `<run dir>/PAUSE`, or null). `integrated` counts a task integrated in the lead ledger or any `<plan>-c<N>` ledger beside it.
- CLI: `status.mjs [plan dir | ledger.md] [--json] [--hook] [--missions [--new]]`. A bare plan name resolves to `.autopilot/runs/<name>/ledger.md`. `--missions` prints every mission block, separated by blank lines. `--new` prints only tasks not in `<run dir>/missions.json` (`{ "reported": ["03", "01"] }`) and appends them there. With nothing new it prints nothing.
- The one-line status gains `paused: <reason>` after the wave part when paused.
- Hook text: an unfinished fresh build says `... Run /autopilot:resume to resume it ...`. A paused one says `[autopilot] The build <name> is paused: <reason>. Run /autopilot:resume to continue it.`

Provides `skills/autopilot/VOICE.md`, read raw (so no `${CLAUDE_PLUGIN_ROOT}`). It holds:
- who speaks: the captain of the flight, calm, terse;
- where the voice is used: status lines, checkpoints, interventions, final report;
- where it is never used: agent briefs, code, commits, PR bodies, ledger lines;
- the pinned line `Mission <n> of <m> tasks completed.` followed by 1 to 3 `- ` bullets;
- one example line each for build start, checkpoint, pause, resume, stop and final report.

Consumes: the `PAUSE` file written by task 06's pause script, at `<run dir>/PAUSE` (first line = reason).

## Acceptance criteria
- [ ] `MISSION(3, 9)` is exactly `Mission 3 of 9 tasks completed.`. Proof: tests/status.test.mjs "the mission line is pinned".
- [ ] An integrated task's bullets come from its summary line: at most 3, each at most 100 characters. Proof: tests/status.test.mjs "summary bullets are capped".
- [ ] A task with no summary line gets its plan title as its only bullet. Proof: tests/status.test.mjs "the title is the fallback bullet".
- [ ] Reported tasks keep their n, and new ones continue after the highest. Proof: tests/status.test.mjs "mission numbers never go back".
- [ ] A task integrated only in a `-c1` ledger counts as a mission, after the lead's new tasks. Proof: tests/status.test.mjs "copilot ledgers count".
- [ ] `--missions --new` prints only unreported tasks. Proof: tests/status.test.mjs CLI case, where the second call prints nothing.
- [ ] `--missions --new` records what it printed in missions.json. Proof: the same CLI case reads `reported` back.
- [ ] The CLI finds a ledger under `.autopilot/runs/<plan>/`. Proof: tests/status.test.mjs "runs path".
- [ ] The CLI ignores a ledger at the old `.autopilot/<plan>/ledger.md`. Proof: tests/status.test.mjs "old path ignored".
- [ ] The status line shows `paused: <reason>` when the run has a PAUSE file. Proof: tests/status.test.mjs "a paused run says so".
- [ ] The SessionStart hook for a paused fresh run names the reason and `/autopilot:resume`. Proof: tests/status.test.mjs hook case.
- [ ] The integrated count includes copilot ledgers. Proof: tests/status.test.mjs "status counts copilot ledgers".
- [ ] VOICE.md pins the same line as `MISSION`. Proof: tests/status.test.mjs "VOICE.md pins the mission line" checks that `MISSION(n, m)` with `<n>` and `<m>` appears in the file.
- [ ] VOICE.md lists the places the voice is never used. Proof: the same test finds "briefs", "commits", "PR bodies" and "ledger".

## Tests (red first)
All in `tests/status.test.mjs`. Move the existing fixtures from `.autopilot/demo` to `.autopilot/runs/demo`. Scratch comes from `tempRepo()`, cleaned in `after()`. Run each new case red, then implement.

## Touches
scripts/status.mjs, tests/status.test.mjs, skills/autopilot/VOICE.md

## Out of scope
The pause script (06). Relaying missions in the skill (15). Writing `summary` lines (16).
