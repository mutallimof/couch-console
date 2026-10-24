# Third-party notices

Couch Console includes code adapted from the projects below.

## Quaternius Ultimate Animated Character Pack

- Source: https://quaternius.com (Quaternius, "LowPoly Models by @Quaternius")
- Used in: `public/assets/quaternius-characters/` (glTF models and `License.txt`), the racers of
  Turbo Karts GP (`public/js/console/games/ow-kart/characters.js`)
- License: CC0 1.0 Universal (public domain dedication), https://creativecommons.org/publicdomain/zero/1.0/
  Credit is not required but given with thanks. The pack's `License.txt` is kept next to the models.

## OpenWii

- Source: https://github.com/pattssun/OpenWii
- Used in:
  - `public/js/console/pointer/gyro-pointer.js` (from `core/pointer.js`)
  - `public/js/console/pointer/orientation.js` (from `core/orientation.js`)
  - `tests/gyro-pointer.test.mjs` (from `core/core.test.mjs`)
  - `public/js/console/games/karts-fx.js` (drift sparks, smoke, sparkle bursts and the boost
    flame, adapted from `games/mario-kart/race-effects.js` and `boost-effect.js`)
  - `public/js/console/games/karts-materials.js` (procedural asphalt with normal/roughness maps
    and tyre-wear shader, adapted from `games/mario-kart/materials.js`)
  - Techniques (no code copied verbatim) in `karts-look.js` (PBR Neutral tone mapping,
    multisampled half-float effect chain), `turbo-karts.js` (chase camera composition, fill
    light, tight follow-shadow) and `karts-rules.js` (three drift-charge levels, smoothed steering)
  - `public/js/console/games/juicy-slash.js`, `juicy-slash-rules.js`, `tests/juicy-slash.test.mjs`
    (from `games/fruit-ninja/game.js`, `logic.js`, `logic.test.mjs` and `core/trail.js`)
  - `public/js/console/games/alien-strike.js`, `alien-strike-rules.js`, `tests/alien-strike.test.mjs`
    (from `games/alien-attack/game.js`, `logic.js`, `logic.test.mjs`)
  - `public/js/console/games/ow-audio.js` (from `core/audio.js`, the synthesized sound effects engine)
  - `public/js/console/games/ow-kart/` and `ow-kart.js` (Turbo Karts GP): `rules.js`, `frame.js`,
    `contact.js` and `track-model.js` follow `games/mario-kart/logic.js`, `visual-frame.js`,
    `contact.js` and `track.js` (physics, handling, drifting, items, computer drivers, camera pose);
    `ow-kart.js` follows `game.js` (camera smoothing, HUD, race flow); `tests/ow-kart-rules.test.mjs`
    is adapted from `logic.test.mjs`
  - `public/js/console/games/ow-kart/stadium/` (the Grand Stadium scenery, from `world.js`,
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
