# Couch Console

A console you run in your web browser and control with your phone.

- Your **laptop** is the console. It shows a home menu and mini-games on the big screen.
- Your **phone** is the remote. You tilt it to move a pointer, tap buttons, and swing it to throw.
- A small **Node.js server** on your laptop passes the phone's input to the laptop page.

> Milestones 1 and 2 are built. Milestone 3 (better-looking 3D games) has started: **Turbo Karts**, **Table Tennis**, **Target Range**, **Air Hockey**, **Gem Dungeon**, a boot animation, local HTTPS, and the **Photos**, **Weather** and **Video** channels are in. See `PLAN.md` for the roadmap.
>
> **After pulling new code, run `npm install` again.** Turbo Karts uses the `three` 3D library, which needs to be downloaded once.
>
> **3D models:** Turbo Karts uses free CC0 model packs in `public/assets/` (Kenney *Toy Car Kit* and *Racing Kit*, Quaternius *Pirate Kit*). They load with a progress bar when you open the game and when you pick a track. If a model is missing, the game draws a simple built-in version instead, so it always works.

---

## What you need (one-time setup)

1. **Node.js 20 or newer.** Download the "LTS" version from <https://nodejs.org>.
   Check it in a terminal:
   ```
   node -v
   ```
   You should see something like `v20.x.x` or higher.

