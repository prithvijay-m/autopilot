# 16: Conductor: runs path, interventions, ACCEPTANCE, summaries, retro

Security: no
Graph: conductor.md, Ledger and lessons, The scripts, 2. Run the frontier, 3. Verify the whole, 4. Finish, Stops
Spec: 3.2.1, 3.2.2, 3.4.4, 3.6.8, 3.7.5, 3.8.3, 3.8.4, 3.11.4
Decisions: D6, D10, D16, D17, D18, D22, D23, D25, D26, D28, D30

## Goal
The conductor uses the new run state, catches and fixes troubled agents with the detectors, pauses when a fix does not hold, writes a summary per integrated task, checks the user's demands before the PR, and turns repeated problems into an improvement proposal.

## Interfaces
Provides, as edits to agents/conductor.md:
- `## Ledger and lessons`: RUN is `<repo root>/.autopilot/runs/<PLAN directory name>/`, and LESSONS is `<repo root>/.autopilot/runs/LESSONS.md`. The ledger block gains these lines, in this exact form:
  - `summary NN: <b1> | <b2> | <b3>`
  - `intervene: task NN <signal> -> <remedy>`
  - `paused: <reason>`
  - `acceptance: <verdict line>`
  - `user: <instruction>`
  A `user:` line, written by `/autopilot:intervention`, is an instruction from the user, and a resuming conductor honours it as a ruling.
- `## The scripts` gains:
  - Detect: `node "<scripts>/{detect.mjs}" start RUN <NN>` before each task's dispatch, and `node "<scripts>/{detect.mjs}" check RUN <NN> --report <report file> --task <task file>` after each report. Write the plain path in the agent file; it exists by then.
  - Pause: `node "<scripts>/{pause.mjs}" set <PLAN directory name> "<reason>"`.
  - Retro: `node "<scripts>/{retro.mjs}" RUN`.
- `## 2. Run the frontier`, step 3 (Read the reports): run detect `check` for each report, and act on each line:
  - `reset`: dispatch again with only the task file and its card, no earlier output.
  - `split`: rule the task into two halves by criteria, with a ruling.
  - `findings`: dispatch again with the unresolved citations as findings.
  - `senior`: dispatch senior.
  - `context`: dispatch again with the missing paths and the card added.
  Log each remedy as `intervene: ...`. A `PAUSE` line, or a dispatch the pause hook refused, means: run pause `set`, write `paused: <reason>`, and end the turn with `PAUSED: <reason>` and the ledger path.
- Step 4 (Integrate): after each `task NN: integrated` line, write `summary NN:` with 1 to 3 plain bullets of at most 100 characters each, taken from the builder's report.
- `## 3. Verify the whole`: a new step after QA and before Security. When `PLAN/request.md` exists, one reviewer ACCEPTANCE dispatch (request.md, decisions.md, BASE, tip); PARTIAL and NOT MET items join the fix-once dispatch, and one ACCEPTANCE re-check covers those items after it; ledger `acceptance:`. With no request.md, a ruling skips it.
- `## 4. Finish`: the PR body and the final message gain **Not done** (still-unmet items). After the lessons step, run retro. When it prints a proposal path, dispatch senior to write the `## Patch` diff against `${CLAUDE_PLUGIN_ROOT}` (paths relative to the plugin root, the proposal left uncommitted), and name the path and `/autopilot:improve` in the final message.
- `## Stops`: PAUSED is a way a turn ends besides the four Stops. It is not a Stop, and it resumes from the ledger.

Consumes: status `summary` parsing (03); detect (05); pause (06); retro (08); lessons path (10); reviewer ACCEPTANCE (11); scoped names (02).

## Acceptance criteria
- [ ] RUN and LESSONS are under `.autopilot/runs/`. Proof: tests/conductor.test.mjs "runs path".
- [ ] No 0.2.x run path remains. Proof: same test, negative assertion on `.autopilot/<PLAN directory name>/`.
- [ ] The ledger example's `summary` line parses into bullets with status.mjs `missions()`. Proof: tests/conductor.test.mjs "summary line parses" (extracts the line from the ledger code block).
- [ ] The ledger example's `intervene:` line is recognised by detect `decide()` as an earlier intervention. Proof: tests/conductor.test.mjs "intervene line parses".
- [ ] detect start and check are run around every dispatch. Proof: tests/conductor.test.mjs "detectors wired" finds both commands in section 2.
- [ ] Each of the five remedies has its action. Proof: tests/conductor.test.mjs "remedy table".
- [ ] A PAUSE line or a refused dispatch ends the turn with `PAUSED:`. Proof: tests/conductor.test.mjs "pause path".
- [ ] ACCEPTANCE runs after QA and before Security. Proof: tests/conductor.test.mjs "acceptance order" compares the positions of the three steps.
- [ ] Unmet items go to Not done in the PR body and the final message. Proof: tests/conductor.test.mjs "not done".
- [ ] A missing request.md skips ACCEPTANCE with a ruling. Proof: same file, "no request".
- [ ] Retro runs at Finish, after the push. Proof: tests/conductor.test.mjs "retro".
- [ ] A proposal path from retro sends senior to fill its Patch. Proof: tests/conductor.test.mjs "retro patch".
- [ ] `user:` lines are honoured on resume. Proof: tests/conductor.test.mjs "user lines".
- [ ] Every script named exists. Proof: `npm run validate` prints `plugin ok`.

## Tests (red first)
New `tests/conductor.test.mjs`. It reads agents/conductor.md, and imports `missions` from scripts/status.mjs and `decide` from the detect script. Each assertion goes red first.

## Touches
agents/conductor.md, tests/conductor.test.mjs

## Out of scope
Copilots (20). The cockpit procedures (17).
