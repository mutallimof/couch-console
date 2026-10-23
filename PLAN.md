# PLAN.md: Couch Console (phone-controlled, Wii-style web console)

> Read `CLAUDE.md` first for the working rules.
> **Milestone 1** = a small, playable version with 1 phone.
> **Milestone 2** = 2 phones on 1 laptop, with versus and co-op games.
> Build the multiplayer-ready structure from day one (player slots and `playerId`), but cap Milestone 1 at 1 player.

---

## 1. Goal
- **Laptop browser = console.** It shows a fullscreen home menu with tiles and an on-screen pointer, plus mini-games.
- **Phone browser = remote.** It has buttons, and its motion sensors (tilt = pointer, swing = action) drive the game.
- A small Node server relays input in real time. Pairing works by scanning a QR code shown on the laptop.
- Name in the UI: **"Couch Console"** (original, not Nintendo).

---

## 2. Tech stack
| Part | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Server | `express` (static files) + `socket.io` (real-time) |
| QR code | `qrcode` npm package (server-side data URL) |
| Client | Vanilla JS ES modules; socket.io client from `/socket.io/socket.io.js` |
| 3D (Milestone 3) | `three` npm package, served by our server at `/vendor/three.module.js` (no CDN, no build step) |
| Font | "Nunito" (Google Fonts) |
| Sounds | Web Audio API synth blips, with no audio files |
| Phone HTTPS | `cloudflared` quick tunnel (required: phones only allow motion sensors on HTTPS) |
| Version control | Git, with the GitHub repo already cloned locally |

`package.json` scripts: `"start": "node server.js"` and `"dev": "node --watch server.js"`.

---

## 3. File structure
```
couch-console/
├── CLAUDE.md
├── PLAN.md
├── README.md
├── package.json
├── .gitignore                 # node_modules, .DS_Store, *.log
├── server.js                  # express + socket.io + rooms + player slots + QR
└── public/
    ├── index.html             # redirects to /console.html
    ├── console.html           # laptop
    ├── remote.html            # phone
    ├── css/  console.css  remote.css
    └── js/
        ├── shared/protocol.js          # event names, MAX_PLAYERS, player colors
        ├── console/
        │   ├── main.js                 # socket, pairing/lobby, router menu <-> games
        │   ├── players.js              # connected players state
        │   ├── pointer.js              # one cursor per player, smoothing, hit-testing
        │   ├── menu.js                 # tile grid
        │   ├── sound.js                # synth blips
        │   └── games/
        │       ├── balloon-pop.js      # M1 (solo) → M2 (versus + co-op)
        │       ├── draw.js             # M1
        │       ├── paddle-duel.js      # M2
        │       └── bowling.js          # M2
        └── remote/
            ├── main.js                 # join, buttons, player badge
            ├── motion.js               # permission, calibration, tilt → pointer
            └── swing.js                # swing detection
```

---

## 4. Architecture
```
[Phone P1] ─┐                                    ┌─> laptop: cursors, menu, games
            ├─ socket.io ─> [Node server: room] ─┤
[Phone P2] ─┘   (M2)                             └─< rumble/feedback back to the right phone
```
- The server is a **relay only**. It handles rooms and player slots; all game logic runs in the console browser.
- The server **stamps `playerId`** on every input it relays, so the console always knows which phone sent what.
- Pointer math happens on the phone, which sends normalized `x, y`.

**Player constants (`shared/protocol.js`)**
- `MAX_PLAYERS`: **1 in Milestone 1, 2 in Milestone 2** (code must work for up to 4).
- Colors: P1 `#2F80ED` (blue), P2 `#EB5757` (red), P3 `#27AE60` (green), P4 `#F2C94C` (yellow).

---

