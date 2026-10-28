# 18: Blueprint: request.md, preview step, planner preview, Deploy row

Security: no
Graph: blueprint/SKILL.md, 1. Ground, 4. Audit in a fresh context, 5. Approve and hand off, planner.md, Steps, PLAN-FORMAT.md, Contract
Spec: 3.8.1, 3.10, 3.3.3, 3.2.2
Decisions: D5, D14, D17, D23, D33

## Goal
Planning keeps the user's request verbatim, produces a clickable preview, and loops on it with the user until they give the green light, before any build. The Contract gains a `Deploy` row.

## Interfaces
Provides:
- skills/blueprint/SKILL.md:
  - Step 1, first bullet: before anything else, write `$ARGUMENTS` verbatim to `PLAN/request.md` under the heading `# Original request (verbatim)`. An existing request.md is kept, and nothing edits it later (D17).
  - The lessons bullet names `.autopilot/runs/LESSONS.md` (D23).
  - Step 5 becomes `## 5. Preview, approve and hand off`, and the numbering of steps 1 to 5 stays (the autopilot skill runs "steps 1 to 5"). It opens with a sentence that links PREVIEW.md (markdown link target `../cockpit/PREVIEW.md`) and says to carry it out, before the approval question, and says the build never starts before the user's green light on the preview (D5).
  - Step 3 tells the planner to write `PLAN/preview/index.html`.
- agents/planner.md, step 5: also write `PLAN/preview/index.html`, one self-contained file (no external scripts, styles, fonts or requests; inline CSS and JS) that works at phone width, in light and dark, under about 60 kB, clicking through the planned behaviour with mocked data. Name it in spec.md as the plan's preview. A dispatch carrying **PREVIEW CHANGES** revises the plan and the preview together.
- skills/cockpit/PREVIEW.md (read raw, `<scripts>` only):
  1. PLAN = `$ARGUMENTS`, or the newest plan with `preview/index.html`.
  2. When an Artifact tool is available, publish the file as a private Artifact and give the link. Otherwise print the file's absolute path for the user to open.
  3. Ask the user to click through and say what to change, or give the green light.
  4. A change goes to the planner as PREVIEW CHANGES (or, for a purely visual fix, to the session's own edit of the HTML). Then republish, and go back to 3.
  5. Green light: record `Preview approved <YYYY-MM-DD>` under the plan's Status line, and return to the step that called this one.
  This loop runs in the main session, never in an agent.
- skills/blueprint/PLAN-FORMAT.md: an optional Contract row `| Deploy | <the repository's documented deploy command, or none> |`. The plan directory listing includes `request.md` and `preview/index.html`.

Consumes: the cockpit skill directory (13); the lessons path (10); scoped names (02).

## Acceptance criteria
- [ ] Blueprint writes request.md verbatim before any question. Proof: tests/blueprint.test.mjs "request first", which checks that request.md appears before `## 2. Grill`.
- [ ] Blueprint keeps an existing request.md. Proof: tests/blueprint.test.mjs finds the keep sentence.
- [ ] Blueprint names the lessons file under `.autopilot/runs/`. Proof: tests/blueprint.test.mjs "lessons path".
- [ ] The preview comes after the audit and before the approval question. Proof: tests/blueprint.test.mjs "step order".
- [ ] Blueprint's steps are still numbered 1 to 5. Proof: tests/blueprint.test.mjs "numbering".
- [ ] The Preview step's link to PREVIEW.md resolves. Proof: `npm run validate` prints `plugin ok`.
- [ ] Approval says no build before the green light. Proof: tests/blueprint.test.mjs "green light gate".
- [ ] The planner writes a self-contained preview under about 60 kB, at phone width, light and dark. Proof: tests/blueprint.test.mjs "planner preview rules".
- [ ] The planner handles PREVIEW CHANGES. Proof: tests/blueprint.test.mjs "preview changes".
- [ ] PREVIEW.md publishes as a private Artifact. Proof: tests/blueprint.test.mjs "artifact".
- [ ] PREVIEW.md falls back to printing the file's path. Proof: tests/blueprint.test.mjs "fallback".
- [ ] PREVIEW.md loops until the green light, in the main session. Proof: tests/blueprint.test.mjs "loop".
- [ ] PLAN-FORMAT has the optional Deploy row. Proof: tests/blueprint.test.mjs "deploy row".

## Tests (red first)
New `tests/blueprint.test.mjs`. It reads the four files, and each assertion goes red first.

## Touches
skills/blueprint/SKILL.md, skills/blueprint/PLAN-FORMAT.md, agents/planner.md, skills/cockpit/PREVIEW.md, tests/blueprint.test.mjs

## Out of scope
The autopilot skill's phases (15). The HTML of any real plan.
