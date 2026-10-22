# CLAUDE.md: Working rules for this project

This project is a phone-controlled, Wii-style console that runs in the browser.
**The full spec is in `PLAN.md`. Read it before doing anything.**

## How we work
1. **One phase at a time.** Build only the current phase from `PLAN.md`. Do not start the next phase until I confirm the current one works on my real phone.
2. **Ask before:**
   - installing any dependency that isn't listed in `PLAN.md`
   - deleting or renaming files
   - running `git push`
   - changing the socket protocol from what `PLAN.md` says
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
8. **Keep `README.md` updated** with how to run the project. Write it for a beginner.
