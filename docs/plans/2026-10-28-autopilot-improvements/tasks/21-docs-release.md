# 21: Docs and release notes: README, ARCHITECTURE, CHANGELOG

Security: no
Graph: README.md, Install, Usage, Safety, ARCHITECTURE.md, Rules that matter, State on disk
Spec: 3.14, 3.3 (roster), 3.1.1
Decisions: D3, D9, D13, D18, D20, D23, D26

## Goal
The user-facing docs describe 0.3.0 as built: the fifteen commands, the voice, pause and resume, copilots, preview, scout, improve, the new run-state path, and the clash with a same-named user skill.

## Interfaces
Provides:
- README.md:
  - a `## Commands` table of all fifteen `/autopilot:<name>` commands, each with its one-line purpose (the command files' descriptions; for blueprint, recon and verify, the skills' descriptions, shortened);
  - one short section each for: the pilot voice and mission lines; pause and resume (intervention, automatic pause, the PAUSE file); copilots; the preview loop; scout; improve;
  - a `### Name clash` note: a user skill also named `autopilot` shadows nothing in the plugin, because the plugin's own names are scoped; the auto-trigger's override (`AUTOPILOT_SKILL` or `~/.claude/autopilot-auto.skill`) picks which one the nudge names;
  - the state paths: `.autopilot/runs/<plan>/` and `.autopilot/runs/LESSONS.md`.
- ARCHITECTURE.md: the diagram gains copilots (lead conductor to copilot conductors, each with lanes). `## Who does what` gains copilot, cockpit and scout. `## State on disk` lists `.autopilot/runs/<plan>/` (ledger, cards, clock.json, missions.json, PAUSE), `.autopilot/runs/<plan>-c<N>/` and `.autopilot/runs/LESSONS.md`, and drops the 0.2.x rows. `## Rules that matter` gains: 7, commands are thin, route by scoped name, and never use `${CLAUDE_PLUGIN_ROOT}`; 8, the PAUSE flag stops crew dispatches at the next boundary and only `/autopilot:resume` clears it.
- CHANGELOG.md: a new top `## 0.3.0` entry (rename and install change, the commands, the voice, host sizing, interventions and pause, ACCEPTANCE, copilots, preview, retro and improve, scout, validate rules), with the line: "A build started on 0.2.x keeps its ledger at the old path: finish it on 0.2.x." Older entries stay word for word.

Consumes: everything from tasks 01 to 20.

## Acceptance criteria
- [ ] The README lists all fifteen commands with the leading slash. Proof: tests/docs.test.mjs "readme lists every command".
- [ ] The README has the name-clash note naming the override. Proof: tests/docs.test.mjs "name clash".
- [ ] The README has a section for each of the six features. Proof: tests/docs.test.mjs "feature sections".
- [ ] The command roster is exactly the fifteen of D9: the commands/ files plus the blueprint, recon and verify skills. Proof: tests/docs.test.mjs "roster".
- [ ] ARCHITECTURE's state table lists `.autopilot/runs/`. Proof: tests/docs.test.mjs "state table".
- [ ] ARCHITECTURE has the PAUSE rule. Proof: tests/docs.test.mjs "pause rule".
- [ ] ARCHITECTURE has the command-routing rule. Proof: tests/docs.test.mjs "routing rule".
- [ ] CHANGELOG's top heading is `## 0.3.0`, the same as plugin.json's version. Proof: tests/docs.test.mjs "changelog version".
- [ ] CHANGELOG says a 0.2.x build finishes on 0.2.x. Proof: tests/docs.test.mjs "migration note".
- [ ] Older CHANGELOG entries are unchanged. Proof: `git diff chore/release-0.2.2 -- CHANGELOG.md` shows only added lines.
- [ ] `claude plugin validate .` passes. Proof: it prints `Validation passed`.
- [ ] The gate passes. Proof: `npm run check` ends with `plugin ok` and 0 failures.

## Tests (red first)
New `tests/docs.test.mjs`. It reads README.md, ARCHITECTURE.md, CHANGELOG.md, plugin.json and the commands/ and skills/ directories. Each assertion goes red first.

## Touches
README.md, ARCHITECTURE.md, CHANGELOG.md, tests/docs.test.mjs

## Out of scope
The GitHub rename and remote change (ship). Code changes.
