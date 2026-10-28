# 11: Reviewer ACCEPTANCE mode

Security: no
Graph: reviewer.md, QA, SECURITY, Report
Spec: 3.8.2
Decisions: D17, D30

## Goal
The reviewer can check a finished branch against what the user asked for: every request item and every decision, with evidence.

## Interfaces
Provides: a new `## ACCEPTANCE` section in agents/reviewer.md, after `## SECURITY`, saying:
- Given: the paths of `request.md` and `decisions.md`, BASE and HEAD.
- Items: each numbered line or sentence of request.md is one item (`R1`, `R2`, ...), and each decision number is one item (`D1`, ...). Several items may share evidence.
- Verdict per item: `MET`, `PARTIAL` or `NOT MET`. Evidence is a `file:line` in HEAD, a test name with its result, or a command with its output. A verdict without evidence counts as NOT MET.
- Report: a table `| Item | Verdict | Evidence |`, then the line `acceptance: <met>/<total> met, <partial> partial, <not met> not met`.
- A RE-CHECK dispatch names only the items to check again.
- The repository stays read-only, as in every reviewer mode.
- The frontmatter description also names demands-met checks, and stays under 1024 characters.

Consumes: nothing.

## Acceptance criteria
- [ ] reviewer.md has an ACCEPTANCE section. Proof: tests/reviewer.test.mjs "has an ACCEPTANCE mode".
- [ ] The section names request.md, decisions.md, BASE and HEAD as inputs. Proof: tests/reviewer.test.mjs "names its inputs".
- [ ] The section uses exactly the verdicts MET, PARTIAL and NOT MET. Proof: tests/reviewer.test.mjs "verdict words".
- [ ] A verdict without evidence is NOT MET. Proof: tests/reviewer.test.mjs finds that rule's sentence.
- [ ] The report has the table header and the `acceptance:` summary line. Proof: tests/reviewer.test.mjs "report shape".
- [ ] The reviewer still cannot dispatch agents or edit notebooks. Proof: tests/reviewer.test.mjs, where frontmatter `disallowedTools` still holds Agent.
- [ ] The plugin still validates. Proof: `npm run validate` prints `plugin ok`.

## Tests (red first)
New `tests/reviewer.test.mjs`. It reads agents/reviewer.md and uses `frontmatter()` from tools/validate.mjs. Each assertion goes red before the section is written.

## Touches
agents/reviewer.md, tests/reviewer.test.mjs

## Out of scope
When the conductor dispatches it (16).
