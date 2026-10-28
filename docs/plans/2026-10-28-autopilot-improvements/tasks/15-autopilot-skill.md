# 15: Autopilot skill: voice, mission relay, resume, PAUSED

Security: no
Graph: autopilot/SKILL.md, 1. Find the phase, 3. Build, 4. Report
Spec: 3.2.1, 3.4.1, 3.4.6, 3.7.7, 3.7.8, 3.8.3
Decisions: D4, D14, D16, D17, D18, D22, D26

## Goal
The entry skill speaks in the pilot voice to the user, reports each finished task as a mission line, understands the `build` and `resume` verbs the commands send, and handles a paused run.

## Interfaces
Provides, as edits to skills/autopilot/SKILL.md:
- Early in the file: user-facing messages (phase line, build started, checkpoints, PAUSED, report) follow `${CLAUDE_PLUGIN_ROOT}/skills/autopilot/VOICE.md`. Dispatch prompts to agents stay plain (D4).
- `## 1. Find the phase`: the ledger is `.autopilot/runs/<plan directory name>/ledger.md`. Two verbs come first:
  - `build [plan]`: Build that plan (or the newest approved one). When there is no approved plan, say so in one line and point to `/autopilot:blueprint`.
  - `resume [plan]`: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/{pause.mjs}" clear <plan directory name>`, then Build. The conductor resumes from the ledger.
- `## 3. Build`:
  - On every `CHECKPOINT:` and `OUTCOME:`, first run `node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs" --missions --new <plan directory name>` and relay its output verbatim (the mission lines and bullets), then continue as before.
  - A message starting `PAUSED:` goes to Report the way `STOP:` does, with the reason and the line `Resume with /autopilot:resume.`
- `## 4. Report`: relay the conductor's **Not done** list (unmet request items and decisions) as its own heading, never folded away (D17). The notification line for PAUSED names the reason.

Consumes: VOICE.md and `status.mjs --missions --new` (03); `pause.mjs clear` (06); the renamed scoped names (02).

## Acceptance criteria
- [ ] The skill points user-facing messages at VOICE.md. Proof: tests/autopilot-skill.test.mjs "voice file named".
- [ ] The skill keeps dispatch prompts plain. Proof: tests/autopilot-skill.test.mjs finds the plain-briefs sentence.
- [ ] The skill reads ledgers under `.autopilot/runs/`. Proof: tests/autopilot-skill.test.mjs "runs path".
- [ ] No old `.autopilot/<plan directory name>/ledger.md` path remains. Proof: same test, negative assertion.
- [ ] `build` with no approved plan points to `/autopilot:blueprint`. Proof: tests/autopilot-skill.test.mjs "build verb".
- [ ] `resume` clears the pause before building. Proof: tests/autopilot-skill.test.mjs "resume clears pause", which checks the `pause.mjs" clear` line comes before the Build reference.
- [ ] Checkpoints and outcomes relay `--missions --new` output verbatim. Proof: tests/autopilot-skill.test.mjs "mission relay".
- [ ] `PAUSED:` is reported like `STOP:`, with `/autopilot:resume`. Proof: tests/autopilot-skill.test.mjs "paused".
- [ ] The report keeps a Not done heading. Proof: tests/autopilot-skill.test.mjs "not done".
- [ ] The plugin validates. Proof: `npm run validate` prints `plugin ok` (every script named exists).

## Tests (red first)
New `tests/autopilot-skill.test.mjs`. It reads skills/autopilot/SKILL.md, and each assertion goes red first.

## Touches
skills/autopilot/SKILL.md, tests/autopilot-skill.test.mjs

## Out of scope
VOICE.md content (03). The command files (14). The conductor (16, 20).
