# Turbo Karts v2: design (waiting for your OK, nothing is built)

Read first: `.claude/docs/REFERENCE-AUDIT.md`, `.claude/docs/HANDOFF.md`, `public/games/turbo-karts.js`.
The race rules (`ow-kart/rules.js`, fixed 120 Hz, tested) stay. The socket protocol does not change.

## 1. Art direction: "toys on the playroom floor"
Every track is a toy set someone built: moulded plastic, rubber, felt and a few lamps. Nothing photographic.

| | Rule |
|---|---|
| Palette | Style-guide colours only: Cushion `#FF8A3D`, Sky `#3FA9FF`, Pop `#FF5C8A`, Mint `#2FD6A4`, Butter `#FFC93C`; road Slate `#4A5370` with Cream `#FFF6E8` lines; shadows and outlines Ink `#25304A` (no black). Each track takes 2 of the 5 as its own pair. |
| Materials | Three roles, one file: **plastic** (roughness 0.5: karts, pilots, props), **rubber/felt** (0.9: tyres, road, ground), **glow** (emissive, not tone-mapped: boost, sparks, gems, lamps). Every imported scenery model is re-skinned through the same function, so Kenney, KayKit and Quaternius parts match. |
| Lighting | One warm key light with shadows plus a cool sky fill. Three presets: Day, Dusk, Night. Painted gradient skies; fog fades the ground into the horizon colour. |
| Glow | Bloom only on the glow role. Drift tiers stay blue, orange, purple. No lens flares, no depth blur. |

## 2. Pilots and karts: today's code-built ones stay (decided)
Decision after the comparison picture (`.claude/docs/v2-compare.png`): no KayKit bodies, no Kenney karts. The eight helmeted pilots
with a visible face and the four toy karts stay as they are (`karts-pilot.js`, `karts-toykart.js`): original, no outside assets,
names and ids unchanged. They only move to the shared material roles of section 1.

**Animations, made in code.** The pilot rig already has `drive`, `idle`, `wave`, `cheer`, `defeat` and `hit`. v2 reworks each one
and makes sure it plays at the right moment:

| Clip | Motion | Plays |
|---|---|---|
| Idle bob | body rises and sinks, head tilts, blink | select screen, start grid, podium |
| Wave | one arm up, hand swings, head turns to the camera | when a player picks the pilot |
| Cheer | fist pump with a small bounce, ears and fins bounce | finishing 1st to 3rd, podium |
| Hit wobble | head and torso shake and settle (spring) | hit by an item or a hazard |
| Slump | shoulders drop, head down, arms hang | finishing 4th or lower, cup lost |

Springs only, nothing allocated per frame, same clips for all eight pilots.

**Your own models later:** `public/assets/custom/manifest.json` lists `{ id, file, scale, seat, clips }`. Load order: custom model,
then the code-built pilot or kart.

**CC0 packs are for scenery only** (section 3): KayKit City Builder, Space Base and Halloween Bits and Medieval Hexagon Pack
(all on GitHub), Kenney Racing Kit and Quaternius Pirate Kit (already in). No manual downloads: nature props that no pack covers
are built in code with the plastic material. Each pack gets an entry in `THIRD_PARTY_NOTICES.md`, licence file beside the models.

## 3. Tracks
Three hazard types, added to `rules.js` with tests: **patch** (grip or speed zone), **mover** (crosses the road on a timer, spins you), **gust** (side push).

| Track | Theme and scenery | Landmark | Hazard |
|---|---|---|---|
| Sunny Park | picnic lawn, hedges, kites | windmill | beach balls rolling across (mover) |
| Dune Canyon | red rock, cacti, rope bridge | stone arch over the road | tumbleweeds (mover) |
| Frosty Peaks | pines, cabins, ice lake (code-built) | giant snowman | ice sheets (patch) |
| Block City | KayKit city blocks, traffic lights | water tower | toy taxis at one crossing (mover) |
| Sunset Avenue | dusk street, lamps, bunting | Ferris wheel | cones (exists) |
| Pirate Cove | boardwalk, palms, ships | shipwreck | sea monster tail sweep (mover) |
| Cloud Gardens | floating planters, bridges | beanstalk | wind on the bridges (gust) |
| Grand Stadium | night, floodlights, crowd | sofa scoreboard | tyre stacks that move each lap (mover) |
| **Moon Base** (new) | Space Base Bits, craters, long low-gravity jumps | lander and rocket | steam vents that pop you up (patch) |
| **Spooky Hollow** (new) | Halloween Bits, lantern lane, friendly not scary | pumpkin tower | rolling pumpkins (mover) |

