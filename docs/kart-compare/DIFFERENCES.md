# Turbo Karts vs OpenWii's kart game: what differs (Phase 40)

Reference = OpenWii run locally with its own asset pack, used only to look at (nothing from that pack is in this project,
and the reference screenshots were deleted again). Ours = Turbo Karts, same screen size (960x540), same staged moments
(countdown, drift, boost, item hit, all on the night stadium). The pictures in this folder are ours only:
`ours-before-after-*.png` (before and after the fixes below), `start-ambient-occlusion-on.png` and `cartoon/` (look on and off).

| # | Difference | Kind | Status |
|---|---|---|---|
| 1 | Our night scene was dark (mean brightness about 55-65 vs 90-100) and over-saturated | code fix | **Fixed**: the stadium takes OpenWii's light rig (warm key light 1.7, sky light, fill) and a brighter exposure; brightness now about 70-90 |
| 2 | OpenWii has five moving floodlights that follow the kart (pit lane, crossing, straight) | code fix | **Fixed**: `ow-kart/stadium/lighting.js` |
| 3 | Fog/background: OpenWii uses soft exponential fog | code fix | **Fixed** (stadium) |
| 4 | Ambient occlusion (contact shadows under karts, in corners) | code fix | **Fixed**: GTAO pass in `karts-look.js`, on by default (`?ao=off` or Settings to turn off) |
| 5 | HUD lettering: OpenWii has chunky gold numerals with a dark outline | code fix | **Fixed**: position, countdown and GO! use a gold gradient font with an outline |
| 6 | Boost: our flame was long and the speed lines too strong | code fix | **Fixed**: shorter flame, fainter lines |
| 7 | Item hit: OpenWii shows gold stars bursting around the kart | code fix | **Fixed**: gold sparkle burst on every hit |
| 8 | Camera: same chase pose (ported), same smoothing | n/a | Matches (FOV 57 vs 59: kept, ours is the same pose) |
| 9 | Physics, drift tiers, items, CPU drivers | n/a | Ported code, same numbers |
| 10 | Karts, characters, item boxes, coins: OpenWii uses real Nintendo models with detailed textures; ours are Kenney Toy Car Kit karts and Quaternius characters | needs better art | See `docs/kart-art-options.md` |
| 11 | Course: OpenWii's scene uses the real Nintendo course geometry, textures and signage; ours uses the procedural stadium with our own signs and layout | needs better art | Same scenery code, original layout and names |
| 12 | Surface textures: reference road/asphalt has authored textures; ours is generated asphalt | needs better art | Poly Haven textures (CC0), see `docs/kart-art-options.md` |
| 13 | Sky: reference is a painted night skyline; ours a generated starfield with buildings | needs better art | Poly Haven HDRI (CC0), see `docs/kart-art-options.md` |
| 14 | Crowd and trackside detail: same code, but the source course has hand-made props | needs better art | Free props in `docs/kart-art-options.md` |
| 15 | Audio: OpenWii uses Nintendo recordings; ours synthesised | by design | Original sounds only |

Method note: the capture scripts stage the moments (place the kart, set the drift/boost/hit state) rather than race a
whole lap, because the software renderer in the test sandbox is slow. Mean brightness was measured from the
screenshots to tune item 1.
