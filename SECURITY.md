# Security

## What the guard is

`scripts/guard.mjs` is a **tripwire for accidents**. It reads a shell command, splits it into segments, and blocks the ones that are irreversible or reach shared state: force and delete pushes, pushes to a protected branch, hook bypasses, history rewrites, force-deletes of branches and worktrees, and recursive deletes of a root, home or `.git`.

It is **not a sandbox**. It does not stop:

- a command it cannot parse (it fails open, on purpose: a guard that blocks on a parse error blocks real work);
- a destructive action by a tool other than Bash and PowerShell, or through a script the agent wrote and then ran (`node cleanup.js`);
- a heredoc fed to a program the guard does not recognise as an interpreter, or any language that runs a shell command from inside its own code (`python -c "os.system(...)"`);
- obfuscation: variables, `base64 -d | sh`, or building a command out of pieces;
- anything an agent can do after editing `hooks.json`, or the machine's `~/.claude/autopilot/guard.json`, which is where allowances live and which only you should edit. A repository's `.autopilot/guard.json` can only tighten the guard: its `allow` entries are ignored, and its `scope` counts only when it is `"always"`, so a cloned repository cannot switch the guard off.
- variable indirection (`$g push -f`), `$(echo git)`, `find -delete`, and interpreters: known non-goals.

Beyond the push, hook, history and delete rules above, it also blocks `git config core.hooksPath <path>` (`hook-bypass`), renaming a protected branch or onto one (`protected-branch-move`), `git stash clear` (`stash-clear`), and whole-tree discards of uncommitted work: `git checkout .`, `git checkout -- .`, `git restore .` and `git clean -f` with no pathspec or `.` (`discard-worktree`). Each can be allowed by id in the machine's rules file.

Real protection is the branch model (work happens on a branch, a pull request is the only way in) and your repository's branch protection.

## Other things that touch your machine

- `scripts/rea-mcp.mjs` edits `~/.claude.json`, only when you run `enable` or `disable`, and keeps a `.rea-toggle.backup` beside it.
- `scripts/lessons.mjs` writes under `~/.claude/autopilot/` and `<repo>/.autopilot/`, and appends `.autopilot/` to the repository's `.git/info/exclude`.
- `scripts/tdd-check.mjs` temporarily rewrites source files in the working tree to check your tests, then restores them with `git reset --hard HEAD`. It refuses to start on a dirty tree. After a killed run it resets only when the dirty files are exactly the ones it reverted.
- `/recon` runs a target only after you approve it, and never alone.

## Reporting a problem

Open a private security advisory on the repository, or email the maintainer listed on their GitHub profile. Please include the command or input, and what you expected the guard or script to do.