## 5. Socket protocol
| Event | Direction | Payload |
|---|---|---|
| `console:create` | console → server | ack `{ room }`, a 4-letter code (A–Z without I/O) |
| `remote:join` | remote → server | `{ room, clientId }` → ack `{ ok, playerId, color }` or `{ ok:false, error:'NO_ROOM'\|'FULL' }` |
| `player:joined` | server → console | `{ playerId, color }` |
| `player:left` | server → console | `{ playerId }` |
| `console:disconnected` | server → remotes | none |
| `input:pointer` | remote → console | `{ x, y }` in **-1..1**, ~60/s, `socket.volatile.emit` |
| `input:button` | remote → console | `{ button, state }`, where button ∈ `A,B,UP,DOWN,LEFT,RIGHT,HOME,PLUS,MINUS` and state ∈ `down,up` |
| `input:swing` | remote → console | `{ power: 0..1, tilt: -1..1 }` |
| `input:recenter` | remote → console | none |
| `feedback:rumble` | console → one remote | `{ playerId, ms }` → `navigator.vibrate(ms)` (Android; iOS ignores it) |
| `feedback:settings` | console → all remotes | `{ rangeX, rangeY }` |
| `feedback:mode` | console → all remotes | `{ mode: 'pointer' \| 'wheel' }`. Switches the phone between the normal remote and the steering-wheel layout (Milestone 3) |
| `input:wheel` | remote → console | `{ steer: -1..1 }`, ~60/s, `socket.volatile.emit`. Sent only in wheel mode (Milestone 3) |

**Server rules**
- The server adds `playerId` to every `input:*` event before forwarding it to the room's console.
- Player slots: a joining phone gets the **lowest free slot** (1..MAX_PLAYERS). If none is free, the server returns `FULL`.
- **Reconnect:** the phone keeps a random `clientId` in `localStorage`. If it reconnects within 30 s with the same `clientId`, it gets the **same slot** back.
- When the console disconnects, the server deletes the room and notifies the remotes.

---

## 6. Motion spec (phone)
**Permission:** show a big "Tap to start" button. On tap, call `DeviceOrientationEvent.requestPermission()` and `DeviceMotionEvent.requestPermission()` where they exist (iOS). If permission is denied, show how to fix it: *Settings → Apps → Safari → Clear History and Website Data, then reload.*

**Pointer:** the phone is held in portrait, top edge pointing at the screen.
- Use the `deviceorientation` event; calibrate `alpha0` and `beta0` on start and on **Recenter**.
- `dYaw = wrapTo180(alpha - alpha0)`, `dPitch = beta - beta0`
- `x = clamp(-dYaw / rangeX, -1, 1)`, `y = clamp(-dPitch / rangeY, -1, 1)`. Defaults are `rangeX = 25°` and `rangeY = 18°`. Flip the signs if the direction is wrong during testing.
- Send at most 60 Hz, and only when the value changed by more than 0.002.
- **Fallback:** a touchpad area where dragging moves the pointer. It's used when motion isn't available, and it helps with debugging.

**Swing:** use the `devicemotion` event.
- `mag = |acceleration|` (fall back to `accelerationIncludingGravity`).
- A swing starts when `mag > 18`. Track the peak until `mag < 8`, then emit with `power = clamp((peak-18)/22, 0, 1)` and `tilt = clamp(gamma/45, -1, 1)`.
- Cooldown: 500 ms.

**Debug (`?debug=1`):** the phone shows live alpha, beta, gamma, mag and messages per second; the console shows latency.

**Console cursor:** one cursor per player in the player's color, labeled "P1"/"P2". Smoothing: `pos += (target - pos) * 0.35` each frame. The cursor hides after 3 s idle.

---

## 7. Phone remote layout
Portrait, full height, no scrolling or zooming (`user-scalable=no`, `touch-action: none`, `overscroll-behavior: none`).
- **Top:** player badge ("P1" in the player color), connection dot, **Recenter** button
- **Middle:** D-pad + big **A** button
- **Row:** **−  HOME  +**
- **Bottom:** big **B** button
- Buttons use `pointerdown`/`pointerup`/`pointercancel`, with `navigator.vibrate(10)` on press where supported.
- Request a screen Wake Lock, so the phone doesn't sleep while playing.

---

# 🟦 MILESTONE 1: Small playable version (1 phone)

### Phase 0: Project setup
- Check that the folder is a git repo with a GitHub remote (`git remote -v`). If not, **YOUR TURN** with the steps.
- Check `node -v` (20+) and `cloudflared --version`. If either is missing, **YOUR TURN** with install commands for my OS.
- Create `package.json`, `.gitignore` and a beginner-friendly `README.md`.

✅ Done when: `npm install` works and the first commit is made.

