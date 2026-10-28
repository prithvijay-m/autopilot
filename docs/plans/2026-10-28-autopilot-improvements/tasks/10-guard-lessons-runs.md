# 10: Guard and lessons write only under .autopilot/runs

Security: yes (the guard is a PreToolUse hook)
Graph: runActive(), loadRules(), main(), keepOutOfGit(), importLegacy()
Spec: 3.2.2, 3.2.3, 3.2.4
Decisions: D18, D23

## Goal
The plugin stops touching the local pipeline's files. The guard looks for this plugin's runs under `.autopilot/runs/`. Lessons render to `.autopilot/runs/LESSONS.md`, and a hand-kept `.autopilot/LESSONS.md` is left exactly as it is.

## Interfaces
Provides:
- `runActive(cwd)` in scripts/guard.mjs (signature unchanged). It scans `<dir>/.autopilot/runs/*/ledger.md` in place of `<dir>/.autopilot/*/ledger.md`. Its `state.json` check, its 48-hour staleness rule and `loadRules()` reading `.autopilot/guard.json` are unchanged.
- `lessons.mjs sync` writes `<project>/.autopilot/runs/LESSONS.md` (creating `runs/`) and prints that path in its line. It no longer reads, imports, copies or renames `<project>/.autopilot/LESSONS.md`. `lessons.mjs import <file>` is unchanged.
- The usage comment at the top of lessons.mjs names the new path.

Consumes: nothing.

## Acceptance criteria
- [ ] A fresh unfinished ledger at `.autopilot/runs/<plan>/ledger.md` makes `runActive` true. Proof: tests/guard.test.mjs, with the runActive case moved to `runs/`.
- [ ] A ledger only at the old `.autopilot/<plan>/ledger.md` path makes `runActive` false. Proof: tests/guard.test.mjs "old path is not a run".
- [ ] `finish:` and `STOP:` lines and the 48-hour staleness still end a run. Proof: the existing runActive assertions, moved to `runs/`.
- [ ] `sync` writes `.autopilot/runs/LESSONS.md`. Proof: tests/lessons.test.mjs CLI case, whose path assertion is updated.
- [ ] `sync` leaves a hand-kept `.autopilot/LESSONS.md` byte-for-byte unchanged. Proof: tests/lessons.test.mjs "hand-kept file is left alone".
- [ ] `sync` creates no `LESSONS.hand*.md` copy. Proof: tests/lessons.test.mjs "no hand copy".
- [ ] `sync` never creates `.autopilot/LESSONS.md`. Proof: same test, on a repository without one.
- [ ] `import <file>` still takes in a hand-kept file. Proof: tests/lessons.test.mjs, where the former sync-import cases now call `import`.
- [ ] `.autopilot/` stays out of `git status`. Proof: the existing porcelain assertion.

## Tests (red first)
Update `tests/guard.test.mjs` and `tests/lessons.test.mjs`. `AUTOPILOT_HOME` and `HOME` point to scratch from `tempDir()` or `tempRepo()`, removed in `after()`. Run the changed assertions red first.

## Touches
scripts/guard.mjs, scripts/lessons.mjs, tests/guard.test.mjs, tests/lessons.test.mjs

## Out of scope
status.mjs paths (03). Prose that names the LESSONS path (16, 18).
