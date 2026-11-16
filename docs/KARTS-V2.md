# Turbo Karts v2: design (waiting for your OK, nothing is built)

Read first: `.claude/docs/REFERENCE-AUDIT.md`, `.claude/docs/HANDOFF.md`, `public/games/turbo-karts.js`.
The race rules (`ow-kart/rules.js`, fixed 120 Hz, tested) stay. The socket protocol does not change.

## 1. Art direction: "toys on the playroom floor"
Every track is a toy set someone built: moulded plastic, rubber, felt and a few lamps. Nothing photographic.

| | Rule |
|---|---|
| Palette | Style-guide colours only: Cushion `#FF8A3D`, Sky `#3FA9FF`, Pop `#FF5C8A`, Mint `#2FD6A4`, Butter `#FFC93C`; road Slate `#4A5370` with Cream `#FFF6E8` lines; shadows and outlines Ink `#25304A` (no black). Each track takes 2 of the 5 as its own pair. |
| Materials | Three roles, one file: **plastic** (roughness 0.5: karts, pilots, props), **rubber/felt** (0.9: tyres, road, ground), **glow** (emissive, not tone-mapped: boost, sparks, gems, lamps). Every imported model is re-skinned through the same function, so Kenney, KayKit and Quaternius parts match. |
| Lighting | One warm key light with shadows plus a cool sky fill. Three presets: Day, Dusk, Night. Painted gradient skies; fog fades the ground into the horizon colour. |
| Glow | Bloom only on the glow role. Drift tiers stay blue, orange, purple. No lens flares, no depth blur. |

## 2. Pilots and karts (CC0) — helmeted pilots (your choice)
Comparison picture: `.claude/docs/v2-compare.png` (now vs new, Dash + Speedster and Mimi + Roadster, Day light).

| Pack | Used for | Status |
|---|---|---|
| KayKit Adventurers 1.0 (Knight body, 41-bone rig, clips) | the body under every pilot's suit | already in the repo: `public/assets/cast/knight.glb` |
| Kenney Toy Car Kit | the 4 karts, item box, coin | licence in the repo; kart files return from git history |
| KayKit City Builder, Space Base, Halloween Bits; Kenney Racing Kit; Quaternius Pirate Kit | scenery (section 3) | on GitHub or already in |
| Nature props (rocks, cacti, pines, snow trees) | park, canyon, peaks | no manual downloads: KayKit Medieval Hexagon Pack (GitHub) where it fits, the rest built in code with the plastic material |

**Pilot = one body, eight helmets.** Nothing medieval is visible: the head, helmet, cape, weapons and shields of the pack are hidden.
- **Suit:** the body is repainted by bone: suit in the identity colour, lighter forearms and shins, white gloves, dark boots, darker belt. Same plastic material and outline as the karts.
- **Helmet:** the eight toy helmets we already have, one per pilot, sit on the head bone. The visor is closed, dark and glossy: no face.
- In multiplayer the suit and kart take the player colour, as now.

| Pilot (id kept) | Helmet shape and decals | Suit | | Kart | Model |
|---|---|---|---|---|---|
| Dash | round, star, antenna ball | `#2F80ED` | | Speedster | `vehicle-speedster` |
| Bruno | bear ears, paw | `#E8590C` | | Roadster | `vehicle-vintage-racer` |
| Finn | shark fin, stripes | `#12B8A6` | | Dragster | `vehicle-drag-racer` |
| Mimi | cat ears, heart, whiskers | `#E64980` | | Racer | `vehicle-racer` |
| Hopper | bunny ears | `#7C5CFF` | | | |
| Blaze | rocket nose cone, flames | `#F03E3E` | | | |
| Rex | dino plates | `#2FBF71` | | | |
| Zap | mohawk, bolt | `#5B3FD9` | | | |

- Clips (already trimmed in `knight.glb`): `sit` (driving, plus our lean and arms to the wheel), `idle` (select), `cheer` (pick, win), `wave`, `hit`, `defeat`.
- Karts are repainted in the identity colour (only the paint; greys, glass and lights stay).
- **Your own models:** `public/assets/custom/manifest.json` lists `{ id, file, scale, seat, clips }`. Load order: custom, then pack, then today's code-built pilots and karts (kept as the fallback).
- **Open point (see the picture):** the Kenney cars have no cockpit, so the pilot sits on top, and they are boxy beside our rounded karts. Option: new pilots in today's code-built karts.
- Credits: one entry per pack in `THIRD_PARTY_NOTICES.md`, licence file kept beside the models.

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

## 8. Build order (one step per run; S under half a day, M about a day, L several days)
| # | Step | Effort |
|---|---|---|
| 1 | Side-by-side picture `.claude/docs/v2-compare.png` (done). **Your choice** | S |
| 2 | Art tokens: palette, three material roles, light presets in one file; apply to karts and items | S |
| 3 | Pilots in the race, select screen and podium | M |
| 4 | Karts in, plus the custom-model manifest | S |
| 5 | Feel A: steering and grip curves, front wheels, camera roll (phone test) | S |
| 6 | Feel B: brake and off-road skids, speed lines, landing dip | S |
| 7 | Engine, drift and boost loops | M |
| 8 | Quality levels, real-pixel rendering, F3 budget line | S |
| 9 | Hazard system in the rules, with tests | M |
| 10-13 | Track passes in pairs: Park + Canyon, Peaks + Clouds, City + Avenue, Cove + Stadium | M each |
| 14 | Four new items | M |
| 15 | Time Trial and ghost | M |
| 16 | Music sequencer and ten songs | M |
| 17, 18 | Moon Base, Spooky Hollow | L each |
| 19 | Battle: backwards-driving test (S), then Coin Clash and two arenas | L |
| 20 | Cups of five, README and notices check | S |