Cups become two of five: Sun Cup (day tracks), Star Cup (dusk and night tracks).

## 4. Features
- **Items** (today: Goo, Pulse Orb, Dart, Turbo, Star, Meteor). New: **Magnet** (pulls coins, tugs you toward the kart ahead), **Bubble** (blocks one hit), **Spring** (big hop, boost on landing), **Triple Goo**. Odds depend on your place.
- **Time Trial:** solo, three turbos, no rivals. The kart is recorded 15 times a second; the best run per track is saved in the TV browser and replays as a see-through ghost. Three split points show plus or minus against it, with bronze, silver and gold target times.
- **Battle, "Coin Clash":** 2 to 4 players, 2.5 minutes, two arenas. A hit makes you drop coins; most coins wins, nobody sits out. Arenas are very wide ring tracks so the rules engine is reused. A short test (drive backwards, U-turns) comes before building it.
- **Kart feel v2.** Already in: skid marks, sprung slip angle, drift camera shift, boost pull, shake, F4 panel. Left from the audit: steering that tightens at top speed, grip that lets go at high slip, front wheels that turn, camera roll with steer × speed, a camera dip on landing, skid marks when braking and off-road, speed lines tied to speed. Each is judged on your phone.

## 5. Sound
- **Loops made in code (Web Audio, no files):** engine (two detuned tones through a filter, pitch follows speed), drift (filtered-noise squeal, higher per tier), boost (whoosh plus rising tone). Humans get the full mix, the three nearest rivals a quiet one.
- **Music per track:** a small step sequencer (marimba, bass, drums) with one song per track: key, tempo, two patterns; the final lap plays faster. Original, no licence risk. Override slot: `public/assets/music/<track>.mp3`. If party music is set to keep playing in games, track music stays off.

## 6. Quality rules
- Three levels: **High** (4× MSAA, outline, ambient occlusion, bloom), **Medium** (bloom only), **Low** (no post). Under 50 fps for 3 s steps down one level; Settings can pin a level.
- **Sharp:** the canvas matches the screen's real pixels (ratio up to 2; today the cap of 1.5 softens the picture). Effects are dropped before resolution. No motion blur or depth blur. HUD text stays HTML.
- Every step is checked with F3 on your laptop: 60 fps with 1 and 2 players, at most about 150 draw calls and 300k triangles per view.
- Every step that touches driving is tested on your phone (tilt and buttons, `&debug=1`).

## 7. Reference: pmndrs/racing-game
`LICENSE.md` opened: MIT, "Copyright 2021 pmdrs, contributors". Ideas taken and rewritten, no code copied: camera roll and sway that grow with speed, chassis vibration, checkpoint split times with medals, a second engine sound layer under acceleration. Not taken: its physics vehicle (the audit keeps `rules.js`) and its models or sounds. If a later step ports real code, its MIT notice goes into `THIRD_PARTY_NOTICES.md` in the same commit.

## 8. Build order: four stages (each runs unattended, one commit per step, then you test once)
S under half a day, M about a day, L several days. A stage is pushed and merged to `main` when the full test suite passes.

| Stage | Steps | Status |
|---|---|---|
| A · Look | 2 art tokens (S) → 8 quality levels and real-pixel rendering (S) → 9 hazard system (M) → 10-13 track passes, all 8 tracks (M each) → 3 pilot animations (S) | done, waiting for your test |
| B · Feel and sound | 5, 6 kart feel (S each) → 7 engine, drift and boost loops (M) → 16 music (M) | todo |
| C · Content | 14 new items (M) → 15 Time Trial and ghost (M) → 20 cups for the 8 tracks, README and notices (S) | todo |
| D · Optional (only on your "go") | 17 Moon Base (L), 18 Spooky Hollow (L), 19 Battle (L), 4 custom-model slot (S) | parked |

Hard rule for every stage: nothing Nintendo-like in names, item looks or music.

Stage A notes: the eight tracks keep their code-built scenery (no new packs were needed); landmarks are code-built too.
Block City keeps its own toy towers instead of KayKit city blocks, so every track has one style.