### Phase 1: Server + pairing
- `server.js` with rooms, player slots and relay, following Section 5.
- `GET /qr?room=ABCD` returns a data URL for `https://<host>/remote.html?room=ABCD`. Take the host from `x-forwarded-host`, falling back to `host`, so it works behind the tunnel.
- **Console pairing screen:** large QR code, the room code in large text, "Scan with your phone", and the player slots (P1 empty or connected).
- **Remote:** reads the room from the URL (or shows a 4-letter input), then joins and shows its badge.

✅ Done when: scanning the QR connects the phone, the console shows "P1 connected", and closing the phone tab frees the slot.

### Phase 2: Buttons
- Phone layout from Section 7. The console shows a temporary input log.

✅ Done when: every button shows down/up on the laptop with no noticeable delay.

### Phase 3: Motion pointer
- Everything in Section 6 except swing.

✅ Done when: tilting moves the cursor smoothly over the whole screen, Recenter works, and it works on iPhone Safari and/or Android Chrome over the tunnel.

### Phase 4: Mini home menu
- Fullscreen, light, soft gradient background. A grid of tiles, 4 columns, rounded 16px corners, soft shadows. Bottom bar with a live clock and date.
- Tiles for Milestone 1: **Balloon Pop**, **Draw**, **Settings**, plus faint empty tiles to fill the grid.
- Controls: hover + **A** opens a tile, **D-pad** moves focus, **B** goes back, **HOME** always returns to the menu.
- The tile zooms to fullscreen when opened (300 ms) and reverses when closed. Add synth sounds for hover, select and back.
- **Game interface** (every file in `games/`):
  ```js
  export default {
    id, title, color, icon /* inline SVG */, minPlayers: 1, maxPlayers: 1,
    mount(container, api) {}, // api: { players, onButton, onPointer, onSwing, rumble(playerId, ms), sound, exit }
    unmount() {}              // must remove ALL listeners, timers and animation frames
  }
  ```
- **Settings:** pointer sensitivity slider (sent with `feedback:settings`), mute toggle, and "Show QR".

✅ Done when: I can open and close every tile using only the phone.

### Phase 5: First games
- **Balloon Pop (solo).** Balloons float up from the bottom at random x positions and speeds. Aim with the pointer and press **A** to pop one. A round lasts 60 s.
  - Normal balloon: +1. Golden balloon (rare, fast): +3. Spiky bomb balloon: −2 and a 200 ms rumble.
  - Pop effect: particles plus a synth "pop" sound.
  - End screen shows the score, the best score (kept in `localStorage`), "A = play again" and "B = menu".
- **Draw.** Hold **A** to draw at the pointer. **B** clears, **D-pad** changes color, **+/−** changes brush size.

✅ Done when: I can play a full Balloon Pop round and draw, using only the phone. **→ Milestone 1 complete. Commit, push, and tag `v0.1`.**

---

# 🟥 MILESTONE 2: Two phones, co-op and versus

### Phase 6: Multiplayer core
- Set `MAX_PLAYERS = 2`.
- **Pairing/lobby:** one QR code that both phones scan. Two slot cards (P1 blue, P2 red) show "Waiting…" or "Connected". Each phone shows its own badge color, and the phone vibrates when it joins.
- **Cursors:** each player has a colored cursor labeled "P1"/"P2". Both are visible at the same time.
- **Menu control:** **P1 drives the menu** (opens and closes games). P2's cursor is shown but can't open tiles.
- **Game select:** if a game supports 2 players and 2 are connected, show a mode picker (**Solo / Versus / Co-op**, depending on the game).
- If a player disconnects mid-game, pause the game with "P2 disconnected: scan again or press B to quit". When they rejoin within 30 s, they get the same slot back and the game resumes.

✅ Done when: both phones connect, both cursors move independently, and the input from each phone is attributed to the right player.

### Phase 7: Balloon Pop: Versus + Co-op
- **Versus:** both players pop from the same sky. Points go to whoever pops each balloon, shown with a colored "+1". The split scoreboard shows the P1 score on the left and P2 on the right. The winner screen appears in the winner's color.
- **Co-op:** a shared score with a target of 40 in 60 s. Add a "combo" bonus when both players pop balloons within 0.5 s of each other.
- Bomb rumble goes only to the phone that popped the bomb.

✅ Done when: both modes are playable start to finish with 2 phones.

