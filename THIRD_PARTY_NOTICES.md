# Third-party notices

Couch Console includes assets and code adapted from the projects below. This list covers only what is
still in the project (unused files were removed in Phase 53).

## Quaternius Ultimate Animated Character Pack

- Source: https://quaternius.com (Quaternius, "LowPoly Models by @Quaternius")
- Used in: `public/assets/quaternius-characters/` (glTF models and `License.txt`), the racers of
  Turbo Karts (`public/js/console/games/turbo-karts/ow-kart/characters.js`)
- License: CC0 1.0 Universal (public domain dedication), https://creativecommons.org/publicdomain/zero/1.0/
  Credit is not required but given with thanks. The pack's `License.txt` is kept next to the models.

## Kenney: Toy Car Kit and Racing Kit

- Source: https://kenney.nl (Kenney)
- Used in: `public/assets/car-kit/` (the karts, the item box, the coin, two trees: 12 models and their
  colour texture) and `public/assets/racing-kit/` (11 trackside models: grandstand, tents, flags, banners,
  light post, pylon, billboard). Each kit's `License.txt` is kept next to its models.
- License: CC0 1.0 Universal (public domain dedication). Credit is not required but given with thanks.

## Quaternius: Ultimate Pirate Kit

- Source: https://quaternius.com (Quaternius)
- Used in: `public/assets/pirate-kit/glTF/` (16 models: palms, rocks, cliffs, houses, ships, a dock, barrels,
  a chest and the sea monster of the Pirate Cove track). `rdf.rdf` keeps the license marker.
- License: CC0 1.0 Universal (public domain dedication). Credit is not required but given with thanks.

## Libraries and services the pages load

- **three.js** (MIT, https://threejs.org): served from `node_modules` (3D games).
- **pdf.js** (Apache-2.0, https://mozilla.github.io/pdf.js/, `pdfjs-dist`): served from `node_modules` (PDF slides).
- **Nunito** font (SIL Open Font License, Google Fonts): loaded from Google Fonts by both pages.
- **YouTube** (Music and Video): played with YouTube's own embedded player under YouTube's terms of service; nothing is downloaded or stored.
- **Poly Haven** (CC0, https://polyhaven.com): optional, only if you add files to `public/assets/polyhaven/`.

## OpenWii

- Source: https://github.com/pattssun/OpenWii
- Used in:
  - `public/js/console/pointer/gyro-pointer.js` (from `core/pointer.js`)
  - `public/js/console/pointer/orientation.js` (from `core/orientation.js`)
  - `tests/gyro-pointer.test.mjs` (from `core/core.test.mjs`)
  - `public/js/console/games/turbo-karts/karts-fx.js` (drift sparks, smoke, sparkle bursts and the boost
    flame, adapted from `games/mario-kart/race-effects.js` and `boost-effect.js`)
  - `public/js/console/games/turbo-karts/karts-materials.js` (procedural asphalt with normal/roughness maps
    and tyre-wear shader, adapted from `games/mario-kart/materials.js`)
  - Techniques (no code copied verbatim) in `karts-look.js` (PBR Neutral tone mapping,
    multisampled half-float effect chain) and `turbo-karts.js` (fill light, tight follow-shadow)
  - `public/js/console/games/juicy-slash.js`, `juicy-slash-rules.js`, `tests/juicy-slash.test.mjs`
    (from `games/fruit-ninja/game.js`, `logic.js`, `logic.test.mjs` and `core/trail.js`)
  - `public/js/console/games/alien-strike.js`, `alien-strike-rules.js`, `tests/alien-strike.test.mjs`
    (from `games/alien-attack/game.js`, `logic.js`, `logic.test.mjs`)
  - `public/js/console/games/ow-audio.js` (from `core/audio.js`, the synthesized sound effects engine)
  - `public/js/console/games/turbo-karts/ow-kart/` and `turbo-karts.js` (Turbo Karts): `rules.js`, `frame.js`,
    `contact.js` and `track-model.js` follow `games/mario-kart/logic.js`, `visual-frame.js`,
    `contact.js` and `track.js` (physics, handling, drifting, items, computer drivers, camera pose);
    `turbo-karts.js` follows `game.js` (camera smoothing, HUD, race flow); `tests/ow-kart-rules.test.mjs`
    is adapted from `logic.test.mjs`
  - `public/js/console/games/turbo-karts/ow-kart/stadium/` (the Grand Stadium scenery, from `world.js`,
    `atmosphere.js`, `materials.js`, `stadium-*.js`) and its turf texture `art/turf-v1.png`.
    Signs, sponsors, lettering and the tower statue were replaced with original ones, and the
    course layout (`stadium/stadium-def.js`) is our own original shape, not OpenWii's.
- Only OpenWii's MIT-licensed code and its own generated turf texture were used. None of its
  Nintendo-derived models, character art, item art, names or sounds are included or imitated.
- License: MIT

```
MIT License

Copyright (c) 2026 Patrick Sun

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Poly Haven (CC0)
HDRIs: kloofendal_48d_partly_cloudy, snowy_field, cloud_layers, solitude_night, rogland_moonlit_night. Textures: asphalt_03, concrete_pavement_03 and ground sets. https://polyhaven.com, CC0.
