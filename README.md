# autopilot

The plugin is `autopilot`.

A [Claude Code](https://claude.com/claude-code) plugin with two tools, and fifteen `/autopilot:` commands that steer them (see [Commands](#commands)):

- **`/autopilot`** — a hands-free build pipeline. You answer an interview once; it plans, builds, tests, reviews, and opens a pull request using tiered subagents while you're away.
- **`/recon`** — a human-in-the-loop reverse-engineering skill built on [rea](https://github.com/morluto/rea), gated so nothing runs a target or touches config without your say-so.

Both share a safety guard, a code-graph layer that keeps context cheap, and a cross-project memory of what earlier runs learned.

> **Status:** v0.3. Every script has tests (`npm test`; CI is set up for Linux, macOS and Windows), and `npm run validate` plus `claude plugin validate . --strict` check the plugin's shape. Each agent and stage has been exercised in isolation on sample projects, and the pipeline's design has run real builds elsewhere, but the full chain in this plugin — a typed prompt carried all the way to a merged PR, and a live `/recon` against a real target — has **not** been run end to end. Treat it as a strong scaffold to try on low-stakes work first, not a proven autopilot.

## What's inside

| Component | What it does |
|---|---|
| `/autopilot` | Entry point. Finds the phase (plan vs build vs resume) and runs it end to end. |
| `/blueprint` | The planning interview: grills every decision out of you, then an Opus `planner` writes the spec, task graph and execution contract. |
| `/verify` | One-shot readiness check on a branch (gate + leftover scan + TDD check). |
| `/recon` | Reverse engineering with authorization and scope gates; dispatches evidence-first `analyst` subagents. |
| 11 agents | `conductor` (runs a build, and the copilots of a large one), `scout` (finds notable releases in your stack), `coder` / `ux` / `db` (implementers), `reviewer`, `runner`, `senior` (Opus escalation), `planner` (Opus), `analyst` + `senior-analyst` (RE, Sonnet + Opus escalation). |
| Scripts | `guard` (blocks destructive commands), `graph-refresh` / `graph-brief` (code graph), `tdd-check` (proves new tests fail without the change), `scan-diff` (secrets / debug leftovers), `lessons` (cross-project memory), `host-load` (how many lanes this machine can carry), `copilots` (how a plan splits across conductors), `pause` (holds a run), `retro` and `improve` (propose and apply fixes to the plugin itself), `status` (where a build stands, and a resume hint at session start), `auto-trigger` (routes build prompts into the pipeline), `rea-mcp` (toggle the RE engine). |

### How a build runs

1. **Plan (with you):** `/autopilot <what you want>` interviews you — scope, behaviour and its unhappy paths, data, UI, dependencies, test seams, and whether to stop at a PR or merge. Your answers are saved so an interrupted plan resumes.
2. **Build (you can leave):** a `conductor` works the task graph in waves. Independent tasks run in parallel, each in its own worktree. Every implementer gets a graph "card" of what depends on the code it touches and builds test-first; after each wave the full gate runs, a script confirms the new tests actually fail without the change, and a reviewer checks the callers the diff didn't touch. Up to three fix rounds, the third on Opus.
3. **Verify & ship:** leftover scan, optional browser QA, optional security review, a full code review with one fix pass, then a branch or PR. Everything decided in your absence — and what it costs if wrong — is in the final report.

### Model tiers

The session model only drives light orchestration; the work is pinned per agent, so you can run on Sonnet and let Opus kick in only where it's needed.

| Tier | Agents |
|---|---|
| Sonnet (medium) | coder, ux, db, reviewer, conductor, scout |
| Sonnet (low) | runner |
| Sonnet (high) | analyst |
| Opus (high) | planner, senior, senior-analyst — escalation and design only |

## Commands

Fifteen commands, all `/autopilot:<name>`. Twelve are files in `commands/`; `blueprint`, `recon` and `verify` are the skills of the same names. A command is a thin entry: it hands what you type after it to one skill or agent.

| Command | What it does |
|---|---|
| `/autopilot:blueprint` | Plan a build by interview: every decision settled, then the planner writes the spec, task graph and execution contract. |
| `/autopilot:build` | Build an approved plan hands-free. |
| `/autopilot:intervention` | Hold the current run: no new dispatches, and talk to it. |
| `/autopilot:resume` | Resume a paused or interrupted build from its ledger. |
| `/autopilot:merge` | Merge finished lane and copilot branches into the integration branch (never main). |
| `/autopilot:test` | Run the plan's gate and report pass or fail. |
| `/autopilot:deploy` | Run the plan's documented deploy command, if its contract names one; otherwise say there is none. |
| `/autopilot:verify` | Run the full gate and a leftover scan on the current branch, and print a one-screen readiness report. |
| `/autopilot:status` | Where the build stands: one status line and the mission log. |
| `/autopilot:agent` | Dispatch one of this plugin's agents with your brief. |
| `/autopilot:preview` | Open the plan's clickable preview and revise it until you give the green light. |
| `/autopilot:scout` | Scan for notable releases in this project's stack. Lists upgrades, installs nothing. |
| `/autopilot:improve` | Review and apply a self-improvement patch the retro proposed. |
| `/autopilot:recon` | Reverse-engineer a target with a human in the loop: authorization and scope first, evidence-first analysts. |
| `/autopilot:copilot` | Show how a plan splits across copilots on this machine, and how each copilot is doing. |

The bare `/autopilot` and `/blueprint` entry points still work as before.

### Name clash

If you keep your own skill named `autopilot`, it shadows nothing in the plugin: every agent, skill and command the plugin dispatches is called by its scoped name (`autopilot:coder`, `/autopilot:build`). The plugin also writes only under `.autopilot/runs/` and never touches other files in `.autopilot/`, so a committed `.autopilot/LESSONS.md` of your own stays yours. Build prompts are routed into a pipeline only when you opt in, and the override picks which skill the nudge names: set `AUTOPILOT_SKILL=<skill>` or put the skill name in `~/.claude/autopilot-auto.skill`.

### The pilot voice and mission lines

Messages you read (status lines, checkpoints, interventions, the final report) are short and in command, in the voice of [skills/autopilot/VOICE.md](skills/autopilot/VOICE.md). Agent briefs, code, commits, PR bodies and ledger lines stay plain. After a checkpoint or an outcome you get a mission line, worded exactly so, with one to three bullets of what changed:

```
Mission <n> of <m> tasks completed.
- <what changed>
```

`/autopilot:status` prints the same log.

### Pause and resume

`/autopilot:intervention <what you want>` holds the run: it writes a `PAUSE` file at `.autopilot/runs/<plan>/PAUSE` (first line, the reason), your words go into the ledger for the conductor to follow, and the session answers you. A hook on agent dispatches then refuses the build crew (conductor, coder, ux, db, reviewer, runner, senior) at the next boundary; agents already running finish their task. The conductor pauses the same way by itself when a task trips the same stuck signal again after it already intervened. The session-start hint names a paused run. Only `/autopilot:resume` clears the flag and picks up from the ledger.

### Copilots

A large plan of independent parts can be split among copilots: conductors that each own some tasks, a ledger (`.autopilot/runs/<plan>-c<N>/`) and a branch, inside the machine's lane budget. The lead conductor decides once, from `host-load` and `copilots`, and merges the copilot branches at the end. `/autopilot:copilot` shows the split and each copilot's progress; it starts nothing. Copilots need a conductor to be able to dispatch other conductors. That was checked on Claude Code 2.1.312 and it worked (see [docs/spikes/nested-dispatch.md](docs/spikes/nested-dispatch.md)); on a host where it does not, the plan builds with one conductor.

### The preview loop

The planner also writes a clickable preview, `<plan>/preview/index.html`. Before you approve a plan, `/autopilot:preview` publishes it (as a private Artifact where the tool exists, else it prints the path), you click through and say what to change, the planner revises it, and the loop repeats until you give the green light. The build never starts before that.

### Scout

`/autopilot:scout [tools]` reads your stack from the lessons store (or the tools you name) and has `scout` agents look up notable new releases. It prints a table with an upstream link and the command to upgrade, each marked as a claim to verify. It only alerts: it never installs, and never runs a command a scout found.

### Retro and improve

At the end of a run a retro script looks for problems that repeated in the ledger and the lessons. When one did, it writes a proposal to `docs/improvements/` and a senior agent drafts the patch against the plugin. Nothing is applied on its own: `/autopilot:improve` shows you the problem and the files, warns about any file that runs code or steers agents, and applies the patch only after your explicit yes.

### Where a run keeps its state

Under `.autopilot/runs/<plan>/` in your repository (ledger, graph cards, clock, mission log, `PAUSE`), and `.autopilot/runs/LESSONS.md` for the lessons that apply here. A build started on 0.2.x keeps its ledger at the old path: finish it on 0.2.x.

## Install

```
/plugin marketplace add prithvijay-m/autopilot
/plugin install autopilot@autopilot
```

Then set your session permission mode to **Auto** before approving a plan, so the build runs unattended.

### Prerequisites

- **Node.js 22.19+, 24.11+, or 26+** (the scripts and rea need it).
- **git**, and **gh** authenticated if you want `/autopilot` to open pull requests.
- Optional: **codex** (a second-model-family peer reviewer), **tmux** (terminal-app QA), a browser (web-app QA).

### Companion skills (not bundled)

The pipeline calls skills it does not ship. Install the ones you want; see [CREDITS.md](CREDITS.md) for who made them.

- Build reviews and TDD: a `supermatt`-style skill set (`qa`, `code-review`, `pr`, `tdd`, `resolving-merge-conflicts`, `dependency-vetting`).
- Cheaper context on existing codebases: **graphify** — `npm i -g graphifyy` (or `uv tool install graphifyy`).
- UI and charts: **refero-design**, **dataviz**.
- Reverse engineering: **rea** — `npx skills add morluto/rea --skill reverse-engineer-anything`, then `npx rea-agents setup` to register its MCP server, plus **Ghidra** for native binaries.

Where a companion is missing, the forge still runs the parts it can and reports the rest as blocked rather than faking it.

Spending fewer tokens (a transcript reader, an image guard, a per-session rea launcher): see [docs/token-usage.md](docs/token-usage.md).

## Usage

- **Build:** `/autopilot add a refunds feature to the billing module`, or approve a plan and run `/autopilot:build`
- **Plan now, build later:** `/blueprint ...`, then `/autopilot docs/plans/<dir>`
- **Skip the pipeline for a one-liner:** start the prompt with `quick:` — no interview, no subagents.
- **Route build prompts to a skill of your own:** set `AUTOPILOT_SKILL=autopilot` or put the skill name in `~/.claude/autopilot-auto.skill`. The clash note under [Commands](#name-clash) says why. Switch the routing off with `~/.claude/autopilot-auto.off` or `AUTOPILOT_AUTO=0`.
- **Check a branch:** `/verify`
- **Reverse engineer (human-gated):** `/recon <target>`. rea is opt-in to save tokens; enable it first:
  ```
  node "<plugin>/scripts/rea-mcp.mjs" enable   # then restart Claude Code
  ```

## Safety

- **The guard** (a PreToolUse hook) blocks force-pushes, pushes to protected branches, hook bypasses, history rewrites, force-deletes of branches and worktrees, and recursive deletes of a root, home, or `.git`. It is a tripwire, not a sandbox: see [SECURITY.md](SECURITY.md) for what it does not catch. Every block names its rule (`[force-push]`), and the agent is told to report a blocker rather than work around it.
- **Loosening it is your call, not the agent's.** Put a rules file at `<repo>/.autopilot/guard.json` or `~/.claude/autopilot/guard.json`:
  ```json
  { "scope": "runs", "allow": ["branch-force-delete:tmp/*", "force-push:my-feature/*"] }
  ```
  `"scope": "runs"` guards a repository only while a build is in progress there, so your own sessions are left alone. An `allow` entry is a rule id, or `rule:glob` to allow it only when every branch or path the command touches matches. The pipeline's own throwaway lane branches (`autopilot-lane/*`) and lane worktrees are allowed already.
- **`/recon` never crosses two lines on its own:** whether a teardown is authorized at all, and whether anything may run a target or write machine config. Both are your explicit yes.

## Development

```
npm test                                  # every script, on node:test
npm run validate                          # names, frontmatter, links, hook scripts, ${CLAUDE_PLUGIN_ROOT} placement
claude plugin validate . --strict         # the manifest against Claude Code's own schema
claude --plugin-dir .                     # try the working tree in a session
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

## License

MIT — see [LICENSE](LICENSE). Companion tools remain under their own licenses.
