# 12: Validate: rename rule and plan-doc exemptions

Security: no
Graph: validate(), walk(), PROSE()
Spec: 3.1.5, 3.13.1, 3.13.2
Decisions: D11, D19, D31

## Goal
The gate keeps the rename done: neither old name can come back outside CHANGELOG history and plan records. Plans and patch proposals may name files that are not built yet without failing the gate.

## Interfaces
Provides, in `validate(root)` (signature unchanged):
- Rename rule: for every walked file ending `.md`, `.json`, `.mjs`, `.yml`, `.yaml` or `.html` (tests/ included; `CHANGELOG.md` and anything under `docs/plans/` excluded), each of the two old names it contains is an error `<file>: still says <old name>; the plugin is autopilot`. The old names are built from parts in validate.mjs, for example `["autopilot", "forge"].join("-")` and `["claude", "code", "forge"].join("-")`, so the file itself never contains them. tests/validate.test.mjs builds its fixtures the same way.
- Exemptions: the existing checks "link goes nowhere", "names scripts/<x>, which does not exist" and "names <plugin>:<x>, which is neither an agent nor a skill" skip files under `docs/plans/` and `docs/improvements/`.
- The rename rule is on whatever plugin.json says. It is about these two strings, not about the manifest name.

Consumes: the renamed tree from task 02 (so the rule passes on this repository), and the command rules from task 01 (same file, earlier wave).

## Acceptance criteria
- [ ] A skill file containing an old name is an error. Proof: tests/validate.test.mjs case "an old name in a skill".
- [ ] A YAML workflow containing an old name is an error. Proof: tests/validate.test.mjs case "an old name in CI" (fixture `.github/workflows/ci.yml`).
- [ ] A test file containing an old name is an error. Proof: tests/validate.test.mjs case "an old name in a test".
- [ ] An old name in CHANGELOG.md is allowed. Proof: tests/validate.test.mjs "history may keep old names".
- [ ] An old name under docs/plans/ is allowed. Proof: same test, second fixture.
- [ ] A plan doc naming a script that does not exist is allowed. Proof: tests/validate.test.mjs "plans may name future scripts".
- [ ] A proposal under docs/improvements/ naming a missing script is allowed. Proof: same test, second fixture.
- [ ] A plan doc with an unknown backticked scoped name is allowed. Proof: tests/validate.test.mjs "plans may name future agents".
- [ ] A plan doc with a link to a file not yet built is allowed. Proof: tests/validate.test.mjs "plans may link future files".
- [ ] A skill file naming a missing script is still an error. Proof: the existing case "a script that does not exist" stays green.
- [ ] Neither validate.mjs nor its test contains an old name. Proof: `git grep -c -e autopilot-forge -e claude-code-forge -- tools/validate.mjs tests/validate.test.mjs` prints nothing.
- [ ] This repository validates. Proof: "this plugin validates with no errors" stays green, and `npm run check` passes.

## Tests (red first)
All in `tests/validate.test.mjs`: new rows in the `cases` table and new allow-tests that use `fixture()`, which cleans up through `tempDir()`. Each case goes red first.

## Touches
tools/validate.mjs, tests/validate.test.mjs

## Out of scope
The command rules (01). Renaming the files themselves (02).
