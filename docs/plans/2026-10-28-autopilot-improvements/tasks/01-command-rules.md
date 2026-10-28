# 01: Command rules in validate

Security: no
Graph: validate(), frontmatter(), walk(), SUBSTITUTED()
Spec: 3.3.5, 3.13.3
Decisions: D11, D14, D20

## Goal
Make the gate able to check `commands/` before any command file exists, so the command tasks (13, 14) land against real rules. (The nested-dispatch spike is a main-session conductor step before wave 1, not part of this task: D36.)

## Interfaces
Provides:
- `validate(root)` in `tools/validate.mjs` (signature unchanged: `{ errors, warnings }`) adds these errors for each `commands/*.md`:
  - `commands/<n>.md: no frontmatter`
  - `commands/<n>.md: no description`
  - `commands/<n>.md: "<n>" is already a skill, and a skill is its own command`
  - `commands/<n>.md: routes to nothing: name an agent or skill of this plugin as <plugin>:<name> in backticks`
- `${CLAUDE_PLUGIN_ROOT}` in a command file stays an error through the existing raw-file rule. `SUBSTITUTED` does not gain `commands/`.

Consumes: nothing new.

## Acceptance criteria
- [ ] A command file without frontmatter is an error. Proof: tests/validate.test.mjs case "a command without frontmatter".
- [ ] A command file whose frontmatter has no description is an error. Proof: tests/validate.test.mjs case "a command without a description".
- [ ] A command named like a skill directory is an error. Proof: tests/validate.test.mjs case "a command that shadows a skill" (fixture `commands/s.md` beside `skills/s/SKILL.md`).
- [ ] A command that names no scoped agent or skill is an error. Proof: tests/validate.test.mjs case "a command that routes to nothing".
- [ ] A command naming a scoped agent that does not exist is an error. Proof: tests/validate.test.mjs case "a command routing to a missing agent" matches `neither an agent nor a skill`.
- [ ] A command that uses `${CLAUDE_PLUGIN_ROOT}` is an error. Proof: tests/validate.test.mjs case "the plugin root in a command" matches `never replaced`.
- [ ] A well-formed command file passes. Proof: the fixture `GOOD` gains `commands/go.md` (description, body naming `` `demo-plugin:a` ``) and "a clean fixture passes" stays green.
- [ ] The repository itself still validates. Proof: `npm run check` ends with `plugin ok` and 0 failures.

## Tests (red first)
1. `tests/validate.test.mjs`: add the five command cases above to the `cases` table of "each known mistake is an error", and run them to see them fail.
2. `tests/validate.test.mjs`: add `commands/go.md` to `GOOD`; "a clean fixture passes" must stay green once the rules exist.
3. Implement the rules in `validate()`, one red-green cycle per case. Commit after each green.

## Touches
tools/validate.mjs, tests/validate.test.mjs

## Out of scope
The rename rule and the docs/plans exemptions (task 12). Any command file (tasks 13, 14). Copilot logic (tasks 07, 20). The nested-dispatch spike (a main-session conductor step, D36).
