# 08: Retro: repeated problems to a proposal file

Security: no
Graph: none (new script). It imports `load()`, `applicable()`, `detectStack()` and `projectRoot()` from scripts/lessons.mjs.
Spec: 3.11.1, 3.11.2, 3.11.3
Decisions: D6, D28

## Goal
At the end of a run, find the problems that repeated and write them, with their evidence, into a proposal file that a senior agent turns into a patch and the user applies with `/autopilot:improve`. New file `scripts/{retro.mjs}`.

## Interfaces
Provides:
- CLI `retro.mjs <RUN> [--out <repo root>] [--date YYYY-MM-DD]`. It prints `retro: none`, or `retro: <n> repeated problems -> <proposal path>`, or `retro: no ledger at <path>`, and always exits 0. `--out` defaults to `projectRoot()` and `--date` to today (UTC).
- `export function problems({ ledger, lessons })` returns `[{ kind, evidence }]`. `lessons` is the applicable lesson list. The kinds:
  - `lesson`: a lesson with `count >= 2`; the evidence is its text.
  - `intervened`: a task with 2 or more `intervene: task NN` lines; the evidence is those lines.
  - `escalated`: a line matching `fix round 3/3`.
  - `parked`: a `task NN: parked` line.
- `export function proposal({ plan, run, date, problems })` returns the markdown:
  ````
  # Improvement: <plan slug>
  Status: proposed
  Run: <RUN path, forward slashes>
  Date: <date>

  ## Problem
  - <kind>: <one-line summary>

  ## Evidence
  - `<ledger line or lesson text, cut at 200 chars>`

  ## Patch
  ```diff
  ```
  ````
  The plan slug is the plan directory name (from the ledger's first line) without its leading `YYYY-MM-DD-`.
- `export function proposalPath(root, date, slug)` returns `<root>/docs/improvements/<date>-<slug>.md`, or `-2`, `-3` and so on before `.md` when that file exists.

Consumes: `load()`, `applicable(store, project, stack)`, `detectStack(root)` and `projectRoot()` from scripts/lessons.mjs, with the store at `AUTOPILOT_HOME`.

## Acceptance criteria
- [ ] An applicable lesson seen twice is a problem. Proof: tests/retro.test.mjs "repeated lesson".
- [ ] A lesson seen once is not a problem. Proof: same test, second assertion.
- [ ] A task with two `intervene:` lines is a problem. Proof: tests/retro.test.mjs "intervened twice".
- [ ] A task with one `intervene:` line is not a problem. Proof: same test, second assertion.
- [ ] A `fix round 3/3` line is an escalation problem. Proof: tests/retro.test.mjs "escalation".
- [ ] A parked task is a problem. Proof: tests/retro.test.mjs "parked".
- [ ] No problems prints `retro: none` and writes no file. Proof: tests/retro.test.mjs CLI case, where docs/improvements does not exist afterwards.
- [ ] With problems, the proposal is written with `Status: proposed`, the four sections and an empty diff fence. Proof: tests/retro.test.mjs CLI case (`--date 2026-10-28`, `--out` a `tempRepo()`).
- [ ] An existing proposal is never overwritten; the new file gets `-2`. Proof: tests/retro.test.mjs "no overwrite".
- [ ] Evidence lines quote the ledger verbatim, cut at 200 characters. Proof: tests/retro.test.mjs "evidence verbatim".
- [ ] A missing RUN prints `retro: no ledger at ...` and exits 0. Proof: tests/retro.test.mjs CLI case.

## Tests (red first)
New `tests/retro.test.mjs`. `AUTOPILOT_HOME` and `HOME` point to a `tempDir()`, and every scratch dir is removed in `after()`. Each case goes red first.

## Touches
scripts/{retro.mjs}, tests/retro.test.mjs

## Out of scope
Writing the patch (the senior agent, 16). Applying it (09, 17).
