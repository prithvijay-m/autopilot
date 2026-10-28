# Autopilot 0.3.0: plan

**Status:** approved 2026-10-28 (internal review, 2 rounds + arbitration; clickthrough approved by user 2026-10-28)
**Goal:** Ship version 0.3.0 of the Claude Code plugin renamed `autopilot`, with fifteen `/autopilot:` commands, a pilot voice with pinned mission lines, VPS-aware lane sizing, self-correcting interventions with a pause flag, a demands-met check, copilots, a preview loop, a retro that proposes patches, and an on-demand tech scout. Everything new is a deterministic node script with node:test tests or a prose rule with a structural test, and the gate stays `npm run check`.
**Spec:** [spec.md](spec.md)
**Preview:** [preview/index.html](preview/index.html)
**Build:** `/autopilot docs/plans/2026-10-28-autopilot-improvements`

## Contract

| Field | Value |
|---|---|
| Base branch | `chore/release-0.2.2` (54a0c23; the PR targets `main`, so 0.2.2 rides along; ranges use `chore/release-0.2.2...feat/autopilot-0.3.0`) (D13) |
| Integration branch | `feat/autopilot-0.3.0` (D13) |
| Setup | none (Node >=22, zero dependencies, no install step) |
| Gate | `npm run check` (runs `node tools/validate.mjs`, then `node --test "tests/*.test.mjs"`; CI runs the same two steps) |
| Test | `npm test` |
| Gate baseline | green at 54a0c23 plus the plan docs: `plugin ok`, 74 tests pass (log: /home/dev/src/claude-code-forge/.autopilot/logs/planner-baseline.log) |
| Focused test | `node --test tests/status.test.mjs` |
| Lanes | 3 (D12) |
| Shared resources | none: no ports, services or databases; every test makes its own scratch directory through `tests/helpers.mjs` |
| TDD skill | `supermatt:tdd` for logic-heavy tasks 01, 03, 04, 05, 06, 07, 08, 09, 10, 12; `mattpocock-skills:tdd` for the rest |
| Database | none |
| QA | no running app: run `claude plugin validate .` (expect `Validation passed`), then `npm run check` (expect `plugin ok` and 0 failures), from the integration branch's tip |
| Review method | the three-axis blind review in `reference/briefs.md` (standards, spec, adversarial) |
| Security review | yes: commands, hooks, the PAUSE flag, auto-trigger and improve are prompt-injection surface (D11) |
| New dependencies | none: the plugin has zero runtime dependencies and the build adds none (vetted: nothing to vet) |
| Off-limits | anything outside /home/dev/src/claude-code-forge and its lane worktrees; anything under /opt; installs outside ~/.local; every write under ~/.claude (read-only); the GitHub repository rename and remote change (ship does them, D2, D19); `main` (D12) |
| Commit plan docs | yes (the first commit also carries `.gitignore` and `.graphifyignore`, D13) |
| Finish | `pr` to prithvijay-m/claude-code-forge (renamed to prithvijay-m/autopilot by ship, D2, D3, D19) |

