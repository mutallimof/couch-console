# Couch Console: style guide

> **Two looks to choose from (waiting for the user's pick).** A) LIGHT: pastel gradient and frosted glass (the default now). B) DARK: the "plum living room at dusk". Same tiles, icons, type and layout; only the room and the glass change. Try B on the TV with `?theme=dark`. Screenshots: `docs/screenshots/home-options-light-vs-dark.png`, `style-board-light.png`, `style-board-dark.png`. When one is chosen, the other is deleted and every screen (pairing, settings, games' menus, phone) follows it.
> The home screen is ONE grid of big tiles (Turbo Karts large, then Arcade, Channels, Photos, Music, Present, Settings; folders with no games are hidden); a folder opens as its own screen (B = back).

One identity for everything: the TV, the phone remote, the games, the sounds. The references are the clean, glossy look of living-room console menus and bright toy-diorama icons; they are STYLE references only (no artwork, logos, characters or names are copied).
Style board: `docs/screenshots/style-board.png` (source `.claude/docs/style-board.html`, which uses the real `public/css/theme.css`).

## Idea: a bright toy-box on frosted glass
Light, airy and glossy. A soft pastel gradient room, frosted-glass panels, rounded glossy tiles with a highlight and a soft shadow, and small isometric toy dioramas as icons. Games themselves are saturated, bright and toy-like. Everything is round and springy.

## Mood
Friendly, clean, a bit shiny. Lots of air, big targets (read from a couch, 3 m away). Color means something: a player, a button, a winner.

## Color
| Name | Hex | Use |
|---|---|---|
| Cloud | `#F3F6FB` | base; the background is a soft gradient of peach, sky and lilac over it |
| Ink | `#25304A` | text |
| Muted | `#66728C` | hints, secondary text |
| Cushion | `#FF8A3D` | primary accent, the logo, the focus on buttons |
| Sky | `#3FA9FF` | links, pointer, **P1** |
| Pop | `#FF5C8A` | alerts, hits, **P2** |
| Mint | `#2FD6A4` | success, ready, **P3** |
| Butter | `#FFC93C` | coins, winners, **P4** |

Player colors never change anywhere (cursor, chip, kart marker, avatar ring, results). White text only on saturated tiles; Ink on glass. No pure black; shadows are blue-grey (`rgba(60,80,130,.18)`).

## Typography
- **Fredoka** (display): logo, titles, tile names, HUD numbers (600/700).
- **Nunito** (text): body, hints, buttons' small text (400/700/900).
- TV scale (1920 px wide): 72 / 48 / 32 / 24; smallest 22 px. Phone: 32 / 24 / 18 / 16.
- Sentence case, never all caps. Tabular figures for changing numbers.

## Surfaces
- **Background**: `.theme-bg` (soft peach / sky / lilac gradient).
- **Glass panel** `.glass`: white 55 %, blur 18 px, a 1.5 px white edge, a soft shadow, radius 32.
- **Glossy tile** `.gloss`: a color gradient, a white sheen on the top half, an inner bottom edge, a soft floor shadow, radius 28. Hover or focus: lifts 6 px, grows 4 %, a white ring plus a colored halo.
- **Round buttons** `.round-btn`: the sidebar and the dock.
- Radius by size: 14 chips · 22 buttons · 28 tiles · 32 panels.
All in `public/css/theme.css`.

## 3D (games, icons)
- Bright, saturated plastic toys: `roughness 0.45–0.6`, strong key light, soft studio fill, ink outline, cartoon banding, bloom only on emissive things.
- Lighting presets: **Day** (warm sun), **Dusk** (orange key, violet fill), **Night** (blue key, neon lamps, bloom up; Neon Avenue), **Studio** (icons and the select screen: soft white box light with a warm key).
- Icons are isometric toy dioramas: a small tiled island showing the game, rendered by `scripts/render-icons.mjs` so they all match (same camera, same light, same tile base).

## Motion
- Springy and smooth: GSAP, `back.out(1.6)` for arrivals (200–320 ms), `power2.in` for leaving (120–160 ms).
- Tiles lift and glow on hover/focus; presses squash to 0.96; the pointer eases.
- Only transform and opacity animate. Reduced motion: fades only. One big moment per screen (the boot, the winner podium).

## Sound
Soft and bubbly: Kenney CC0 UI clicks, soft impacts, short major jingles (howler). Menu moves quiet, choices medium, wins loud. The synth sounds stay as the fallback.

## Logo
A wordmark in Fredoka 700, "couch console", with a glossy sofa glyph (two cushions and a backrest in Cushion orange with a white sheen) and a play triangle floating above it. Flat one-color version for 24 px. Animated version: cushions bounce in one after the other, the triangle pops and glows, the wordmark slides up.

## Don'ts
No Nintendo look-alikes (no "Wii"/"Mii", no channel-tile clones, no copied artwork, fonts or sounds). No dark UI chrome, no grey boxes, no thin light fonts, no all-caps labels.
