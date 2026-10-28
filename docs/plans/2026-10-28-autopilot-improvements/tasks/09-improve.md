# 09: Improve: list, check and apply a proposal

Security: yes (applies a model-written patch to plugin files, including hooks and scripts that run on the user's machine)
Graph: none (new script)
Spec: 3.11.5, 3.11.6, 3.11.7
Decisions: D6, D28

## Goal
The user's only way to change the plugin from a retro proposal. It lists proposals, shows exactly which files a patch would change, refuses anything outside the plugin's own tree, and applies only when told `--yes`. New file `scripts/{improve.mjs}`.

## Interfaces
Provides:
- CLI `improve.mjs list [--dir <dir>]` (default `<cwd>/docs/improvements`) prints `<file>: <status>, <n> files` per proposal, or `improve: no proposals`. Exits 0.
- `improve.mjs check <file> [--root <dir>]` prints `ok: <n> files would change: <a>, <b>` (exit 0), or `refused: <reason>` / `does not apply: <first line of git's output>` (exit 1).
- `improve.mjs apply <file> [--root <dir>] [--yes]`. Without `--yes` it behaves like `check` and adds the line `pass --yes to apply`. With `--yes` it runs `git apply` in root, prints `applied: <n> files`, and rewrites the proposal's `Status: proposed` to `Status: applied`. A refusal or a failed apply exits 1 and leaves the status alone.
- `export function extractPatch(md)` returns the body of the first ```` ```diff ```` fence after `## Patch`, or null when it is missing or empty.
- `export function patchPaths(diff)` returns every path from the `--- a/`, `+++ b/`, `rename from`, `rename to`, `copy from` and `copy to` lines, skipping `/dev/null`.
- `export function allowedPath(p)`: false for absolute paths (`/x`, `C:\x`, `\\x`) and any `..` segment. Otherwise true only for paths under `agents/`, `commands/`, `docs/`, `hooks/`, `scripts/`, `skills/`, `tests/` or `tools/`, or a top-level `*.md`.
- `export function pluginRoot(file)` walks up from the file's directory to the first directory whose `.claude-plugin/plugin.json` has `"name": "autopilot"`, or returns null.
- Refusal reasons: `no patch in <file>`, `absolute path <p>`, `path leaves the plugin <p>`, `path outside the plugin's own folders <p>`, `no autopilot plugin root; pass --root`.

Consumes: git on PATH (`git apply --check`, `git apply`), which works outside a repository too.

## Acceptance criteria
- [ ] `list` prints one line per proposal with its status and file count. Proof: tests/improve.test.mjs "list".
- [ ] `list` with no proposals says `improve: no proposals`. Proof: same test.
- [ ] `check` on a clean patch names the files that would change. Proof: tests/improve.test.mjs "check ok" (plugin fixture in `tempRepo()` with `.claude-plugin/plugin.json` named autopilot).
- [ ] An absolute path is refused with exit 1. Proof: tests/improve.test.mjs "absolute refused".
- [ ] A `..` segment is refused with exit 1. Proof: tests/improve.test.mjs "dotdot refused".
- [ ] A rename whose target leaves the allowed folders is refused. Proof: tests/improve.test.mjs "rename refused" (`rename to .github/workflows/x.yml`).
- [ ] A path outside the allowed folders, such as `.claude-plugin/plugin.json`, is refused. Proof: tests/improve.test.mjs "outside refused".
- [ ] A proposal with an empty Patch fence is refused. Proof: tests/improve.test.mjs "empty patch".
- [ ] `apply` without `--yes` changes no file. Proof: tests/improve.test.mjs, where file contents are unchanged and the output says `pass --yes to apply`.
- [ ] `apply --yes` changes the files. Proof: tests/improve.test.mjs "apply".
- [ ] A successful apply sets `Status: applied`. Proof: same test reads the proposal.
- [ ] A patch that does not apply exits 1 and leaves `Status: proposed`. Proof: tests/improve.test.mjs "stale patch".
- [ ] Without `--root` and outside a plugin checkout, the script refuses. Proof: tests/improve.test.mjs "no root".

## Tests (red first)
New `tests/improve.test.mjs`. Fixtures come from `tempRepo()`, removed in `after()`. Patches are written inline with `\n` endings. Each case goes red first.

## Touches
scripts/{improve.mjs}, tests/improve.test.mjs

## Out of scope
The conversation that asks the user (17). Writing patches (16).