2. **cloudflared.** This creates a temporary public `https://` link to your laptop.
   Phones only allow motion sensors on `https://` pages, so you need this.
   - **macOS** (with [Homebrew](https://brew.sh)): `brew install cloudflared`
   - **Windows**: `winget install --id Cloudflare.cloudflared`
   - **Linux**: see <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>

   Then **close your terminal and open a new one**, because a terminal that was already open won't find the newly installed command. Check it:
   ```
   cloudflared --version
   ```

3. **Install the project's packages.** In a terminal, inside the `couch-console` folder, run:
   ```
   npm install
   ```
   This downloads `express`, `socket.io` and `qrcode` into a `node_modules` folder. You only need to do this once (and again if `package.json` changes).

---

## How to run it

You need **two terminal windows**, both opened in the `couch-console` folder.

**Terminal 1: start the server**
```
npm start
```
Leave it running. (While developing, `npm run dev` restarts the server automatically whenever you save a file.)

**Terminal 2: start the https tunnel** (skip this if you did the *Local setup* below)
```
cloudflared tunnel --url http://localhost:3000
```
After a few seconds it prints a link like `https://something-random.trycloudflare.com`.

**Then:**
1. Open that `https://…trycloudflare.com` link **on your laptop**.
2. Scan the QR code on the laptop screen with your phone's camera.
3. The phone shows a big **P1** badge, and the laptop shows **P1 Connected**.
4. On the phone, tap **Tap to start**. On iPhone, tap **Allow** when it asks about motion.
5. Point the phone at the laptop screen and turn and tilt it to move your cursor. Hold it however feels natural (flat, upright like a TV remote, or sideways): there's no calibration, the console learns how your phone's sensors work during the first few seconds of moving it.
6. Press **Recenter** any time to put the cursor back in the middle. Small drift fixes itself whenever you hold the phone still for a moment.

7. **Click the laptop page once** with your mouse or touchpad. Browsers block sound until you do. Press **F11** for full screen.

### Playing with 2 to 4 phones
- Every phone scans the **same QR code**. The first phone is **P1 (blue)**, then **P2 (red)**, **P3 (green)** and **P4 (yellow)**.
- While you're in the menu, a small QR code in the bottom-right corner lets more phones join.
- **P1 controls the menu** (the ring around the selected tile is in P1's color). Other players' cursors show, but only P1 can open and close things.
- **Balloon Pop, Draw and Target Range** take up to 4 players. The other games take 2 (the first two players); the others can watch.
- **Phone sounds:** when something happens to you in a game (a hit, a pop, a crash), your own phone plays a little sound, and vibrates on Android. Turn it off in Settings.
- In **Draw**, both players paint at the same time, each with their own color and brush.
- **Balloon Pop** asks for a mode when 2 phones are connected:
  - **Solo:** only P1 plays.
  - **Versus:** same sky, each pop scores for whoever popped it. The score for P1 is on the left and P2 on the right, and the winner screen is in the winner's color.
  - **Co-op:** one shared score. Reach 40 points in 60 seconds. If you both pop within half a second of each other, you get a **COMBO +2**.
- If a phone disconnects during a game, the game pauses. Scan the QR code again within 30 seconds to get the same player number back, or press **B** to quit.
- No second phone? Open the `…/remote.html` link in another browser window on the laptop and type the room code. It shows a touchpad you can drag with your mouse.

### Using the console
| Phone button | What it does |
|---|---|
| Point + **A** | open the tile you're pointing at |
| **D-pad** | move between tiles |
| **B** | go back |
| **HOME** | return to the menu from anywhere |

- **Turbo Karts:** a 3D kart race (3 laps, 8 racers). First each player picks a **character** and a **kart** (D-pad, A = confirm, B = back), watching them in a little 3D showroom: the character waves when picked and cheers when you're ready, and the kart turns on a turntable next to its stats, then P1 picks one of 5 **tracks** (Sunny Park, Dune Canyon, Frosty Peaks, Neon City, Pirate Cove). Drive through **item boxes** and press **ITEM** to use what you got: *Turbo* (speed boost), *Homing Orb* (hits the kart ahead), *Slick* (dropped behind you), *Shield*, *Triple Slick* (three slicks, one per press), *Magnet* (grabs coins from far away and pulls you along behind the kart ahead) or, if you're near the back, the *Lightning Bolt* (everyone ahead of you shrinks and slows for a few seconds; a Shield blocks it). **Coins** raise your top speed; getting hit makes you drop some. Your phone turns into a **kart controller**: hold it sideways with both thumbs.
  - **Left thumb, steering strip:** put your thumb on it and slide. The further from the middle, the harder you turn; the striped middle band means straight. The dot shows where your thumb is.
  - **Right thumb, four buttons:** **GAS** (bottom right), **DRIFT** next to it, **ITEM** and **BRAKE** above. Slide your thumb from one to the next without lifting it. Holding **DRIFT** or **ITEM** keeps accelerating, so you can move off GAS.
  - **Drift:** hold DRIFT while turning at speed (the kart does a little hop), then let go for a **mini-turbo** (blue sparks = small boost, orange = big boost). Braking ends a drift with no turbo.
  - **Switches at the top:** **Tilt steering** (turn the phone like a wheel instead of using the strip, with a Recenter button) and **Auto-gas** (always accelerating). The phone remembers them.
  - **Glide ramps:** a blue pad with white chevrons across the road, between two glowing posts. Drive over it at speed and a glider opens: you float down slowly, steering freely, and the glider follows the road's bends.
  - **Tricks:** tap **DRIFT** while in the air (off a glide ramp or any jump) for a barrel roll. Land it for a short boost ("Trick!").
  - Orange arrows on the road are boost pads. With 2 phones choose **Versus** (split screen), **Co-op** (your team's points vs the 2 best computer karts) or **Solo**. Keyboard mode: arrows steer, Enter/Space = gas, R or Shift = drift, U = item, Esc = brake.
- **Table Tennis:** a 3D ping-pong table. The paddles move by themselves; you **swing your phone** to hit when the ball reaches you (or press A). Swinging early or late, or tilting the phone, aims left or right; a harder swing hits faster. **Versus** is first to 11 (win by 2), **Co-op** counts how long you can keep a rally going together, and **Solo** is against the computer.
- **Target Range:** a 3D shooting gallery. Your cursor becomes a **crosshair**: aim and press **A** to shoot targets as they pop up. Center = 3, middle = 2, edge = 1, gold movers = +5, and red X signs = −5 (don't shoot those!). 45-second rounds: **Versus** (whoever hits a target first scores), **Co-op** (team goal of 120) or **Solo** (beat your best).
- **Air Hockey:** your mallet follows your pointer on your half of a 3D table. Knock the puck into the other goal; first to 7 wins. **Versus** (P1 left, P2 right) or **Solo** against the computer.
- **Gem Dungeon:** a 3D dungeon crawl for 1–2 heroes. **Point at the floor** and your hero walks there; press **A** to swing your sword at slimes. Collect every gem to open the purple exit portal, then get everyone into it. Avoid spike traps (they go up and down). Hearts are shared. Golden **pressure plates** open the gates: in **Co-op** a gate only stays open while someone stands on a plate, so take turns holding it for each other. 3 levels.
- **Balloon Pop:** press A to start, then point at balloons and press A to pop them. Normal balloons are +1, golden ones +3, and spiky ones −2 (your phone buzzes on Android). A round lasts 60 seconds, and your best score is saved.
- **Draw:** hold A to paint. The D-pad changes the color, + and − change the brush size, and B clears the picture.
- **Paddle Duel:** a bat-and-ball game. Your paddle follows how high you point. Press A to serve; the ball gets 5% faster on every hit, and the first to 7 points wins. With 2 phones choose **Versus** (P1 left, P2 right) or **Solo** against the computer.
- **Bowling:** point left/right to aim, then **hold B and swing your phone** like you're bowling. A harder swing throws faster, and tilting the phone sideways curves the ball. Can't get swings to work? Press **A** for a medium, straight throw. 10 frames with real bowling scoring (strikes and spares); with 2 phones you take turns.
- **Photos:** put pictures (.jpg, .png, .gif, .webp) in the `photos` folder inside `couch-console`. Point or use the D-pad to choose one and press A to open it. ◀ ▶ flips through them, A starts or stops a slideshow, and B goes back. Your photos are never uploaded to GitHub.
- **Weather:** today's weather and the next days (needs internet). ◀ ▶ changes the city. "My location" asks the laptop's browser for permission once. + / − switches between °C and °F, and A refreshes.
- **Video:** plays YouTube videos (needs internet). The list comes from `videos.txt` in the `couch-console` folder. Copy `videos.example.txt` to `videos.txt` and put one `Title | YouTube link` per line. While watching: A = play/pause, ◀ ▶ = back/forward 10 s, + / − = volume, ▲ ▼ = previous/next video, B = back to the list. If a video doesn't start, click the laptop page once (browsers block autoplay with sound) and press A.
- **Settings:** pointer speed (1 to 10), sound on/off, phone sounds on/off, and **Show QR code** to connect a phone again.

If the phone can't use motion sensors, or you tapped "Don't Allow", it shows a **touchpad** instead. Drag on it to move the cursor.
On iPhone, to get the motion question again: Settings → Apps → Safari → Clear History and Website Data, then reload the page.

No camera handy? Open `https://…trycloudflare.com/remote.html` on the phone and type the 4-letter room code shown on the laptop.

**No phone at all?** Click **No phone? Use mouse & keyboard** on the QR screen. You play as P1:

| Mouse / key | Does |
|---|---|
| Move the mouse | pointer |
| Left click, Enter or Space | **A** |
| Right click, Esc or Backspace | **B** |
| Arrow keys | D-pad (in Turbo Karts ◀ ▶ steer) |
| H | HOME (back to the menu) |
| + / − | PLUS / MINUS |
| U | ITEM in Turbo Karts |

When a phone joins, it takes over as P1.

**Boot animation:** a short intro plays when the console page opens. Click, press any key or press any phone button to skip it. To turn it off completely, add `?noboot=1` to the laptop link.

**Debug mode:** add `?debug=1` to the end of the laptop link (for example `https://…trycloudflare.com/console.html?debug=1`).
On the phone, add `&debug=1` to the end of its link. You'll see live sensor numbers, messages per second and ping times.
On the laptop, the debug box also shows how many frames per second the laptop draws (below about 50 means it's struggling), each phone's motion messages per second and what the pointer has learned about the phone (`learning…` at first, then a line like `x←x+1.00 y←y+1.00 z←z+1.00` once it trusts the gyroscope). Press **L** on the laptop keyboard to switch the cursor prediction off and on, to compare how it feels.

**Turbo Karts looks:** reflections, a sky with a sun, textured roads and grass, a soft glow on bright things (boost flames, drift sparks, neon) and speed lines while boosting. If your laptop can't keep up, the glow effects switch themselves off. To force them, add `?fx=on` (always on) or `?fx=off` (always off) to the laptop link, for example `…/console.html?fx=off`.

**Phone says "Motion needs a secure page"?** The phone opened a plain `http://` link, and browsers only allow motion sensors on secure (`https://`) pages. The message on the phone says what to do; tap it to close it. Meanwhile you can use the touchpad on the phone.

**Good to know**
- Refreshing the phone page keeps you as P1.
- If you close the phone page, the laptop shows P1 as "Waiting…". For 30 seconds that slot is saved for the same phone, so another phone can't take it until then.
- Refreshing the laptop page makes a new room and QR code. Scan the new one with your phone.

To stop everything, press `Ctrl + C` in each terminal.

---

## YouTube search (optional)

The **Video** channel always plays the links in `videos.txt`. To also **search YouTube** from the console, you need a free *YouTube Data API key* (one-time setup, about 5 minutes):

1. Go to <https://console.cloud.google.com/> and sign in with your Google account.
2. At the top, click the project picker → **New Project** → name it `couch-console` → **Create**, then make sure it's selected.
3. Open the menu ☰ → **APIs & Services** → **Library**, search for **YouTube Data API v3**, open it and click **Enable**.
4. Go to **APIs & Services** → **Credentials** → **+ Create credentials** → **API key**, and copy the key.
5. (Recommended) Click the key → under **API restrictions** choose **Restrict key** → tick **YouTube Data API v3** → **Save**.
6. In the `couch-console` folder, copy `config.example.json` to a new file `config.json`, open it in Notepad and paste your key where it says `PASTE-YOUR-KEY-HERE`. Save, then restart `npm start`.

Now open **Video** → **Search YouTube**: your phone shows a text box. Type, press **Send**, and pick a result.
`config.json` is **never** uploaded to GitHub (it's in `.gitignore`). Keep your key private.
The free key allows about 100 searches per day.

---

## Local setup (faster, no tunnel)

Instead of the cloudflared tunnel, phones on the **same Wi-Fi** as your laptop can connect directly, which means less delay. You set this up **once**.

**On the laptop (Windows):**
1. Install mkcert: `winget install FiloSottile.mkcert`, then **close and reopen** your terminal.
2. In the `couch-console` folder run: `npm run certs`. Click **Yes** if Windows asks about installing a certificate.
3. Run `npm start`. It prints a line like `Open this on the laptop: https://192.168.1.23:3443`. Open that address on the laptop.
4. If Windows Firewall asks about Node.js, allow it on **Private networks**. Your Wi-Fi should be set to *Private* in Windows network settings.

**On each phone (once):** the phone must trust your laptop's certificate. The server prints the link, which looks like `http://192.168.1.23:3000/rootCA.crt`.
- **iPhone:** open the link in **Safari** and tap **Allow**. Then go to Settings → General → VPN & Device Management → tap the *mkcert* profile → **Install**. Then go to Settings → General → About → Certificate Trust Settings and **switch on** *mkcert*.
- **Android:** open the link in **Chrome** to download it. Then go to Settings, search for **"CA certificate"** (often under Security → Encryption & credentials → Install a certificate), choose it and pick the downloaded `rootCA.crt`.

After that, just scan the QR code as usual. It points straight to your laptop.
If your laptop's Wi-Fi address changes (another network), run `npm run certs` again.

**Phone can't open the QR link?** Look at the link printed under the QR code:
- It starts with `http://localhost`: the local setup isn't on (no `certs` folder). Do the steps above, or use the cloudflared tunnel.
- It has an address like `https://172.x.x.x:3443` that isn't your Wi-Fi: `npm start` lists every network address and marks the one it used. Pick your Wi-Fi one and start with it, e.g. in PowerShell: `$env:LAN_IP="192.168.1.23"; npm start`
- The address looks right but nothing loads: make sure the phone is on the **same Wi-Fi** (not mobile data or a guest network), the Wi-Fi is set to **Private** in Windows, and Node.js is allowed in Windows Firewall.
The `certs` folder holds a private key: it is **never** uploaded to GitHub (it's in `.gitignore`).

---

## Project layout

```
server.js          the Node server (static files + real-time relay)
public/            everything the browser loads
  console.html     the laptop page
  remote.html      the phone page
  css/             styles for both pages
  js/shared/       constants both sides use (event names, player colors)
  js/console/      laptop code
  js/remote/       phone code
PLAN.md            the full spec and phase list
CLAUDE.md          working rules for the AI assistant
```

### Adding, hiding or reordering games
Every game and channel lives in `public/js/console/games/` or `public/js/console/channels/` and has a small settings file next to it with the same name, ending in `.game.json`. For example, `balloon-pop.js` has `balloon-pop.game.json`:

```json
{ "title": "Balloon Pop", "color": "#E0548F", "order": 6, "players": 4, "hidden": false }
```

- **Reorder the menu:** change `order` (lower numbers come first).
- **Hide a game:** set `"hidden": true` (its files stay; it just isn't on the menu).
- **Add a game:** put `my-game.js` and `my-game.game.json` in the `games` folder and refresh the laptop page.

If a game has a bug and can't load, only its tile shows **Couldn't load…**; the rest of the console keeps working.

### Tests
`npm test` runs the automatic tests (no phone needed).
