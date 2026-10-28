# 20: Copilots in the conductor and the copilot procedure

Security: no
Graph: conductor.md, 1. Preflight, 2. Run the frontier, Ledger and lessons, The scripts
Spec: 3.9.6, 3.9.7, 3.9.8, 3.9.9, 3.4.3
Decisions: D8, D15, D19, D27, D32, D35, D36

## Goal
A lead conductor with a large plan of independent parts splits it among copilots, each a conductor with its own ledger and branch, inside the host's lane budget. `/autopilot:copilot` shows the split.

Precondition (D15, D32, D36): this task starts only when line 1 of `docs/spikes/nested-dispatch.md` is `RESULT: PASS`. The main-session conductor of this build writes that file in its pre-wave-1 spike step (plan.md Constraints); no task writes it. On `RESULT: FAIL`, or with no file, this task does not start: the build stops before task 20 and asks the user (D15). No other task depends on the spike.

## Interfaces
Provides a new `## Copilots` section in agents/conductor.md, placed after Preflight:
- **Lead**, when the dispatch carries no `COPILOT:` field: after Preflight and the graph refresh, run `node "<scripts>/host-load.mjs" <Lanes>`, then `node "<scripts>/{copilots.mjs}" PLAN <N> --ledger RUN/ledger.md`, and write `copilots: <its line>` to the ledger. With `copilots: 0`, build as before. With K of 2 or more:
  1. One runner creates `autopilot/<slug>-c<N>` from TIP for each crew.
  2. Dispatch every copilot in one message, each a conductor (scoped name) whose prompt carries PLAN, the repository root, `COPILOT: c<N>`, `TASKS: <ids>`, `LANES: <L>`, `BRANCH: autopilot/<slug>-c<N>` and `RUN: <repo root>/.autopilot/runs/<PLAN directory name>-c<N>/`.
  3. Re-dispatch, again in one message, every copilot that returns `CHECKPOINT:`.
  4. A copilot that fails to dispatch, or returns without a verdict: rule that the lead takes its unintegrated tasks back, and build them in the frontier.
  5. When all copilots have returned `OUTCOME: copilot c<N> done`, `PAUSED:` or `STOP:`, one runner merges the copilot branches in order c1, c2, ... into the integration branch with `--no-ff` and runs Gate. Ledger `copilot cN: merged @ <sha7>`. A conflict goes to coder, as in step 2.4.
  6. Then Verify and Finish as usual. Any copilot's PAUSED or STOP pauses or stops the lead the same way.
  The lead decides once. On resume, when `copilots:` is already in the ledger, it re-dispatches only the copilots whose ledgers show no `OUTCOME`.
- **Copilot**, when the dispatch carries `COPILOT: c<N>`: build only TASKS, on BRANCH, with lane branches `autopilot-lane/<slug>-c<N>/NN`; at every wave run host-load with LANES; never run the copilots script except with `--copilot`, and never dispatch a conductor; skip Push early, Verify and Finish; end with `OUTCOME: copilot c<N> done` and the integrated ids. The copilot's ledger first line is `# autopilot ledger: <PLAN>`, then `copilot: c<N> tasks <ids> branch <BRANCH>`.
- `## The scripts` gains the copilots script line, and `## Ledger and lessons` gains `copilots: <line>` and `copilot cN: dispatched | returned <verdict> | merged @ <sha7>`.

Provides `skills/cockpit/COPILOT.md` (read raw):
1. PLAN = `$ARGUMENTS`, or the newest approved plan.
2. Run `node "<scripts>/host-load.mjs" <plan Lanes>` and `node "<scripts>/{copilots.mjs}" PLAN <N> --ledger <repo>/.autopilot/runs/<plan>/ledger.md`, and relay both in the voice.
3. For each `<repo>/.autopilot/runs/<plan>-c<N>/ledger.md`, run `node "<scripts>/status.mjs" <that ledger>` and list it.
4. It spawns nothing: copilots are the lead conductor's to dispatch (D15).

Consumes: copilots script (07); host-load line (04); the conductor after 16; the spike result (the main-session conductor's pre-wave-1 step, D36); status (03).

## Acceptance criteria
- [ ] The lead runs host-load and then the copilots script after Preflight. Proof: tests/copilot-doc.test.mjs "lead sizing order".
- [ ] With K of 2 or more, the lead dispatches all copilots in one message, with the six dispatch fields. Proof: tests/copilot-doc.test.mjs "dispatch fields".
- [ ] The lead re-dispatches copilots that return CHECKPOINT. Proof: tests/copilot-doc.test.mjs "checkpoint".
- [ ] A failed copilot's tasks go back to the lead as a ruling. Proof: tests/copilot-doc.test.mjs "take back".
- [ ] Copilot branches are merged in order before Verify. Proof: tests/copilot-doc.test.mjs "merge before verify" (positions).
- [ ] A copilot runs the copilots script only with `--copilot`. Proof: tests/copilot-doc.test.mjs "no recursion".
- [ ] A copilot never dispatches a conductor. Proof: tests/copilot-doc.test.mjs "no nested conductor".
- [ ] A copilot skips Push early, Verify and Finish. Proof: tests/copilot-doc.test.mjs "copilot scope".
- [ ] A copilot uses lane branches `autopilot-lane/<slug>-c<N>/NN`. Proof: tests/copilot-doc.test.mjs "lane names".
- [ ] A copilot re-asks host-load with its LANES each wave. Proof: tests/copilot-doc.test.mjs "share".
- [ ] The lead decides on copilots once per run. Proof: tests/copilot-doc.test.mjs "decide once".
- [ ] On resume, the lead re-dispatches only copilots whose ledgers show no OUTCOME. Proof: tests/copilot-doc.test.mjs "resume".
- [ ] The example copilot ledger first line parses with status.mjs `parseLedger` to the same plan as the lead's. Proof: tests/copilot-doc.test.mjs "ledger header".
- [ ] COPILOT.md shows the sizing from host-load and the copilots script. Proof: tests/copilot-doc.test.mjs "procedure sizing".
- [ ] COPILOT.md lists each copilot ledger's status line. Proof: tests/copilot-doc.test.mjs "procedure status".
- [ ] COPILOT.md spawns nothing. Proof: tests/copilot-doc.test.mjs "spawns nothing".
- [ ] The nested-dispatch spike passed before this task began. Proof: `node -e "console.log(require('fs').readFileSync('docs/spikes/nested-dispatch.md','utf8').split(/\r?\n/)[0])"` prints `RESULT: PASS`.
- [ ] The spike file carries no old name. Proof: `git grep -c -e autopilot-forge -e claude-code-forge -- docs/spikes` prints nothing.
- [ ] Every script named exists. Proof: `npm run validate` prints `plugin ok`.

## Tests (red first)
New `tests/copilot-doc.test.mjs`. It reads agents/conductor.md and skills/cockpit/COPILOT.md, and imports `parseLedger` from scripts/status.mjs. Each assertion goes red first.

## Touches
agents/conductor.md, skills/cockpit/COPILOT.md, tests/copilot-doc.test.mjs

## Out of scope
The sizing math (07). Running the nested-dispatch spike (a main-session conductor step, D36).
