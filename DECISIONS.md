# Decisions log

Choices made without asking during the autonomous run of Phases 25–29 (the user asked me
not to stop for questions). Each entry says what was decided and why. Newest at the bottom.

## Phase 25: Character select
- **Showroom layout:** each player's panel shows the character standing on a podium *and* the chosen kart on a turntable with that character driving, side by side, so one preview covers both choices.
- **Poses:** the pirate pack has no dedicated "victory" clip, so picking a character plays **Wave** and pressing Ready plays **Yes** (a cheer). The code-built animals get a code-made idle (breathing and sway) and a happy spinning hop.
- **Rendering:** the previews are drawn by the game's own 3D renderer into each panel's preview box (the canvas is see-through during the select screen), not by extra WebGL canvases, so models load once.
- **Short screens:** a compact layout below 640 px tall, so a 960×540 laptop window fits everything.
