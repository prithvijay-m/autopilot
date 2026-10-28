# Changelog

## 0.3.0

A build started on 0.2.x keeps its ledger at the old path: finish it on 0.2.x.

**Rename and install**
- The plugin and repository are now named `autopilot` (they were `autopilot-forge` and `claude-code-forge`). Install with `/plugin marketplace add prithvijay-m/autopilot` and `/plugin install autopilot@autopilot`. Agents are dispatched as `autopilot:<agent>`. There is no alias for the old name.
- Run state moved to `.autopilot/runs/<plan>/`, and the rendered lessons to `.autopilot/runs/LESSONS.md`. The plugin writes nowhere else under `.autopilot/`, so a same-named local pipeline is left alone. `lessons.mjs sync` no longer imports a hand-kept `.autopilot/LESSONS.md` (`lessons.mjs import <file>` still does).

**Commands**
- Fifteen `/autopilot:` commands: blueprint, build, intervention, resume, merge, test, deploy, verify, status, agent, preview, scout, improve, recon, copilot. Twelve are thin files in `commands/`; blueprint, recon and verify are the skills. A new `cockpit` skill holds the procedures behind intervention, preview, copilot, scout and improve.
- A plan's Contract may name a `Deploy` command; `/autopilot:deploy` runs it only then.

**Voice and status**
- Messages you read are in a short pilot voice (`skills/autopilot/VOICE.md`); briefs, code, commits and ledger lines stay plain. Checkpoints and outcomes carry a pinned mission line, `Mission <n> of <m> tasks completed.`, with up to three bullets.

**Host sizing**
- `host-load.mjs` counts the limits of a cgroup v2 container and reserves memory; the conductor sizes each wave to it.

**Interventions and pause**
- `/autopilot:intervention` holds a run and records your instruction in the ledger. A `PAUSE` file under `.autopilot/runs/<plan>/` (managed by `scripts/pause.mjs`) makes a PreToolUse hook on `Agent|Task` refuse the build crew at the next boundary; the conductor also sets it when a task is stuck again after an intervention. `/autopilot:resume` clears it. The session-start hint names a paused run.

**Acceptance**
- When a plan has a `request.md`, the final review includes an ACCEPTANCE check of the user's demands against the built branch; partial and unmet items join the single fix pass.

**Copilots**
- A large plan of independent parts is split among copilot conductors, each with its own ledger (`.autopilot/runs/<plan>-c<N>/`) and branch (`scripts/copilots.mjs`). They depend on a conductor being able to dispatch conductors, which worked on Claude Code 2.1.312 (`docs/spikes/nested-dispatch.md`). `/autopilot:copilot` shows the split.

**Preview**
- The planner writes a clickable `preview/index.html`; `/autopilot:preview` publishes it and revises it until you give the green light, before the build starts.

**Retro and improve**
- `scripts/retro.mjs` writes a proposal to `docs/improvements/` when the same problem repeated in a run, and a senior agent drafts the patch. `/autopilot:improve` checks and applies it only after your explicit yes (`scripts/improve.mjs` validates every path first).

**Scout**
- New `scout` agent and `/autopilot:scout`: lists notable releases for your stack, each with its upstream link and upgrade command as a claim to verify. It alerts only and never installs.

**Validate**
- `tools/validate.mjs` rejects the old plugin and repository names everywhere except this changelog, and checks that scoped names in prose name a real agent or skill.

## 0.2.2

**Token savings** (details and measurements in `docs/token-usage.md`)
- `scripts/spend.mjs`: where the tokens went, by day, agent type and cache miss, read from your own transcripts.
- `scripts/read-guard.mjs`, registered as a `Read` hook: blocks the 13th image in one transcript and says how to tile the rest into a contact sheet.
- `scripts/recon.mjs`: runs `/recon` with the rea MCP server loaded for that session only.
- `coder` has a `tools:` allowlist (first-turn context 44.9k to 34.7k).

## 0.2.1

- auto-trigger can route to another skill (`AUTOPILOT_SKILL` or `~/.claude/autopilot-auto.skill`); the hook tests no longer read the host's own off file.

