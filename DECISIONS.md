# Decisions log

Choices made without asking during the autonomous run of Phases 25–29 (the user asked me
not to stop for questions). Each entry says what was decided and why. Newest at the bottom.

## Phase 25: Character select
- **Showroom layout:** each player's panel shows the character standing on a podium *and* the chosen kart on a turntable with that character driving, side by side, so one preview covers both choices.
- **Poses:** the pirate pack has no dedicated "victory" clip, so picking a character plays **Wave** and pressing Ready plays **Yes** (a cheer). The code-built animals get a code-made idle (breathing and sway) and a happy spinning hop.
- **Rendering:** the previews are drawn by the game's own 3D renderer into each panel's preview box (the canvas is see-through during the select screen), not by extra WebGL canvases, so models load once.
- **Short screens:** a compact layout below 640 px tall, so a 960×540 laptop window fits everything.

## Phase 26: Design pass (impeccable audit → polish, Emil's animation review)
- **No product interview:** impeccable's setup wants to ask the user about the product first (PRODUCT.md). You asked me not to stop for questions, so I ran it as a *refinement* of the existing look (which the tool allows) and did not invent a new visual direction.
- **Audit (before → after, 0–4 each):** accessibility 2 → 3 (secondary text was 3.1:1, now ≥ 4.5:1 on console and phone; blue links darkened), performance 3 → 3 (two layout-property animations moved to transform), theming 2 → 2 (no dark mode is needed for a living-room TV page; colors still partly hard-coded per game), responsive 3 → 3, implementation integrity 3 → 3.
- **Kept on purpose (detector flags):** the red-and-white stripes (track curbs on the phone's steering strip) and the speed lines come from the racing world, so they stay. The "glow" flag on the neutral elevation shadow is a false positive for a light page. The "image without src" flags are the QR codes, now hidden until loaded.
- **Motion:** panels at rare, important moments (ready / game over / results / pause / mode picker) now arrive in 240 ms from 96 % scale; short messages ("Goal!", "GO!", "Trick!") punch in over 180 ms. Frequent things (hovering, D-pad moves) stay instant or near-instant. Reduced motion = a short fade only.
- **Balloon Pop HUD:** score and timer now sit on white pills like the 3D games' scoreboards, for one consistent HUD language.

## Phase 27: New kart items
- **My original item is the Magnet:** for 6 seconds you pick up coins from 10 m away instead of 2 m, and you get a slipstream (up to +4 m/s) toward the kart just ahead when it's within 30 m. Chosen because coins already raise top speed in our game, so the Magnet feeds an existing system instead of adding a new one, and it rewards chasing rather than attacking.
- **Lightning Bolt:** shrinks every kart *ahead* of the user for 3.5 s (top speed ×0.72, much lighter in bumps, speed ×0.6 at the strike), with no spin-out, so it's strong but not cruel. A Shield blocks it and is used up. Karts that already finished aren't touched. Only karts near the back can get it (15 % at the back, never at the front).
- **Triple Slick:** stays in your item box with a "×3" counter; each ITEM press drops one slick. The computer drops its three about 0.7 s apart.
- **Odds** were rebalanced so the new items appear without crowding out the old ones (see `ITEM_ODDS` in karts-data.js).

## Phase 28: Glide-ramp track (Cloud Gardens)
- **Theme:** gardens above the clouds (pink-and-blue sky, puffy clouds, floating rock islands with lawns, trees). Original look, built from code plus the trees we already ship.
- **What a "shortcut" is:** the road stays one closed loop (so lap counting, race places and the barriers keep working). A shortcut ramp is a narrow ramp on *one side* of the road, on the side facing the landing. Taking it is a choice: line up on that side or drive past. The flight goes straight across the gap and lands further along the same lap, skipping a long loop of road (~110 m of flight saves ~120 m of road, about 4 s).
- **Flight rules:** during a shortcut flight the kart's lap position follows how far across the gap it is, so race places update smoothly and the finish line can't be skipped. An invisible arc (6 m high in the middle) keeps the glider from sinking into the gap, and it keeps at least 20 m/s, so a hit in mid-air can't leave anyone stuck. Glowing orange hoops show the line, and the minimap draws dashed lines.
- **Ramps on this track:** three in total: one full-width glide down from the hilltop (blue posts) and two shortcut ramps (orange hoops on their posts).
- **Computer racers** take a shortcut about 45 % of the time (decided once per ramp per lap), so they stay beatable but you'll see them use it.
