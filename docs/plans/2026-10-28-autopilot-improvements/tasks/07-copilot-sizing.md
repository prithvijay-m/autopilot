# 07: Copilot sizing script

Security: no
Graph: none (new script)
Spec: 3.9.1, 3.9.2, 3.9.3, 3.9.4, 3.9.5
Decisions: D8, D15, D27

## Goal
A deterministic answer to "how many copilots, and which tasks each". It splits a plan's unfinished tasks into independent groups and sizes the crews to the host's lanes, with a backstop no conductor can talk its way past. New file `scripts/{copilots.mjs}`.

## Interfaces
Provides:
- CLI `copilots.mjs <plan dir> <host lanes> [--ledger <ledger.md>] [--copilot] [--json]`. It prints `copilots: K (host lanes H, L lanes each) c1: 03,05,07 | c2: 04,06,08`, or `copilots: 0 (<reason>)`, and always exits 0. The reasons:
  - `fewer than 2 independent groups of 3 or more tasks`
  - `a copilot never spawns copilots` (with `--copilot`)
  - `no plan.md at <path>`
- `export function parsePlan(text)` returns `[{ id, deps, touches }]` from the table whose header has `#`, `Blocked by` and `Touches`. deps is `[]` for `none`. touches is the comma-separated entries, each trimmed, with backticks and `{`/`}` removed and a trailing `/` dropped.
- `export function integrated(ledgerText)` returns the Set of ids with a `task NN: integrated` line.
- `export function overlaps(a, b)` is true when the entries are equal or one is a directory prefix of the other (`skills/cockpit` and `skills/cockpit/SCOUT.md`).
- `export function groups(tasks, done = new Set())` returns `string[][]`. Tasks in `done` are left out. Two tasks share a group when one blocks the other or their Touches overlap, transitively. Groups are sorted by their lowest id, and ids inside a group are sorted.
- `export function size({ groups, hostLanes, minTasks = 3 })` returns `{ copilots, crews, lanesEach }`. Q = the groups with at least minTasks tasks; K = min(Q.length, hostLanes). When K < 2 it returns `{ copilots: 0, crews: [], lanesEach: 0 }`. Otherwise every group (qualifying or not), largest first with ties going to the lowest id, goes into the crew with the fewest tasks so far (ties to the lower crew number). lanesEach = max(1, floor(hostLanes / K)).

Consumes: a plan.md in this plan's own table format; a ledger in the conductor's format.

## Acceptance criteria
- [ ] `parsePlan` reads ids, blockers and touches, with `none` giving no blockers. Proof: tests/copilots.test.mjs "parses the task graph".
- [ ] Brace and backtick decoration in Touches is ignored. Proof: tests/copilots.test.mjs, where a Touches cell of `` `lib/{x.js}` `` parses as the entry lib/x.js.
- [ ] Tasks with an equal Touches entry share a group. Proof: tests/copilots.test.mjs "shared file joins".
- [ ] A directory prefix counts as overlap. Proof: tests/copilots.test.mjs "prefix joins".
- [ ] A blocking edge joins groups transitively. Proof: tests/copilots.test.mjs "edges join".
- [ ] Integrated tasks are left out. Proof: tests/copilots.test.mjs "done tasks leave".
- [ ] K is the smaller of the qualifying groups and the host lanes. Proof: tests/copilots.test.mjs, where 3 qualifying groups and 2 host lanes give 2.
- [ ] Fewer than 2 qualifying groups means no copilots. Proof: tests/copilots.test.mjs "one group, no copilots".
- [ ] Every task lands in exactly one crew, small groups included. Proof: tests/copilots.test.mjs "crews cover every task".
- [ ] Lanes summed over crews never exceed the host lanes. Proof: tests/copilots.test.mjs checks `copilots * lanesEach <= hostLanes` across host lanes 2 to 9.
- [ ] `--copilot` prints the copilot-never-spawns line. Proof: tests/copilots.test.mjs CLI case.
- [ ] A missing plan prints `copilots: 0 (no plan.md at ...)` and exits 0. Proof: tests/copilots.test.mjs CLI case.
- [ ] `--json` prints `{ copilots, crews, lanesEach }`. Proof: tests/copilots.test.mjs "json".

## Tests (red first)
New `tests/copilots.test.mjs`. Plan text is written inline, and CLI cases write it into a `tempDir()` removed in `after()`. Each case goes red first.

## Touches
scripts/{copilots.mjs}, tests/copilots.test.mjs

## Out of scope
Dispatching copilots and merging their branches (20). Reading the host (04).
