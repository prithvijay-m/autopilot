# 05: Detectors: stall, hallucination, circular, missing context

Security: no
Graph: none (new script). It imports `similarity()` from scripts/lessons.mjs.
Spec: 3.6
Decisions: D10, D25

## Goal
A deterministic script the conductor runs around each dispatch. It names a stalled, hallucinating, looping or under-briefed agent, the remedy for it, and when a second trip must pause the run. New file `scripts/{detect.mjs}` (braces are this plan's convention; the real path has none).

## Interfaces
Provides:
- CLI `detect.mjs start <RUN> <NN>` writes `RUN/clock.json` (`{ "<NN>": "<ISO time>" }`, merged with what is there) and prints `clock: task NN started <ISO>`.
- CLI `detect.mjs check <RUN> <NN> [--report <file>] [--task <task file>] [--now <ISO>]` prints one line per tripped signal: `<signal> task NN: <evidence> -> <remedy>`. Otherwise it prints `clear task NN`, or the single line `PAUSE task NN: <signal> again after an intervention`. It always exits 0. A missing RUN, clock or report is not an error: that signal is simply not checked.
- `export function citations(text)` returns `{ paths, shas }`. Paths are backticked tokens that contain a `/` or end in `.<ext>`, with an optional `:<line>`. Shas are 7 to 40 hex characters after `@ ` or inside backticks.
- `export function signals({ ledger, task, report, elapsedMin, criteria, unresolved })` returns `[{ signal, evidence, remedy }]`:
  - `stall`: elapsedMin >= 90, or a report with none of DONE, DONE_WITH_CONCERNS, BLOCKED, READY, APPROVE, CHANGES, PASS, FAIL. The remedy is `split` when criteria >= 8, else `reset`.
  - `hallucination`: `unresolved` is not empty. The remedy is `findings`; the evidence lists the unresolved citations.
  - `circular`: two `task NN: blocked: <reason>` lines whose reasons have `similarity() >= 0.6`, or two consecutive `wave W: fix round R/3: <a>/<o> addressed` lines for the task's wave (from its `dispatched (wave W` line) where a does not rise. The remedy is `senior`.
  - `missing-context`: the latest blocked reason matches `/not found|missing|no such|cannot find|unknown|which file|where is/i`, or the report has two or more lines starting `UNKNOWN:`. The remedy is `context`.
- `export function decide({ ledger, task, found })` returns the output lines. When the ledger already has `intervene: task NN` and `found` is not empty, it returns the one PAUSE line.
- `export function unresolvedCitations(repo, sha, cites)` checks repo paths with `git cat-file -e <sha>:<path>` (or HEAD when there is no sha), and shas with `git cat-file -e <sha>^{commit}`. Paths under `.autopilot/` are checked on disk. URLs, `<placeholders>`, globs and absolute paths outside the repository are skipped. The sha comes from the report's `@ <sha>`, else the ledger's `task NN: done <branch> @ <sha>`.

Consumes: `similarity(a, b)` from scripts/lessons.mjs (exists).

## Acceptance criteria
- [ ] `start` records the dispatch time. Proof: tests/detect.test.mjs "start writes clock.json".
- [ ] A report 90 minutes after start is a stall with remedy reset. Proof: tests/detect.test.mjs "stall at 90 minutes".
- [ ] A report 89 minutes after start is no stall. Proof: same test, second assertion.
- [ ] A report with no verdict word is a stall. Proof: tests/detect.test.mjs "no verdict".
- [ ] A stalled task with 8 or more criteria gets remedy split. Proof: tests/detect.test.mjs "split big tasks".
- [ ] A cited path missing at the report's commit is a hallucination. Proof: tests/detect.test.mjs "missing path" (uses `tempRepo()`).
- [ ] A cited SHA that is not a commit is a hallucination. Proof: tests/detect.test.mjs "bogus sha".
- [ ] URLs, placeholders, globs and outside absolute paths are never counted. Proof: tests/detect.test.mjs "skipped citations".
- [ ] Two similar blocked reasons are circular, with remedy senior. Proof: tests/detect.test.mjs "blocked twice".
- [ ] Two fix rounds with no rise in addressed are circular. Proof: tests/detect.test.mjs "fix rounds stuck".
- [ ] A blocked reason saying something was not found is missing context. Proof: tests/detect.test.mjs "missing context cue".
- [ ] Two UNKNOWN lines in a report are missing context. Proof: tests/detect.test.mjs "unknowns".
- [ ] A second trip after an `intervene:` line prints only the PAUSE line. Proof: tests/detect.test.mjs "second trip pauses".
- [ ] No signal prints `clear task NN`. Proof: tests/detect.test.mjs "clear".
- [ ] The CLI exits 0 with a missing RUN. Proof: tests/detect.test.mjs CLI case, status 0.

## Tests (red first)
New `tests/detect.test.mjs`. Pure functions are tested with inline ledger text, and time comes only from `--now`. Git cases use `tempRepo()`; scratch is removed in `after()`. Each case goes red first.

## Touches
scripts/{detect.mjs}, tests/detect.test.mjs

## Out of scope
Applying remedies and writing ledger lines (16). Pausing (06).
