# Couch Console: style guide

One identity for everything: the TV, the phone remote, the games, the sounds. Written before the visual upgrade so every step follows it.
Style board (screenshot): `docs/screenshots/style-board.png` (source: `docs/style-board.html`).

## Idea: a toy-box living room at dusk
The room is dim, the TV glows, the toys are bright. Everything on screen should feel like a chunky, soft, painted toy lit by a TV: rounded, springy, warm light, a dark plum room around it. It never feels like a corporate dashboard, and it never copies a console maker (no logos, fonts, sounds or characters from anyone else).

## Mood
Cozy, playful, a little mischievous. Big friendly shapes. Lots of room around things (it is read from a couch, 3 m away). Bright things are rare and mean something (a player, a button to press, a winner).

## Color
| Name | Hex | Use |
|---|---|---|
| Night Den | `#1B1633` | the room: backgrounds (a glow of Plum `#2E2559` in the middle) |
| Plum | `#2E2559` | raised panels, tiles, the phone's background |
| TV Glow | `#FFF3D6` | text and highlights on dark, the "screen light" |
| Cushion | `#FF8A3D` | the primary color: the logo, the focused tile, main buttons |
| Mint | `#3DD9B0` | success, ready, player 3 |
| Pop | `#FF5C8A` | alerts, hits, player 2 |
| Sky | `#5CB8FF` | links, pointer, player 1 |
| Butter | `#FFD95A` | coins, winners, player 4 |

Player colors: P1 Sky, P2 Pop, P3 Mint, P4 Butter (always the same everywhere: cursor, chip, kart marker, results).
Text on Night Den is TV Glow (contrast above 12:1); muted text is TV Glow at 65%. Never pure black or pure white: shadows are Night Den at 50%, highlights are TV Glow.
Light mode does not exist on the TV. The phone page is dark too, so it does not light up a dim room.

## Typography
- **Fredoka** (display): logo, titles, tile names, numbers on the HUD. Weights 600/700. Rounded like the toys.
- **Nunito** (text): body, hints, labels, buttons' small text. Weights 400/700/900.
- Scale for the TV (at 1920 px wide): 96 / 64 / 40 / 28 / 22; the smallest text on the TV is 22 px. On the phone: 34 / 24 / 18 / 16.
- Sentence case everywhere. Labels are never all caps. Big titles get a tiny negative letter-spacing (-0.01em).
- Numbers use tabular figures where they change (timers, scores).

## Shape and material (2D)
- Corner radius by size: 12 (chips) · 20 (buttons) · 28 (tiles) · 40 (big panels). A bigger thing has bigger corners.
- Depth by a soft bottom edge ("the toy sits on the floor"): `0 6px 0 rgba(10,6,30,.45)` plus a blurred shadow. Pressed things sink 4 px.
- Focus is a thick Cushion ring with a glow, never only a color change.

## 3D: materials and lighting presets (Turbo Karts, previews)
- Materials: plastic toys. `roughness 0.45–0.6`, no metal except hubs. Colors saturated, never grey-brown.
- Always: ink outline pass, banded shading (cartoon), PBR Neutral tone mapping, bloom only on emissive things (flames, lights, coins).
- Presets (`def.lighting`): **Day** (warm sun `#FFE9C7`, sky fill, soft shadows) · **Dusk** (orange key, violet fill) · **Night** (blue moon key, warm lamp pools, bloom up) · **Stage** (the select screen: bright warm key, peach fill, golden rim).
- Skies and ground come from Poly Haven (CC0); the toy characters and karts stay clean and bright against them.

## Motion
- One curve for "alive": `cubic-bezier(.2,.9,.3,1.25)` (a small overshoot), 180–280 ms. Leaving things use `ease-in` and are faster (120–160 ms).
- Squash and stretch on presses and landings (scale 0.96 down, 1.04 up). Springs for things you throw (cursor, dropped cards).
- Only `transform` and `opacity` move. Nothing moves without a reason: no looping decoration except the logo on the boot screen and the idle focus bob.
- `prefers-reduced-motion`: no overshoot, no loops, fades only.
- Orchestrated moments (the boot, a winner) get the big animation; everything else stays quick.

## Sound
Soft and bubbly: wooden clicks, marimba-like blips, rubbery boings, short major-key jingles. No harsh beeps, nothing above a hair-dryer's loudness. Hierarchy: menu moves are quiet (-18 dB), choices medium, wins loud. Source: Kenney CC0 packs (`public/assets/sounds/kenney/`); the synth sounds stay as the fallback.

## Logo direction
A wordmark in Fredoka 700, "couch console", with a **sofa glyph**: two round cushions and a backrest in Cushion orange, and a small TV-glow play triangle floating above it (the console on the couch). It must work as one flat color and at 24 px. Animated version (GSAP): the cushions bounce into place one after the other, the triangle pops in and glows, the wordmark slides up with a small overshoot.

## Don'ts
No Nintendo look-alikes (no "Wii"/"Mii", no channel-tile clones, no their sounds). No pure black, no grey UI, no thin light fonts, no all-caps labels, no gradients on everything: one glow per screen.