## 0.2.0

**Fixes that stopped the plugin from installing or working as written**
- Renamed the plugin to `autopilot-forge`: names that start with `claude-` are reserved, so `claude plugin validate` rejected 0.1.0. Install with `/plugin install autopilot-forge@autopilot-forge`.
- Removed the manifest's `hooks` key: `hooks/hooks.json` loads by itself, and naming it again loads it twice.
- Lane branches are now `autopilot-lane/<slug>/NN`. `autopilot/<slug>/NN` could not exist beside the integration branch `autopilot/<slug>`, so every parallel wave would have failed at its first branch.
- Agents are dispatched by scoped name (`autopilot-forge:coder`), so a user's own agent of the same name cannot take their place.
- Files the pipeline reads with the Read tool no longer carry a `${CLAUDE_PLUGIN_ROOT}` that is never substituted; the entry skill states the root.
- `/recon` pins `rea-agents` to the same version as `rea-mcp`, instead of `@latest`.
- `lessons.mjs` no longer overwrites a hand-kept global `LESSONS.md`; its readable copy is `lessons-all.md`.

**Guard**
- Every block has a rule id. A rules file (`.autopilot/guard.json`, `~/.claude/autopilot/guard.json`) can set `scope` (`always` or `runs`) and `allow` entries (`rule` or `rule:glob`).
- Text in a heredoc is no longer scanned as commands (a commit message that quotes `git push --force` was blocked), unless it feeds a shell or interpreter (`bash <<EOF`, `... | sh`), and `eval` is followed.
- Shell keywords (`then`, `do`, `while`) and wrappers with options (`sudo -u`, `env -i`, `timeout 10`, `nice`, `xargs`, `watch`, `script -c`) no longer hide the command behind them; a backslash-newline joins lines; git's abbreviated long options (`--no-verif`) and `branch -df` are caught; `git push --all` counts as a push to every protected branch; `gh` flags that take values (`-R o/r`) and `gh api -XDELETE` are read correctly; `rm -rf "$PWD"`, `./..` and the repository's own path are blocked.
- Worktrees under `.claude/worktrees/` (where agent isolation puts them) can be force-removed.
- The pipeline's own lane branches and lane worktrees can be force-removed.

**Scripts**
- `tdd-check` restores the tree on SIGINT, SIGTERM and SIGHUP and leaves a marker so a SIGKILLed run is repaired by the next one; a test command that cannot run, or a suite already red at HEAD, is INCONCLUSIVE instead of PASS.
- `scan-diff` judges a placeholder word only inside the matched value, so a real key on a line with `${...}` or "example" is found; env files added empty or by rename are found; paths with non-ASCII names are scanned.
- `lessons` refuses to write over a `lessons.json` it cannot parse (a copy is kept), and keeps a hand-kept `LESSONS.md` as `LESSONS.hand.md` before replacing it. `rea-mcp` keeps the config's permissions and follows a symlink.

**New**
- `host-load.mjs`: the conductor sizes each wave to what the machine can carry.
- `status.mjs`: one line of progress from the ledger, and a SessionStart hint when a build is unfinished.
- Conductor checkpoints after every third wave and is resumed fresh, so a long build does not rot one context.
- Early draft pull request after the first green wave, so CI runs throughout.
- Per-task `Security: yes` adds a security review to the wave that holds it.
- Planner rules for fast builds: ~45-minute tasks, a wide graph of five waves or fewer, disjoint `Touches`; security criteria written as criteria.
- Standards seed: replay-window, idempotency-release and untracked-package lines.
- `tdd-check` reports `WEAK PASS` when the tests failed only because a new file they import was gone.
- `lessons import` and an automatic one-time import of a hand-kept `.autopilot/LESSONS.md`.

**Project**
- `package.json`, `node:test` suites for every script (previously two), `tools/validate.mjs`, GitHub Actions on Linux, macOS and Windows.
- README, ARCHITECTURE, SECURITY and CONTRIBUTING.

## 0.1.0

First release.
