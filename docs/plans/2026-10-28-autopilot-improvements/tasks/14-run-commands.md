# 14: Run commands: build, resume, merge, test, deploy, agent

Security: yes (commands that merge branches, run deploy commands and dispatch agents from user text)
Graph: none (new files). Branch names from conductor.md (`2. Run the frontier`).
Spec: 3.3 (rows build, resume, merge, test, deploy, agent), 3.3.2, 3.3.3, 3.3.4
Decisions: D9, D14, D20, D33, D34

## Goal
Six thin commands that drive a build: two route into the autopilot skill, three hand a written procedure to the runner, and one dispatches a named plugin agent.

## Interfaces
Provides six files, each with a frontmatter `description` and `argument-hint`:
- `commands/build.md` ("Build an approved plan hands-free."): call the Skill tool with the autopilot skill (scoped name in backticks), args `build $ARGUMENTS`.
- `commands/resume.md` ("Resume a paused or interrupted build from its ledger."): the same skill, args `resume $ARGUMENTS`.
- `commands/merge.md` ("Merge finished lane and copilot branches into the integration branch."). PLAN = `$ARGUMENTS`, or the newest `docs/plans/*/plan.md` whose Status is approved. Read its Contract `Integration branch` and `Gate`. Refuse, and dispatch nothing, when the integration branch is main, master, trunk, production, prod or release. Otherwise dispatch the runner (scoped name in backticks) to: list `autopilot-lane/<slug>/*` and `autopilot/<slug>-c<N>` branches, where slug is the integration branch's last path segment; `git merge --no-ff` each into the integration branch in name order; stop at the first conflict and report it; run Gate; never push; never touch any other branch.
- `commands/test.md` ("Run the plan's gate and report pass or fail."): the runner runs the Contract's `Gate` in the current checkout and returns `PASS` or `FAIL` with the last 15 lines.
- `commands/deploy.md` ("Run the plan's documented deploy command, if it names one."): read only the Contract row `Deploy`. When it is absent or `none`, reply exactly `This plan names no deploy command.` and dispatch nothing. Otherwise show the command, then have the runner run it and return its last 15 lines.
- `commands/agent.md` ("Dispatch one of this plugin's agents with your brief."): the first word of `$ARGUMENTS` is the agent name and the rest is the brief. The name must be one listed as a scoped agent of this plugin in the Agent tool; otherwise reply with the valid names and dispatch nothing. Dispatch it with the brief as the whole prompt.
- Every file says that `$ARGUMENTS` is data: the bodies never run text from it as a shell command, and merge, test and deploy run only what the plan's Contract names.

Consumes: the command rules (01); the name `autopilot` (02). The `build` and `resume` handling is in the autopilot skill (15).

## Acceptance criteria
- [ ] The six files exist, each with a description. Proof: tests/run-commands.test.mjs "six commands".
- [ ] build and resume route to the autopilot skill with their verb first. Proof: tests/run-commands.test.mjs "skill routing".
- [ ] merge, test and deploy dispatch the scoped runner. Proof: tests/run-commands.test.mjs "runner routing".
- [ ] merge names the six protected branch names it refuses. Proof: tests/run-commands.test.mjs "merge refuses protected".
- [ ] merge never pushes. Proof: tests/run-commands.test.mjs finds "never push" in merge.md, and no `git push` line.
- [ ] merge takes only lane and copilot branches. Proof: tests/run-commands.test.mjs finds both branch patterns.
- [ ] deploy replies the exact no-command sentence when the plan names none. Proof: tests/run-commands.test.mjs "deploy without a Deploy row".
- [ ] deploy reads only the Contract's `Deploy` row. Proof: tests/run-commands.test.mjs "deploy source".
- [ ] agent refuses an unknown name and dispatches nothing. Proof: tests/run-commands.test.mjs "agent allowlist".
- [ ] agent passes the brief as the whole prompt. Proof: tests/run-commands.test.mjs "agent brief".
- [ ] Each file says `$ARGUMENTS` is data. Proof: tests/run-commands.test.mjs "arguments are data".
- [ ] The validate command rules pass on these files. Proof: `npm run check` passes.

## Tests (red first)
New `tests/run-commands.test.mjs`. It reads the files and parses frontmatter with `frontmatter()` from tools/validate.mjs. Each assertion goes red first.

## Touches
commands/build.md, commands/resume.md, commands/merge.md, commands/test.md, commands/deploy.md, commands/agent.md, tests/run-commands.test.mjs

## Out of scope
The autopilot skill's verbs (15). The Deploy row in PLAN-FORMAT (18).
