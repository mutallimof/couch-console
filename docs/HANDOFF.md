# HANDOFF (read this first; keep under 60 lines, edit lines, don't rewrite)

## What it is
A phone-controlled, Wii-style couch console in the browser. The laptop/TV shows a home screen with
tiles and games; phones join by QR code and act as remotes (D-pad, tilt pointer, kart pad, camera).
Everything must be original: no Nintendo names, art, sounds or logos.

## Stack
- Node 20+ / Express 5 / Socket.IO 4 (`server.js`, `server/*.js`): serves pages, relays phone input.
- Plain HTML/CSS/JS ES modules, no framework, no build step (`public/`). Games run in the TV browser.
- three.js (3D games), postprocessing, three.quarks (particles), GSAP, Pixi (2D layer), howler (sound).
- Libraries are served from `node_modules` via `/vendor/*` routes and the import map in `public/console.html`.
- Tests: `npm test` (node:test; e2e files use Playwright and skip without it).

## How the owner runs it
`npm install` (after every pull), `npm start`, open the printed link on the laptop, scan the QR with a
phone. Local https setup: `npm run certs`. Remote link: `cloudflared tunnel --url http://localhost:3000`.
Debug readout on the TV: F3 or Settings → Debug readout (a `?debug` link does not turn it on; phone: `&debug=1`, not remembered). Full guide: `README.md`.

## Current state (Phase 1 done, waiting for the owner's phone/TV test)
- Home screen, profiles, party hub (photos, music, present), 11 arcade/camera games, theme switch (Light/Dark/Auto).
- Turbo Karts: 8 tracks (Sunny Park, Dune Canyon, Frosty Peaks, Neon City, Neon Avenue, Pirate Cove,
  Cloud Gardens, Grand Stadium), 8 racers, 6 items, 3-tier drift turbo, CPU drivers, 1-2 human players.
  Rules are in `public/js/console/games/turbo-karts/ow-kart/rules.js` (from OpenWii, MIT, credited in
  `THIRD_PARTY_NOTICES.md`). No controller rewrite (audit decision).
- three 0.186.1 (exact pin) + postprocessing 6.39.5 + three.quarks 0.17.1; `/vendor/three.core.js` and `quarks.core` routes in `server.js`. Don't bump three without checking postprocessing's peer range (< 0.187).
- Select screen draws its 3D previews in small canvases (no full-window multisampled canvas).
- Grand Stadium rebranded (Couch Console sofa emblem, TURBO KARTS, COUCH lettering); racer Daisy is now Clover.
- Reference audit done: `docs/REFERENCE-AUDIT.md` (licenses, comparison, top-10, risks).

## Known issues
- Race looks: photographic skies clash with the toy art, flat empty ground, floating road, glossy road
  (Phase 3). HUD item slot empty-looking, minimap translucent, track-select cards have no previews.
- No skid marks, little camera juice (Phase 2).
- Phone tilt steering is raw (no smoothing/dead zone). iPhones can't vibrate (Phase 4).
- Headless checks: all 8 tracks and the other games load with no console errors; real-GPU fps is still unmeasured.
- Grand Stadium is the heaviest scene; GTAO + 4x MSAA may be slow on weak laptops (auto-fallback under 40 fps).
- Headless/software-GL numbers are not real fps; check on the real laptop (F3).

## Progress (overnight run, 9 parts; one commit per part)
- Part 1 design system: done (tokens in theme.css, components in components.css)
- Part 2 Turbo Karts race look: done (karts-sky/terrain/props/skids/items/tuning.js, karts.css HUD, F4 lil-gui panel, shots in docs/screenshots/tracks/)
- Part 3 KayKit cast: done (8 racers in public/assets/cast, new select screen with track cards, 3D podium, hero icon re-rendered)
- Part 5 phone remote v2: code done (haptics.js, wheel smoothing, kart pad v2), committed with Part 5

## Phases (from `docs/REBUILD-PLAN.md`)
| # | What | Status |
|---|---|---|
| 0 | Reference audit | done |
| 1 | Foundation: main merge, HANDOFF, three 0.186.1 upgrade, select fps, debug overlay, stadium rebrand | done (owner to test) |
| 1b | Test on real phone and TV, theme switch (the theme switch already exists) | owner |
| 2 | Kart feel v2 on top of `rules.js`: camera juice, skid marks, slip angle, tuning panel (lil-gui) | todo |
| 3 | Kart look v2: sky/ground/fog/road art pass per track, HUD, track-select previews | todo |
| 4 | Phone remote v2: tilt smoothing, haptic roles | todo |
| 5 | Items (original) | todo |
| 6 | Home menu next-gen (channel grid, curved dock) | todo |
| 7 | New cast (KayKit CC0) and karts | todo |
| 8 | Party games, then camera games (`PLAN-PARTY.md`) | todo |
| 9 | 4-player split screen | todo |

## Where things are
- Plans: `docs/PLAN.md`, `docs/PLAN-PARTY.md`, `docs/REBUILD-PLAN.md`; decisions: `docs/DECISIONS.md`; style: `docs/STYLE.md`.
- Audit screenshots: `docs/screenshots/audit-before/`, `audit-assets/`, `audit-three-trial/`, `after-upgrade/`.
- Workflow: phases in test groups; commit `Phase N: <name>`; docs updated once per phase (this file only by default).
