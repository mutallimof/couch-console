# Couch Console: Rebuild Plan ("Wii + high-quality kart racer")

Put this file in the repo as `.claude/docs/REBUILD-PLAN.md`. Tick the boxes as you go.

## The goal

- **The console:** feels like a Wii in your living room. A TV home screen with channels, phones as remotes (QR join, tilt and pointer), and party apps.
- **The kart game:** feels like a polished Mario Kart Wii-class racer, with tight drifting, 3-tier mini-turbos, juicy effects, a great camera, items, and a 4-player couch.
- **Everything original.** No Nintendo names, models, sounds, tracks or logos.

## Key decisions

1. **Upgrade, don't restart.** We keep the current repo (159 tests, working phone/relay/party hub) and replace the weak parts module by module. A from-scratch rewrite would throw away working features and tests for no gain.
2. **Keep the stack:** Node + Express + Socket.IO, plain JS, no build step, Three.js. Most good kart repos use React/Vite; we take their **ideas and algorithms**, not their framework.
3. **Licenses:** we only copy code from MIT/CC0-type repos, credited in THIRD_PARTY_NOTICES.md. **We never copy assets** (models, textures, sounds) from "Mario Kart" fan repos, because those are Nintendo's. Repos without a license are **look-only**.
4. **Visual quality comes from art + lighting + effects, not engine code.** The fan repos look good because of Nintendo art. Our art comes from CC0 packs (Kenney, Quaternius, Poly Haven) plus our own characters (TRELLIS.2 → Mixamo).

---

## Reference repos (what to take from each)

**The license is a guess until the Phase 0 audit checks it.**

