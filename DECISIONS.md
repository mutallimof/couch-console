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
