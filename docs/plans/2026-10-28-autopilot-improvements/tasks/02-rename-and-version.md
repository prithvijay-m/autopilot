# 02: Rename to autopilot and version 0.3.0

Security: yes (the auto-trigger hook's default target changes)
Graph: targetSkill(), classify(), README.md, ARCHITECTURE.md, conductor.md, autopilot/SKILL.md, blueprint/SKILL.md
Spec: 3.1.1, 3.1.2, 3.1.3, 3.1.4
Decisions: D1, D2, D3, D19

## Goal
The plugin is called `autopilot` everywhere in the tree, versioned 0.3.0, and its URLs point at github.com/prithvijay-m/autopilot. This is a mechanical rename: change no behaviour.

## Interfaces
Provides:
- `.claude-plugin/plugin.json`: `"name": "autopilot"`, `"version": "0.3.0"`, `"homepage"` and `"repository"` set to `https://github.com/prithvijay-m/autopilot`.
- `.claude-plugin/marketplace.json`: top-level `"name": "autopilot"`; its plugin entry has `"name": "autopilot"`, `"version": "0.3.0"`, `"source": "./"`.
- `package.json`: `"name": "autopilot"`, `"version": "0.3.0"`, and a description that names the `autopilot` plugin.
- `scripts/auto-trigger.mjs`: `DEFAULT_SKILL = "autopilot:autopilot"`. `targetSkill()` returns it when no override is set.
- Scoped dispatch names in agents and skills: `autopilot:<agent>`.
- README install lines: `/plugin marketplace add prithvijay-m/autopilot` and `/plugin install autopilot@autopilot`. Replace the README's line explaining the old name with one line saying the plugin is `autopilot`.

Consumes: nothing.

## Acceptance criteria
- [ ] plugin.json is named `autopilot`. Proof: tests/manifest.test.mjs "plugin.json names the plugin autopilot".
- [ ] plugin.json, package.json and the marketplace plugin entry all say version 0.3.0. Proof: tests/manifest.test.mjs "every manifest says 0.3.0".
- [ ] marketplace.json and its plugin entry are both named `autopilot`. Proof: tests/manifest.test.mjs "the marketplace lists autopilot".
- [ ] plugin.json's homepage and repository are `https://github.com/prithvijay-m/autopilot`. Proof: tests/manifest.test.mjs "the manifest points at the renamed repository".
- [ ] With no override, the auto-trigger names the scoped autopilot skill of the autopilot plugin. Proof: tests/auto-trigger.test.mjs, where the default-skill assertion now expects "autopilot:autopilot", run with an empty HOME.
- [ ] No old name remains outside CHANGELOG history and the plan docs. Proof: `git grep -n -e autopilot-forge -e claude-code-forge -- . ":!CHANGELOG.md" ":!docs/plans"` prints nothing.
- [ ] Every scoped name in the agents and skills resolves under the new plugin name. Proof: `npm run check` ends with `plugin ok` and 0 failures (validate checks every backticked `autopilot:<name>` against agents and skills).
- [ ] `claude plugin validate .` still passes. Proof: the command prints `Validation passed`.

## Tests (red first)
1. New `tests/manifest.test.mjs`: the four manifest tests above. They read the JSON files from the repository root (path from `import.meta.url`). Run them red.
2. `tests/auto-trigger.test.mjs`: change the expected default skill, then see it fail.
3. Rename. Find every site with `git grep -n -e autopilot-forge -e claude-code-forge`; the files are listed in Touches.

## Touches
.claude-plugin/plugin.json, .claude-plugin/marketplace.json, package.json, agents/conductor.md, skills/autopilot/SKILL.md, skills/blueprint/SKILL.md, skills/recon/SKILL.md, skills/verify/SKILL.md, scripts/auto-trigger.mjs, scripts/recon.mjs, tests/auto-trigger.test.mjs, tests/manifest.test.mjs, README.md, ARCHITECTURE.md, CREDITS.md

## Out of scope
CHANGELOG.md (task 21 writes the 0.3.0 entry; history stays). The validate rule against old names (task 12). `gh repo rename` and `git remote set-url` (ship). Any wording change beyond the names and URLs.
