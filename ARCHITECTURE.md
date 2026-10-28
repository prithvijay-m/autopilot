# Architecture

How the pieces fit, and the rules that keep them from breaking.

```
 you ── /autopilot ──► main session (routes, interviews)
                          │  blueprint steps 1-5
                          ▼
                       planner (Opus)  ── spec.md, plan.md, tasks/
                          │  you approve
                          ▼
                       lead conductor (Sonnet) ── ledger.md ──► CHECKPOINT ─┐
                          │ a large plan splits                          │ fresh conductor
                ┌─────────┴─────────┐                                    │ resumes from the
                ▼                   ▼                                    │ ledger
          copilot conductor   copilot conductor  (own ledger, own branch)│
                │ waves of lanes    │                                    │
          ┌─────┼─────┐       ┌─────┼─────┐                              │
          ▼     ▼     ▼       ▼     ▼     ▼                              │
        coder / ux / db  (one worktree each)  ◄──────────────────────────┘
          │
          ▼  runner (merge, gate)  ·  reviewer  ·  senior (escalation)
          ▼
        branch or pull request
```

## Who does what

- **Main session**: finds the phase, interviews, relays. It dispatches the planner and the conductor and nothing else.
- **Conductor**: dispatches, reads reports, rules, keeps the ledger. It runs no builds itself. Its memory is `.autopilot/runs/<plan>/ledger.md`, not its context.
- **Copilot**: a conductor that owns some tasks of a large plan, with its own ledger (`.autopilot/runs/<plan>-c<N>/`) and branch. The lead conductor decides the split once, dispatches the copilots, and merges their branches. It needs a conductor to dispatch conductors (`docs/spikes/nested-dispatch.md`).
- **Cockpit** (`skills/cockpit/`): the procedures behind the commands that talk to a run: intervention, preview, copilot status, scout and improve. They run in the main session and change a run only through the pause script and the ledger.
- **Scout**: an agent that looks up notable new releases for one tool or stack tag. It reads the web and returns a table; it installs nothing.
- **Implementers** (`coder`, `ux`, `db`): one task each, test first, in their own worktree.
- **Reviewer, runner, senior**: independent reads, command sequences, and the Opus escalation.
- **Scripts** (`scripts/`): everything deterministic — guard, graph cards, TDD check, leftover scan, lessons, host load, copilot split, pause, status, retro, improve. They cost no model tokens.

## Rules that matter

1. **Agents are dispatched by scoped name**, `autopilot:coder`, so a user's own `coder` cannot shadow them.
2. **Lane branches are `autopilot-lane/<slug>/NN`.** The integration branch is `autopilot/<slug>`, and git refuses a ref that is also a directory, so a lane under `autopilot/<slug>/` could never be created.
3. **`${CLAUDE_PLUGIN_ROOT}` is replaced only in agent and skill bodies and in hook config.** A file opened with the Read tool shows it literally. So files the pipeline reads raw (`PLAN-FORMAT.md`, `GRAPH.md`) say `<scripts>`, and the entry skill states the real root. `npm run validate` enforces this.
4. **The ledger is the source of truth.** A conductor that restarts, whether after a crash or a checkpoint, trusts the ledger and `git log` over memory. A checkpoint after every third wave keeps one conductor's context from rotting.
5. **Rulings, not stalls.** Four things stop a run (failed preflight, an irreversible action, a missing credential, a plan so broken every path is a guess). Everything else is a ruling written to the ledger with what it costs if wrong.
6. **The guard is advisory.** It stops accidents, not a determined agent. Safety comes from the branch model (nothing lands on a protected branch without a pull request) as much as from the guard.
7. **Commands are thin.** Each `commands/<name>.md` hands `$ARGUMENTS` to one target, routes by scoped name (`autopilot:cockpit`, `autopilot:runner`), and never uses `${CLAUDE_PLUGIN_ROOT}`: whether a command body gets it substituted is unverified, so the skill or agent it routes to states the root.
8. **The PAUSE flag stops crew dispatches at the next boundary.** While `.autopilot/runs/<plan>/PAUSE` exists, a hook on `Agent|Task` refuses the build crew and passes every other agent, so the session can still answer you. Only `/autopilot:resume` clears it.

## State on disk

The plugin writes only under `.autopilot/runs/` in your repository, and never touches other files in `.autopilot/`.

| Path | What | Lives |
|---|---|---|
| `docs/plans/<plan>/` | spec, plan, tasks, preview | committed |
| `.autopilot/runs/<plan>/` | ledger, graph cards, reports, `clock.json`, `missions.json`, `PAUSE` | git-ignored, per repository |
| `.autopilot/runs/<plan>-c<N>/` | the same for copilot N of a plan | git-ignored |
| `.autopilot/runs/LESSONS.md` | lessons that apply here, rendered | git-ignored |
| `docs/improvements/` | retro proposals for `/autopilot:improve` | yours to commit or drop |
| `~/.claude/autopilot/lessons.json` | the cross-project lessons store | per machine |
| `~/.claude/autopilot/guard.json`, `<repo>/.autopilot/guard.json` | guard allowances and scope (read, never written) | yours |