## Constraints
- Zero runtime dependencies; Node >=22 ESM; `node:` built-ins only (D11).
- Every script prints one summary line per result, costs no model tokens, and exits 0 unless its task file says otherwise (improve exits 1 on a refusal); follow the header-comment and `main()` pattern of `scripts/status.mjs` (D11).
- Tests: `node:test` and `node:assert/strict`; scratch dirs only from `tempDir()` and `tempRepo()` in `tests/helpers.mjs`, removed in `after()`; no `/tmp` paths written by hand; pass with an empty HOME (`HOME`, `USERPROFILE`, `AUTOPILOT_HOME`, `AUTOPILOT_STATE_DIR` set to scratch) and no locale; inject time, never sleep; no bash in tests; paths via `node:path` (D11, lessons).
- Test constants that look like credentials are named `FAKE_*` and contain no PASSWORD, SECRET, TOKEN or KEY word (lessons: scan-diff P0).
- Agents work only in their lane worktree. Read other branches with `git show` and `git diff`; never `git checkout` or `git switch` in the main checkout (lessons).
- In plan docs, new script files are written `scripts/{name.mjs}` and scoped names are not wrapped directly in backticks, so validate passes on the committed plan before the files exist. In plugin files, write them plainly: by then they exist.
- No command file uses `${CLAUDE_PLUGIN_ROOT}`; commands route by scoped name (D20). Files read raw (cockpit siblings, VOICE.md) say `<scripts>` (ARCHITECTURE rule 3).
- Refer to commands with the leading slash (`/autopilot:status`) in prose, because validate checks every backticked `autopilot:<name>` against the plugin's agents and skills.
- Persona only in user-facing text (D4). Briefs, code, commits, PR bodies and ledger lines stay plain.
- No new file may contain `autopilot-forge` or `claude-code-forge` (D19). CHANGELOG history stays as it is.
- `README.md`, `CHANGELOG.md`, `ARCHITECTURE.md`, `tools/validate.mjs`, `hooks/hooks.json` and the manifests have one owning task per wave (see Touches).
- Pre-wave-1 conductor step, the nested-dispatch spike (D15, D32, D36). It is not a builder task: coder has `disallowedTools: Agent`, so no builder can dispatch. The actor is the main-session conductor of this build (the /autopilot pipeline, which runs its own commands; not the plugin's agents/conductor.md). After Preflight and before dispatching wave 1, the main-session conductor:
  1. Makes a nonce with `node -e "console.log(crypto.randomUUID())"` and picks the marker path `/home/dev/src/claude-code-forge/.autopilot/logs/spike/nested-dispatch.marker`.
  2. Dispatches probe A: this plugin's own conductor agent (by the scoped name installed in this session; it has every tool). Probe A dispatches probe B, also the plugin's conductor by the same scoped name. Probe B dispatches probe C, one general-purpose subagent whose whole prompt is to write the nonce to the marker path and reply `DONE`. The prompts of probes A and B each open with: "This is a nested-dispatch probe, not a build. You have no PLAN; the PLAN, Status, Preflight and ledger rules do not apply, and a missing PLAN is not a Stop. Run no command, write no file, and do not reply `STOP:`." Then each gives its dispatch instruction, and each replies with its child's reply, or with the exact error text if a dispatch is refused.
  3. Reads the marker back. PASS when it holds the nonce; FAIL when any of the three dispatches is refused or the marker is missing or holds anything else. A probe reply that starts `STOP:` and names a missing PLAN or Status is a probe defect, not a FAIL: fix the prompt and rerun once.
  4. Writes `docs/spikes/nested-dispatch.md`: line 1 exactly `RESULT: PASS` or `RESULT: FAIL`, then `Date: <YYYY-MM-DD>`, `Host: <os and release>, Claude Code <claude --version>`, `Shape: main session -> probe A (plugin conductor) -> probe B (plugin conductor) -> probe C (general-purpose)`, `Nonce: <uuid>`, `Evidence: <probe A's reply and the marker content read back, or the exact error text>`. In Evidence, replace each old name (the plugin's old name and the repository's old name) with `<old-name>`, and write the marker path as `<marker>`; the file must pass `git grep -c -e autopilot-forge -e claude-code-forge -- docs/spikes` printing nothing (D19). It commits the file on the integration branch, runs the Gate (`npm run check`) right after that commit so the integration branch holds only checked commits, then deletes the marker.
  This step is the file's only writer; no task's Touches holds it. Task 20 starts only when line 1 is `RESULT: PASS`. On `RESULT: FAIL` every other task builds as planned, and the build stops before dispatching task 20 and asks the user (D15).
- `Security: yes` tasks: 02, 06, 09, 10, 13, 14, 17, 19.

## Task graph

| # | Task | Agent | Skills | Blocked by | Touches |
|---|---|---|---|---|---|
| 01 | Command rules in validate | coder | none | none | tools/validate.mjs, tests/validate.test.mjs |
| 02 | Rename to autopilot and version 0.3.0 | coder | none | none | .claude-plugin/plugin.json, .claude-plugin/marketplace.json, package.json, agents/conductor.md, skills/autopilot/SKILL.md, skills/blueprint/SKILL.md, skills/recon/SKILL.md, skills/verify/SKILL.md, scripts/auto-trigger.mjs, scripts/recon.mjs, tests/auto-trigger.test.mjs, tests/manifest.test.mjs, README.md, ARCHITECTURE.md, CREDITS.md |
| 03 | Status: runs path, mission lines, pause display, voice file | coder | supermatt:writing-for-agents | none | scripts/status.mjs, tests/status.test.mjs, skills/autopilot/VOICE.md |
| 04 | Host-load: cgroup limits, reserve, bound readout | coder | none | none | scripts/host-load.mjs, tests/host-load.test.mjs |
| 05 | Detectors: stall, hallucination, circular, missing context | coder | none | none | scripts/{detect.mjs}, tests/detect.test.mjs |
| 06 | Pause flag and its PreToolUse hook | coder | security-scan | none | scripts/{pause.mjs}, tests/pause.test.mjs, hooks/hooks.json |
| 07 | Copilot sizing script | coder | none | none | scripts/{copilots.mjs}, tests/copilots.test.mjs |
| 08 | Retro: repeated problems to a proposal file | coder | none | none | scripts/{retro.mjs}, tests/retro.test.mjs |
| 09 | Improve: list, check and apply a proposal | coder | security-scan | none | scripts/{improve.mjs}, tests/improve.test.mjs |
| 10 | Guard and lessons write only under .autopilot/runs | coder | security-scan | none | scripts/guard.mjs, scripts/lessons.mjs, tests/guard.test.mjs, tests/lessons.test.mjs |
| 11 | Reviewer ACCEPTANCE mode | coder | supermatt:writing-for-agents | none | agents/reviewer.md, tests/reviewer.test.mjs |
| 12 | Validate: rename rule and plan-doc exemptions | coder | none | 01, 02 | tools/validate.mjs, tests/validate.test.mjs |
| 13 | Cockpit skill and its six commands | coder | supermatt:writing-for-agents, security-scan | 01, 02, 03 | skills/cockpit/SKILL.md, commands/status.md, commands/intervention.md, commands/preview.md, commands/scout.md, commands/improve.md, commands/copilot.md, tests/cockpit-commands.test.mjs |
| 14 | Run commands: build, resume, merge, test, deploy, agent | coder | supermatt:writing-for-agents, security-scan | 01, 02 | commands/build.md, commands/resume.md, commands/merge.md, commands/test.md, commands/deploy.md, commands/agent.md, tests/run-commands.test.mjs |
| 15 | Autopilot skill: voice, mission relay, resume, PAUSED | coder | supermatt:writing-for-agents | 02, 03, 06 | skills/autopilot/SKILL.md, tests/autopilot-skill.test.mjs |
| 16 | Conductor: runs path, interventions, ACCEPTANCE, summaries, retro | coder | supermatt:writing-for-agents | 02, 03, 05, 06, 08, 10, 11 | agents/conductor.md, tests/conductor.test.mjs |
| 17 | Cockpit procedures: intervention and improve | coder | supermatt:writing-for-agents, security-scan | 06, 09, 13 | skills/cockpit/INTERVENTION.md, skills/cockpit/IMPROVE.md, tests/cockpit-procedures.test.mjs |
| 18 | Blueprint: request.md, preview step, planner preview, Deploy row | coder | supermatt:writing-for-agents | 02, 10, 13 | skills/blueprint/SKILL.md, skills/blueprint/PLAN-FORMAT.md, agents/planner.md, skills/cockpit/PREVIEW.md, tests/blueprint.test.mjs |
| 19 | Scout agent and procedure | coder | supermatt:writing-for-agents, security-scan | 13 | agents/scout.md, skills/cockpit/SCOUT.md, tests/scout.test.mjs |
| 20 | Copilots in the conductor and the copilot procedure | coder | supermatt:writing-for-agents | 04, 07, 13, 16 | agents/conductor.md, skills/cockpit/COPILOT.md, tests/copilot-doc.test.mjs |
| 21 | Docs and release notes: README, ARCHITECTURE, CHANGELOG | coder | supermatt:writing-for-agents | 12, 14, 15, 17, 18, 19, 20 | README.md, ARCHITECTURE.md, CHANGELOG.md, tests/docs.test.mjs |

Waves: 1 = 01 to 11; 2 = 12 to 16; 3 = 17 to 20; 4 = 21. The critical path is 02 -> 16 -> 20 -> 21 (4 waves).