### Phase 8: Paddle Duel (versus)
- Pong-style. P1 controls the left paddle and P2 the right; paddle y = that player's pointer `y`.
- **A** serves. The ball speeds up 5% on every hit. First to 7 points wins. Rumble on a hit and on a point lost.
- **Solo mode:** P1 against a simple AI that follows the ball with limited speed.

✅ Done when: a full versus match and a solo match both work.

### Phase 9: Bowling (1–2 players, taking turns)
- Top-down 2D lane with 10 pins in triangle formation and simple circle-collision physics.
- Aim by moving the pointer `x`. Hold **B** and **swing** to throw: `power` sets the speed and `tilt` sets the curve. If the phone can't detect swings, **A** throws with medium power.
- 10 frames with standard scoring (strikes and spares). In 2-player mode, players alternate frames and the scoreboard shows both rows. Rumble on a strike.
- Only the active player's input counts. Show "P2's turn" in their color.

✅ Done when: a full 2-player game with correct scoring works. **→ Milestone 2 complete. Commit, push, and tag `v0.2`.**

---

# 🟩 MILESTONE 3: Better-looking games, boot animation, local setup, channels

All games are original: no Nintendo names, characters, tracks or sounds.

### Phase 10: Kart racer ("Turbo Karts")
- Three.js, low-poly 3D look: a closed track with curbs, trees, barriers, boost pads and a start line.
- **Wheel mode:** the console sends `feedback:mode {mode:'wheel'}`. The phone shows big **A = gas** and **B = brake/drift** buttons, and you steer by holding the phone sideways and tilting it like a wheel (from the gravity direction, calibrated on start and on Recenter). It sends `input:wheel {steer}`. Back in the menu, the console sends `mode:'pointer'`.
- Arcade physics: acceleration, off-road slowdown, wall bounce, kart bumping. Hold B while turning at speed to **drift**; letting go after a drift gives a **mini-turbo**.
- 6 karts (players + CPU), 3 laps, a 3-2-1-GO countdown, a position/lap HUD, a minimap and a results screen.
- **Modes:** Solo (1 player + 5 CPU); Versus (2 players, **split screen** top/bottom); Co-op team race (your 2 karts' points vs the best 2 CPU karts).
- Rumble on wall hits and boosts.

### Phase 11: Table Tennis
Swing the phone to hit. Versus, or a co-op rally (keep it going together).

### Phase 12: Target Range
Aim with the pointer and press A to hit pop-up targets. Versus or co-op against the clock.

### Phase 13: Air Hockey
Your mallet follows your pointer. 2 players, or solo vs CPU.

### Phase 14: Co-op Dungeon
Two heroes collect gems and avoid traps together.

### Phase 15: Boot animation
A short, original startup animation when the console opens.

### Phase 16: Local HTTPS (no tunnel)
Use `mkcert` for a trusted local HTTPS certificate, so phones on the same Wi-Fi connect directly with lower latency.

### Phase 17: Content channels
- **Photos:** pictures from the laptop's `photos/` folder (git-ignored). Grid → full screen with a slow zoom; ◀ ▶ browse, A = slideshow.
- **Weather:** Open-Meteo (free, no key). "My location" (browser geolocation) or a city list (◀ ▶), °C/°F (+/−), today plus 5 days, original animated icons.
- **Video:** YouTube IFrame player for links listed in `videos.txt` (falls back to `videos.example.txt`). A = play/pause, ◀ ▶ = ±10 s, +/− = volume, ▲ ▼ = previous/next.

---

# 🟪 MILESTONE 4: Kart racer deluxe + YouTube search

Still original: no Nintendo characters, tracks, items or names.

### Phase 18: Turbo Karts deluxe
- 8 original characters and 4 karts with stats (speed, acceleration, handling, weight); select screen per player, then P1 picks a track.
- 4 themed tracks (Sunny Park, Dune Canyon, Frosty Peaks with icy grip, Neon City at night) with hills, jump crests, a tunnel, a bridge, boost pads.
- Item boxes with original items (Turbo, Homing Orb, Slick, Shield; better items further back) and coins (+top speed, lost when hit). 8 racers.
- The phone wheel gets an ITEM button (sends the existing `UP` button).

### Phase 19: YouTube search
- Search YouTube from the Video channel with a free YouTube Data API key in a git-ignored `config.json` (the server makes the request, the key never reaches the browser).
- Typing on the phone: `feedback:mode {mode:'keyboard'}` shows a text box on the phone, which sends `input:text {text}`.

### Phase 20: Real 3D models
- Free CC0 model packs (downloaded by the user) replace the code-built karts, characters and props where available, with code-built fallbacks.
- Packs in `public/assets/`: Kenney Toy Car Kit (8 cars, item box, coin, trees), Kenney Racing Kit (grandstands, banners, light posts, tents, flags), Quaternius Pirate Kit (6 animated pirates, palms, rocks, houses, ships, a sea monster).
- 14 characters (6 pirates + 8 code-built animals), 8 cars, and a 5th track: **Pirate Cove** (an island in the sea).
- Pirates are animated: idle while driving, a hit reaction when spun out, waving at the finish.

# 🟫 MILESTONE 5: OpenWii-inspired upgrades + kart controller

OpenWii (https://github.com/pattssun/OpenWii, MIT) was studied; code reused from it keeps its notice in `THIRD_PARTY_NOTICES.md`. Nothing from its Nintendo-themed folders is used.

### Phase 21: OpenWii-inspired upgrades (built; waiting for the real-phone test)
- **21a New pointer:** phones stream raw sensors (`input:motion` `{alpha, beta, gamma, motion:{rx, ry, rz}}`), the console runs OpenWii's gyro pointer per player: learns each phone's gyro axes (no calibration), heals drift when the hand is still, draws slightly ahead to hide lag. Touchpad still uses `input:pointer`. Tests: `npm test`.
- **21b Feel and polish:** menu aim assist, cursor trail, menu/transition/sound polish (original look).
- **21c Up to 4 players** (colors P3 green, P4 yellow), 4-player Balloon Pop / Draw / Target Range, per-player phone sounds (the phone plays a sound when its own `feedback:rumble` arrives; on/off sent as `feedback:settings {phoneSounds}`).
- **21d Mouse and keyboard fallback** when no phone is connected.
- **21e Games from manifests** (`<name>.game.json`), each loaded on its own; a broken game shows a "couldn't load" tile.
- **21f Game rules separate from rendering**, with `node:test` tests (kart physics, Air Hockey, pointer).
- **21g Reliability:** always-fresh files (`Cache-Control: no-cache`, models cached a day), phone diagnostics (insecure page / denied / no sensors), laptop fps in `?debug=1`.

### Phase 22: Kart controller (built)
- Buttons-only controller (`remote/kart-pad.js`, steering via `input:wheel`, DRIFT = new button `R`): steering strip (10% dead zone, visible thumb marker), GAS, separate DRIFT button (new button `R`), ITEM; DRIFT and ITEM keep accelerating; thumb can slide between buttons; tilt steering as an option.

### Later
- 4-player split screen for Turbo Karts.

---

## 8. Later (not now)
3–4 players.

---

## 9. Manual steps overview (for me, the human)
| When | What I do |
|---|---|
| Before starting | Create the GitHub repo, clone it, add `CLAUDE.md` + `PLAN.md`, install Node 20+ and `cloudflared`, start Claude Code in the folder |
| Phase 0 | Approve `npm install` and the first commit |
| Every test session | Terminal 1: `npm start`. Terminal 2: `cloudflared tunnel --url http://localhost:3000`. Open the `https://….trycloudflare.com` link **on the laptop**, then scan the QR with my phone(s) |
| First time on a phone | Tap "Tap to start" and **Allow** motion access |
| End of every phase | Test on my real phone(s) and tell Claude Code what feels wrong (direction, speed, delay, swings) |
| Milestone 2 | A second phone, or a friend's phone (any modern iPhone/Android). Both scan the same QR |
| Pushing | Approve `git push` when asked |

## 10. Testing checklist (every phase)
- [ ] No errors in the laptop browser console
- [ ] The phone page never scrolls or zooms, even with fast tapping
- [ ] HOME returns to the menu from anywhere
- [ ] Refreshing the phone rejoins the same slot
- [ ] Refreshing the laptop shows a new QR code and the phones can rejoin
- [ ] (M2) Each phone controls only its own cursor or paddle
