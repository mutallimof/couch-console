# CLAUDE.md: Working rules for this project

This project is a phone-controlled, Wii-style console that runs in the browser.
**The full spec is in `.claude/docs/PLAN.md` (and `.claude/docs/PLAN-PARTY.md` for the party features). Decisions are written in `.claude/docs/DECISIONS.md`. Read the plan before doing anything.**

## How we work
1. **Phases in test groups.** Build only the current test group from `.claude/docs/PLAN.md`. Do not start the next group until I confirm the current one works on my real phone. Groups: Phase 0 · Phase 1 · Phases 2+3 · Phases 4+5 · Phase 6 · Phase 7 · Phase 8 · Phase 9. Commit each phase separately (`Phase N: <name>`).
2. **Ask before:**
   - installing any dependency that isn't listed in `.claude/docs/PLAN.md` (or approved in `.claude/docs/PLAN-PARTY.md`)
   - deleting or renaming files
   - **Pushing (updated rule):** after each finished phase, if `npm test` passes, you may push the phase branch **and merge it into `main` and push `main`** without asking me. Run `npm test` on `main` after the merge. If tests fail, do **not** push; fix them or tell me. Never force-push, and never push secrets (`config.json`, `certs/`, `*.pem`, `photos/*`, `videos.txt`). Pushes other than finished-phase pushes still need my explicit "yes".
   - changing the socket protocol from what `.claude/docs/PLAN.md` says
3. **Manual steps.** Whenever something needs me (installing a tool, running a command in a second terminal, scanning a QR code, testing on my phone, allowing a permission, creating something on GitHub), stop and print a block exactly like this, then wait for my answer:

   ```
   🧑 YOUR TURN
   1. <exact step, with the exact command to copy if there is one>
   2. ...
   Tell me: <what I should report back, e.g. "does the cursor move the right way?">
   ```
4. **End of each phase:** print a short **"How to test"** checklist (in the YOUR TURN format), wait for my feedback, fix any issues, then `git add -A && git commit -m "Phase N: <name>"` and ask me whether to push.
5. **Keep it simple:** plain HTML, CSS and JavaScript ES modules, with no frameworks and no build step. Keep files small and readable, and add short comments where the logic isn't obvious.
6. **No Nintendo assets:** no logos, sounds, fonts, characters, channel art or the "Wii" name in the UI. Everything must be original.
7. **When something doesn't work on my phone,** ask me for the specific symptom, and add a debug readout (`?debug=1`) rather than guessing.
8. **`README.md` explains how to run the project,** written for a beginner. Update it only when the run steps change, at the end of a phase.

## Token rules
- Update docs ONCE at the end of a phase, never after each subtask.
- By default update ONLY `.claude/docs/HANDOFF.md`, with targeted edits (change the lines that changed; never rewrite the whole file).
- Touch `.claude/docs/DECISIONS.md` only when a decision actually changes; append one line.
- Don't touch `.claude/docs/PLAN.md`, `.claude/docs/PLAN-PARTY.md` or `.claude/docs/STYLE.md` unless I ask.
- Keep `.claude/docs/HANDOFF.md` under 80 lines; cut old details instead of adding.
- At the start of a chat, read only `CLAUDE.md` and `.claude/docs/HANDOFF.md`, plus any doc the prompt names. Don't summarize them back to me.
- While working, run only the tests for the files you changed; run the full suite once before pushing.
- Screenshots: only the ones the prompt asks for.
- Final report: max 15 lines, plus any table the prompt asks for.