| Repo | Stack | Take | Don't take |
|---|---|---|---|
| **pmndrs/racing-game** | React Three Fiber, CC0 assets | Effects (dust, trails, skid marks), HUD/intro polish, tuning-panel workflow, camera feel | React structure |
| **Mario-Kart-3.js** (forks: 0xikarus, bunbolabs, Pengiie) | three.js, MIT | Hold-to-drift + counter-steer + mini-turbo logic, flame/boost shaders, drift particles | Any model, texture, sound, name |
| **Nathan-Richard-21/Mario-Kart-game** | three.js + GSAP, MIT | GSAP menu animations, time-trial mode, mobile touch layout | Any Nintendo asset or branding |
| **thatshaman/CharrioKart** | Vanilla JS + three.js + howler (**our stack**) | Gamepad/mobile input handling, track/lap structure | Look-only until license confirmed |
| **samwillis/pingbin-cart** | R3F, MIT | Original-character kart presentation, car color customization, track map | React structure |
| **Colyseus Karts** (Colyseus docs demos) | three.js | Item boxes, rockets, hold-to-drift mini-turbo feel | Netcode (we're local) |
| **tim4724/Stacker-Party, Tetris-Party** | Vanilla JS, node:test, Playwright (**our architecture**) | Phone gestures + haptics, controller UX, Playwright visual-snapshot tests | |
| **Air Jam** (phone-controller framework) | React | Idea: a strict schema for phone → console input messages | The framework |
| **FlakeOrg/Wii-Menu, i0x0/channelpage** | Web | Channel-grid layout ideas only | Anything Nintendo |
| **adrenak/tork, benmcinnes/arcadevehiclephysics** | Unity C# | Arcade physics concepts (raycast suspension, drift curves, boost) to port into JS | |
| **OpenWii** (already credited) | JS | Current driving code base | |

**Art: no manual downloads.** Claude Code fetches everything straight from GitHub. All of these are CC0, so they're free and commercial use is OK:

| Source (GitHub) | What | Why |
|---|---|---|
| **KayKit-Game-Assets** (e.g. KayKit-Character-Pack-Adventures-1.0, -Skeletons-1.0) | Stylized, rigged, animated characters on one shared rig | Best-looking free toy-style characters; KayKit's 100+ free animations (idle, cheer, wave, defeat, dash…) fit them |
| **ToxSam/open-source-3D-assets** + Open Source Avatars | 900+ CC0 GLB/glTF models and VRM avatars (mostly by Polygonal Mind) | Large pool of high-quality characters and props |
| **KenneyNL/Starter-Kit-Racing** | Racing starter with vehicle models | CC0 karts/vehicles in a clean toy style |
| Kenney / Quaternius / Poly Haven | Track props, nature, skies, textures | Environment art for the tracks |

The Tripo/Mixamo character pipeline is **dropped**.

---

## Phases

| # | Who | What | Status |
|---|---|---|---|
| 0 | Claude Code | **Reference audit:** clone the repos, check licenses, write `.claude/docs/REFERENCE-AUDIT.md`. No game changes. | [ ] |
| 1 | You + Claude Code | Test the current build on a real phone and TV, then build the **theme switch** (Light/Dark/Auto) | [ ] |
| 2 | Claude Code | **Kart feel v2:** sphere controller, 3-tier drift, counter-steer, boost flames, skid marks, dust, speed lines, camera juice, tuning panel. Old handling behind "Classic handling". | [ ] |
| 3 | Claude Code | **Kart look v2:** toon + outline + bloom, lighting per track, CC0 art pass on tracks | [ ] |
| 4 | Claude Code | **Phone remote v2:** tilt-to-steer "wheel" mode, haptics on drift tiers/hits, better touch layout | [ ] |
| 5 | Claude Code | **Items (original):** item boxes plus 4–5 original items | [ ] |
| 6 | Claude Code | **Home menu next-gen:** Wii-style channel grid + curved dock + live previews (board D) | [ ] |
| 7 | Claude Code | **New cast + karts:** import the CC0 characters/karts picked in the Phase 0 audit (no manual work) | [ ] |
| 8 | Claude Code | Party Games, then Camera games (PLAN-PARTY.md) | [ ] |
| 9 | Claude Code | 4-player split screen | [ ] |

**Token rules** (in CLAUDE.md): docs are updated once per phase, not per subtask. Only HANDOFF.md is updated by default, and only with targeted edits.

Each phase's prompt is written **after** the previous report is reviewed in the planning chat. Phase 0 decides what Phases 2–5 actually take.

---

## Phase 0 prompt: reference audit (send to Claude Code now)

```
Read CLAUDE.md, .claude/docs/HANDOFF.md and .claude/docs/REBUILD-PLAN.md first
(no summary needed), then do the task below.

TASK: Reference audit. RESEARCH ONLY - do not change any game, menu,
server or test code in this phase.

1. Clone these public repos into a temp folder OUTSIDE our repo
   (e.g. /tmp/refs). Never commit them. If a repo can't be found, search
   GitHub for the closest match and note it.
   - pmndrs/racing-game
   - 0xikarus/Mario-Kart-3.js (and any original upstream you can find)
   - Nathan-Richard-21/Mario-Kart-game
   - thatshaman/CharrioKart
   - samwillis/pingbin-cart
   - tim4724/Stacker-Party and tim4724/Tetris-Party
   - the Colyseus Karts demo source (from the Colyseus docs/GitHub)
   - FlakeOrg/Wii-Menu
   - adrenak/tork (concepts only, C#)

2. For EACH repo record: exact license (read the LICENSE file - "no
   license" means look-only), stack, three.js version, and whether it
   contains Nintendo assets/names (we may never copy those).

3. Compare against OUR code, area by area, and say who does it better
   and why, with file paths on both sides:
   a. Kart controller: drift start, counter-steer, mini-turbo tiers,
      boost, collisions, off-road, jumps/landing
   b. Effects: drift sparks, boost flames, skid marks, dust, speed lines
   c. Camera: follow, FOV with speed, drift offset, shake
   d. Rendering: toon/outline, bloom, lighting, sky, shadows
   e. Items, AI racers, lap/checkpoint logic, HUD, minimap
   f. Phone controller: tilt steering, haptics, gestures, latency
   g. Menus: animation, channel grid, transitions
   h. Tests: visual snapshot testing (Playwright), test structure
   i. OUR CURRENT LOOK: run the app headless and screenshot the home
      screen, the character select, and the race start + mid-race on
      every track. Save them to docs/screenshots/audit-before/. List
      the top visual problems. Known ones: the race camera starts off
      the track with the kart not visible; the ground is one giant
      repeating brick texture; the track floats on pillars over an
      empty plain; the select screen runs at ~21 fps; the debug overlay
      (ping/fps) shows by default.
   j. ASSETS (CC0 only, fetched from GitHub - no manual downloads):
      look at KayKit-Game-Assets (character packs + animations),
      ToxSam/open-source-3D-assets / Open Source Avatars, and
      KenneyNL/Starter-Kit-Racing. Verify each LICENSE file. Shortlist
      4-8 characters (rigged, with idle/cheer/wave/defeat-type
      animations or compatible with a CC0 animation set) and 2-4 karts
      that match one consistent toy style. Render a lineup to
      docs/screenshots/audit-assets/ and note file sizes and tri counts.
      Do NOT add them to the game yet.

4. Write .claude/docs/REFERENCE-AUDIT.md with:
   - a license table (repo, license, can copy code? yes/no/look-only)
   - per area: "Ours vs best reference", the specific technique to adopt,
     and whether to PORT CODE (allowed license + credit) or REIMPLEMENT
     from the idea
   - a top-10 list of upgrades ranked by "how much better it feels" vs
     effort, each with an estimate (S/M/L)
   - risks (licenses, three.js version upgrade, performance on a laptop)
   - a recommendation: should we upgrade three.js first, and to which
     version (check what postprocessing and three.quarks latest need)

5. Push only .claude/docs/REFERENCE-AUDIT.md and the audit screenshots.
   Don't commit any downloaded assets or cloned repos. No other changes.

REPORT BACK: the license table, the top-10 list, the asset shortlist,
and the three.js upgrade recommendation.
```

**After it finishes:** paste the report into the planning chat, and the Phase 1/2 prompts get written from it.
