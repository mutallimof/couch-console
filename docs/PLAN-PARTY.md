# PLAN-PARTY.md: Couch Console becomes "the party app for any TV"

> **For Claude Code:** read `CLAUDE.md` and `PLAN.md` first. This file adds **Milestones 3–5** (Phases 43–52; the plan was first written as 35–44, renumbered because Phases 39–42 were the kart work).
> Status: the cursor fix and the Turbo Karts port are done. The critical review was done (see "Review and fixes" below and `docs/DECISIONS.md`); the fixes are already folded into the text. Work phase by phase as usual; per `CLAUDE.md`, push + merge to `main` after each phase when `npm test` passes.
>
> **Built so far: Phases 43-46 (Milestone 3: roles + folders, Photos, Music, Present).** Phases 47-52 (Party Games and Camera) are not built yet. How each built phase differs from this text is in `docs/DECISIONS.md`.

---

## 0. The idea in one sentence
Plug a laptop into a TV (or just use the laptop screen). Everyone in the room scans **one QR code** with their phone, with no app to install. Then:
- **Up to 4 players** play games with their phones as controllers.
- **Any number of guests** share photos and queue music.
- Anyone can **present slides** from their phone.
- The laptop **webcam** turns the room into a photo booth and a motion game.

### Product principles (use these to decide anything that's unclear)
1. **10 seconds from scan to joined.** Scan the QR, type a name, done. No accounts, no permissions unless needed.
2. **Nothing gets stuck.** Every flow has a way back (B / HOME / a back arrow), and every upload or action has a visible state (sending, done, failed → retry).
3. **The TV is for everyone, the phone is personal.** The TV shows big, shared things; the phone shows your private or personal stuff.
4. **Local and private by default.** Everything stays on the laptop. Nothing is uploaded to the cloud. Webcam images are processed locally and only saved when someone takes a photo.
5. **Original look.** No Nintendo or other brands' assets or names.

---

## 1. Roles and joining (system design)

### Three roles
| Role | How many | What they can do |
|---|---|---|
| **Host** | 1 (the laptop/TV) | Everything. Admin controls live in Settings → Party on the TV. |
| **Player** | max **4** (P1–P4, colors as now) | Everything a guest can do, plus the controller (cursor, buttons, motion) and games. P1 drives the menus. |
| **Guest** | **unlimited** (aim for 50+) | Photos, Music, Present (if allowed), and joining Hot Potato in 1-phone mode. No cursor, no motion permission. |

### Join flow (phone)
1. Scan the QR code → page opens → **"What's your name?"** (pre-filled from `localStorage` on later visits) + a random avatar color/emoji they can tap to change.
2. They land on the **phone home**, with tabs at the bottom:
   - Guests: **Photos · Music · Present**
   - Players: **Remote · Photos · Music · Present**
3. **Becoming a player:** a big "🎮 Join as player" button on the phone home, shown only while a slot is free. Tapping it asks for motion permission (iOS) and gives a P-number. "Leave player slot" gives it back. On the TV, a game lobby can also show "Tap *I'm in* on your phone".
4. **Reconnect:** same as now (a `clientId` in `localStorage`, 30 s grace period). Guests keep their name and their uploads.

### The QR code is always reachable
- A small "Join: scan me" QR + room code sits in a corner of the TV on the home menu, Photos and Music screens (hidden during games and presentations).
- The phone has a "Invite someone" button that shows the same QR on the phone, so a guest can let the next person scan their screen.

### Network: make guests' lives easy (important)
- Guests won't install certificates. **Party mode should use the cloudflared tunnel URL in the QR code** (a real HTTPS certificate, and it works even on mobile data). Keep LAN/mkcert as an option for low-latency player-only sessions.
- Claude Code: verify what a phone **without** the mkcert root CA sees with the current local HTTPS setup. If it shows a warning, the QR in party mode must use the tunnel. Document the trade-off in README.
- `npm start` should print one clear line: "Party link: https://….trycloudflare.com". Even better, start the tunnel automatically if `cloudflared` is installed (with a `--no-tunnel` flag to turn that off).

### Events (so photos and music survive)
- Photos and the music history belong to an **event**, not to a room code (room codes change when the TV reloads).
- Data lives on the laptop in `data/events/<eventId>/` (git-ignored): `event.json`, `photos/`, `thumbs/`, `decks/`.
- On boot, the host chooses **"Continue last party"** or **"New party"**. Settings → Party: rename the event, download everything, **End party & delete data** (asks for confirmation twice).

---

## 2. Home menu reorganisation (folders)

Top-level tiles (12 per page, as now):
| Tile | Type | Contents |
|---|---|---|
| **Turbo Karts** | game (separate) | The kart game |
| **Party Games** | folder | Quick Draw Duel, Hot Potato, Steady Hands |
| **Arcade** | folder | Balloon Pop, Bowling, Tennis/Table Tennis, Fruit Slice, Paddle Duel, Air Hockey, Target Range, Alien Strike, Draw |
| **Camera** | folder | Photo Booth, Party Workout, Mirror Match |
| **Photos** | hub | The shared party album (replaces the old Photos channel) |
| **Music** | hub | The party music queue |
| **Present** | hub | Slides, PDF and image presentations |
| **Channels** | folder | Weather, Video, Timer, On This Day |
| **Settings** | | Includes the new Party section |

**Folder mechanics**
- Opening a folder zooms into a sub-grid with the same tile style and a header like "Home › Party Games". **B** or the back tile returns, with a zoom-out from the folder tile.
- Folders are defined in the manifests: add `"folder": "party" | "arcade" | "camera" | "channels"` to each `<name>.game.json`. Add a `folders.json` with the folder title, icon, color and order. No hard-coding.
- A folder tile shows a 2×2 mini-preview of the icons inside it.
- The D-pad and aim assist work inside folders exactly as they do on the home screen.

---

## 3. Photos hub: the shared party album

### Goal
Everyone sends photos from their phone. They appear live on the TV, and **everyone can see and save all of them**, simply.

### Uploading (phone)
- A big **"+ Add photos"** button opens the phone's picker (`<input type="file" accept="image/*" multiple>`), so the camera roll and the camera both work.
- **Processing in the phone browser before upload:**
  - Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })` so rotated photos come out right.
  - Re-encode to JPEG, longest side **max 3000 px**, quality 0.88. This keeps it fast and **strips GPS/EXIF location data** for privacy.
  - Also make a **480 px thumbnail**. Upload both.
  - If decoding fails (e.g. HEIC on a non-Safari browser), upload the original as-is and let the server mark it "no preview". Tell the user kindly.
- **Upload queue on the phone:**
  - Uploads go one or two at a time, each with a progress bar.
  - States: waiting → uploading → done ✓ / failed → **Retry**.
  - Leaving the page warns "Uploads still running".
  - Show the text "Keep this page open until uploads finish".
- **Server:** `POST /api/events/:eventId/photos` (multipart). Validate: image types only, max 15 MB per file, a per-event cap (default 3 GB, set in Settings). Each photo is saved with `{ id, uploaderName, uploaderColor, createdAt, width, height, hidden:false }`.
- **Sizes:** after a photo is processed, uploads should be quick on Wi-Fi. Test with 20 photos at once.

### The TV
- **Wall mode (default):**
  - A calm slideshow with a slow pan/zoom, one photo at a time, with a small "📸 Sara" credit in their color.
  - **A new photo jumps the queue:** it flies in with a soft chime, stays 6 s, then the slideshow continues.
- **Grid mode:** the P1 remote toggles it with **+**. A masonry grid of all photos that you browse with the pointer or D-pad. **A** = fullscreen, **B** = back.
- **Host moderation:** in grid or fullscreen, **−** = hide photo, asking "Hide this photo for everyone?". Settings → Party → **"Approve photos before they appear"** (off by default). When it's on, new photos wait in a queue that only the host sees.
- An empty state: "No photos yet. Scan the code and add the first one!" with the QR big in the middle.

### The phone gallery (everyone)
- A live grid of all visible photos, newest first; new ones appear without a refresh.
- Filters: **All · Mine**.
- Tap → fullscreen viewer with swipe left/right, pinch zoom, and actions:
  - **Save:** use the Web Share API with the file (`navigator.share({ files })`). On iPhone this offers **"Save Image" straight into Photos**. If the browser can't share files, fall back to a normal download link.
  - **Delete** (only on your own photos).
- **Select mode:** tap "Select", tick several photos, then **"Save selected"**, which shares the files in batches of 10 so iOS doesn't choke.
- **Download all (ZIP):** "Download all photos (ZIP, 230 MB)". The server streams a ZIP of the full-size images. On the phone, warn first: "Large file: on iPhone this goes to the Files app. 'Save selected' puts them straight into Photos."
- The laptop also has **"Open album folder"** and **"Download all"** in Settings → Party.

### Edge cases to handle
- The same photo uploaded twice → detect it by a content hash and skip it ("Already in the album").
- The laptop's disk is nearly full → refuse new uploads with a clear message to the host.
- A guest who joins later sees the full album immediately.
- The tunnel URL changes when the tunnel restarts. Phones lose the connection then; show "Party link changed: scan the new code on the TV".

---

## 4. Music hub: the party queue

### How songs get in (no API key needed)
- **Paste a YouTube link:** the phone's "Add song" field accepts any YouTube or youtu.be link. The quickest way is to share from the YouTube app → Copy link → paste.
- The server looks the link up with **YouTube oEmbed** (`https://www.youtube.com/oembed?url=…&format=json`, no key) to get the title, channel and thumbnail. If oEmbed fails or the video doesn't allow embedding, reject it right away with: "This video can't play on the TV. Try another upload, e.g. a 'lyrics' or 'audio' version".
- **Optional search (YOUR TURN):** if the host adds a free **YouTube Data API key** in Settings, the phone also gets a search box. The free quota is about 100 searches a day, so cache results. Without a key the search box is hidden. Claude Code: give me exact steps for creating the key when we reach this phase.

### Queue rules (fair and simple)
- **Fair order:** songs play round-robin by person (Ana, Ben, Cem, Ana, Ben…), so nobody can take over the party with 20 songs.
- **Limit:** each person can have at most **3 songs** waiting.
- **Upvote** (👍, one per person per song): within the same round, more votes play earlier.
- **Skip vote:** a skip button on the "Now playing" card. A song is skipped when skip votes reach **max(2, 40% of the people connected)**. The TV shows a small "Skip 2/4" counter.
- The person who added a song can remove it before it plays. The host can always **play/pause, skip, remove, and reorder** (from Settings → Party or the P1 remote on the Music screen).
- If a video errors during playback (YouTube error 101/150, or a network problem), skip automatically after 3 s and tell the person who added it.

### The TV
- **Now playing:** large thumbnail, title, "added by Sara" in her color, a progress bar, and **Up next** (3 songs).
- The music **keeps playing in a mini-player** (bottom corner) when you leave the Music screen for Photos or the menu. *(Review fix: YouTube's rules require the embedded player to stay visible and at least 200×200 px, so the "mini-player" is a 200×200+ card in the corner, never a hidden or 1-pixel player.)* It **pauses automatically** when a game or presentation that uses sound starts, and resumes afterwards (a Settings toggle).
- **Autoplay:** browsers need one click or keypress on the TV page before sound can play. Show a big "Click once to enable sound" overlay until that happens.

### The phone
- Tabs: **Now playing · Queue · Add**. The live queue shows each song's name, who added it, and votes.

---

## 5. Present hub: slides from your phone or laptop

### What you can present
- **PDF** (recommended): rendered with **pdf.js** (`pdfjs-dist`, served from `node_modules`, no build step).
- **Images** (several JPG/PNG/WebP files) become one slide each. You can reorder them before presenting.
- **PowerPoint / Keynote / Google Slides:** can't be shown directly in a browser. If someone uploads a `.pptx` or `.key`, show the exact export steps:
  - PowerPoint: File → Export → PDF
  - Keynote: File → Export To → PDF
  - Google Slides: File → Download → PDF

### Uploading
- **From the phone:** Present tab → "Upload slides" (PDF or images). Uploads go to `data/events/<id>/decks/`.
- **From the laptop:** drag and drop onto the Present screen, or use a file picker.
- **The deck library:** the Present screen lists the uploaded decks with their first page as a thumbnail, the name and who uploaded it. Anyone can start one; the host can delete them.

### Presenting
- The person who taps **"Present"** on a deck becomes the **presenter**. Only one presenter at a time. Others see "Sara is presenting". The host can take over.
- **Presenter phone view:**
  - **big ◀ Prev / Next ▶ buttons**, plus swipe left/right anywhere
  - **the current and next slide** thumbnails and "Slide 5 / 23"
  - a **timer** that starts on the first slide; tap it to reset
  - **hold "Laser"**: a red laser dot appears on the TV, following the phone's gyro pointer (the same engine as the cursor). Releasing it fades the dot. Guests can get the laser too, without becoming a player: request motion permission only when they first press Laser.
  - **Black screen** toggle (temporarily blanks the TV)
  - **Notes** (optional): the presenter can type notes per slide on the laptop; they're stored with the deck and shown on the phone.
- **The TV:** full-screen slides, pre-rendering the next and previous slide so changes are instant. A crossfade of up to 150 ms (a setting: none or fade).
- **Keyboard and USB clickers:** →/←, Space, PageDown/PageUp and B (black) all work on the laptop.
- **End:** "End presentation" on the phone, or HOME, goes back to the Present screen. Remember the last slide for each deck.

---

## 6. Party Games folder: sensor games (2–4 players)

### Shared framework (build this first)
- **A game lobby:**
  - The TV shows the rules in 3 short lines, plus an animated example.
  - Each player slot shows "Ready?", and players tap **Ready** on the phone.
  - The game starts when all are ready, or when P1 presses Start. The minimum is 2 players.
- **The phone game screen** replaces the remote layout during the game: a big, simple, full-screen UI with the player's color as the background. The remote layout comes back afterwards.
- **Clock sync, so reaction games are fair over any network:**
  - Each phone measures its clock offset to the server with about 5 ping-pongs (an NTP-style median).
  - The server schedules events as "at server time T".
  - Each phone triggers the event locally at T and measures the reaction **on the phone**, so network lag doesn't decide who wins.
- **Gesture helpers** in `remote/gestures.js`, with tests using recorded sample data:
  - `holstered`: the phone's top edge points at the floor (gravity mostly along the device's −Y axis)
  - `raisedLevel`: the phone is roughly horizontal, pointing forward
  - `swing`: the existing swing detection
  - `wobble`: a smoothed amount of rotation plus jolt, from 0 to 1
- **Feedback:**
  - on the phone: a sound, a screen flash, and vibration (Android only)
  - on the TV: big animated reactions
- **Results:** a scoreboard with a "Play again" or "Back to Party Games" choice.

### Game 1: Quick Draw Duel (2–4 players, best of 5 rounds)
1. Everyone holds their phone **pointing at the floor at their side** (holstered). The TV shows silhouettes of cowboys/cowgirls in the player colors, and each phone shows "HOLSTER ✓" once it detects the pose.
2. Tension: wind and a tumbleweed, with a random wait of 2–7 s.
3. **"DRAW!"** is triggered by clock sync at the same moment on the TV and on all phones (flash + sound + vibration).
4. Raise the phone to level and **tap anywhere on the screen** to fire. Firing only counts while the phone is raised.
5. **Each phone measures its own reaction time,** so it's fair. The fastest wins the round, and the TV shows everyone's times ("Ben 0.312 s").
6. **False start:** lifting the phone out of the holster before DRAW means you're out for that round ("Too early!").
7. Most rounds won after 5 rounds wins the duel. Show a slow-motion replay of the winning shot on the TV (a simple animation).

### Game 2: Hot Potato (two modes)
- **Mode A: Phones (2–4 players)**
  - The bomb appears on one player's phone (ticking sound, the screen shakes, vibration).
  - To get rid of it, first solve a **mini task** on the phone in under about 1.5 s: a random one of "swipe ← / ↑ / →", "tap the 3 dots", or "tap the red one". Then **swing the phone** to throw the bomb.
  - It flies to a **random other player**; the TV animates the bomb flying between avatars.
  - The fuse is hidden and random (15–40 s), and the ticking speeds up near the end.
  - It explodes on the holder, who loses a heart (3 hearts each). The last player standing wins.
- **Mode B: One phone, any number of people (the big-group mode)**
  - **One phone is the bomb,** and people physically pass it around the room.
  - Whoever holds it must do the mini task on the screen before passing it; it beeps until the task is done.
  - When it explodes, whoever holds it is out. They're named on the TV, and the TV keeps a simple tally ("Out: Ana, Ben").
  - Guests can start this mode from their own phone. No player slot is needed.

### Game 3: Steady Hands (2–4 players, survival)
- Each phone shows **an egg on a spoon** with simple physics: tilting the phone makes the egg roll.
- Hold the phone flat in your palm. Every 5–8 s the **TV calls out an action**: "Turn around!", "Stand on one leg!", "Sit down and stand up!", "Switch hands!", "Touch your knee!", "Wave at someone!".
- Each phone tracks `wobble` and tilt. Too much tilt or a sudden jolt **drops the egg**: a splat on the phone and the TV, and you're out.
- Actions get harder and come faster over time. The last one holding an egg wins; ties are decided by the lowest average wobble.
- The TV shows each player's egg and a wobble meter, so everyone can watch the drama.

---

## 7. Camera folder: webcam + computer vision (laptop webcam)

### Shared camera core
- **Webcam:** `getUserMedia` on the TV page (works on https or localhost). Settings → Camera: choose the camera, mirror on/off, and a test view.
- **Vision:** **MediaPipe Tasks Vision** (`@mediapipe/tasks-vision`, pinned version) with the **Pose Landmarker (lite)** and the **Face Landmarker**. All processing happens locally in the browser. *(Review fix: the npm package only contains the WASM runtime. The model files `pose_landmarker_lite.task` and `face_landmarker.task` must be downloaded once into `public/assets/mediapipe/` and served locally, never fetched from Google at runtime, or the game would break offline.)*
- **Performance target:** at least 25 fps of tracking on the laptop. Show the fps in `?debug=1`, and if it's slow, lower the input resolution automatically.
- **Setup helper:** before each camera game, a "Can the camera see everyone?" screen shows outlines, plus "Step back" and "More light" hints.
- **Privacy:** a visible camera-on indicator on the TV. Frames are never stored or sent anywhere, except photos someone deliberately takes in Photo Booth.

### Camera 1: Photo Booth (easiest, build first)
- A live webcam view on the TV with fun **original filters**, using the Face Landmarker to place things on faces:
  - party hats
  - sunglasses
  - a crown
  - confetti
  - a color-grade look
  - frames
- **Any phone (guests too) is the shutter:** Photo Booth appears in their Present/Photos area as "📸 Take booth photo". It counts 3-2-1 on the TV and the phone, with a flash.
- Modes: single shot, or a **4-shot photo strip**.
- **Every photo goes straight into the Photos album** (as uploaded by "Photo Booth"), so everyone can save it immediately.

### Camera 2: Party Workout (medium)
- Choose an exercise: **squats, jumping jacks, high knees**, or **arm raises** (pick the reliable ones after testing).
- Up to **4 people** in view, using the pose landmarker's multiple-pose setting. Tell people apart by their position in the frame (left to right) and show colored outlines.
- **Counting reps:**
  - Measure joint angles (e.g. the knee angle for squats).
  - A rep counts on a full **up → down → up** cycle, with two separate thresholds so small wobbles don't count.
  - Add a minimum time per rep so twitches can't fake reps.
- **Rounds:** 30 or 60 s, with a big live counter for each person, then a leaderboard.
- **Family mode:** the counts add up toward a shared target, e.g. "100 squats together".

### Camera 3: Mirror Match (hardest, last; "copy the moves")
- This avoids needing licensed songs and professional dance choreography: **the players make the dance.**
- **1. Record:** one player does 4 moves to a beat. The beat is generated with Web Audio (several original styles), and moves are captured as pose keyframes on each beat.
- **2. Copy:** the other players try to copy the sequence. A ghost outline on the TV shows the next move.
- **Scoring:** similarity between poses, comparing normalised limb directions (shoulder → elbow, elbow → wrist, hip → knee, knee → ankle) with cosine similarity. Ratings are Perfect, Great, OK or Miss for each beat.
- Players take turns being the leader, and the highest total wins.
- If it turns out unreliable after real tests, simplify it to "Freeze Pose" (match one pose on the TV) rather than ship something frustrating.

---

## 8. Design and usability rules for everything above

### TV (a "10-foot" UI, read from the couch)
- Minimum text size 28 px at 1080p; titles 48 px or more. Keep 5% safe margins from the edges.
- High contrast, and never more than one main action per screen.
- People are identified by **name + color + emoji** everywhere (photos, songs, scores).
- Toasts for events ("Ana joined", "New photo from Ben", "Cem added a song") at the bottom-left, max 2 at once, 3 s each.

### Phone
- Main actions sit in the **bottom half** (thumb zone). Touch targets are at least 48 px.
- Every screen has a clear title and a back arrow.
- Every action shows its state: loading spinners, a success tick, and errors that explain the fix in plain words ("No connection to the TV. Is the laptop on? Tap to retry").
- Guests never see a motion-permission request unless they press something that needs it (Laser, Join as player, Party Games).

### General
- One consistent visual system: reuse the existing tokens, the Nunito font and the player colors.
- Use the `frontend-design`, `emil-design-eng` and `impeccable` skills for the visual pass at the end of each phase.
- Respect reduced motion. All sounds are synth-made (no audio files), with a master volume plus separate Music and Effects volumes.

---

## 9. New dependencies (ask before installing, as per CLAUDE.md)
| Package | Why |
|---|---|
| `multer` (or `busboy`) | Photo and slide uploads |
| `archiver` | Streaming ZIP of all photos |
| `pdfjs-dist` | PDF slides |
| `@mediapipe/tasks-vision` | Webcam pose and face tracking (or load a pinned version from jsDelivr) |
No paid services. The YouTube Data API key is optional and free.

---

## 10. Phases

### 🟩 Milestone 3: Party hub
| Phase | What | Done when |
|---|---|---|
| **43** | **Roles + folders** (built as 43a roles/join/protocol, 43b events + upload security, 43c folders + QR corner): guest/player roles, the name join flow, phone tabs, the QR corner, events (`data/events/`), the tunnel-first party link, home folders (Party Games, Arcade, Camera, Channels) from the manifests | 10 phones (simulated) join as guests and 4 as players, folders open and close with the remote, and a phone without the mkcert CA can join without a warning |
| **44** | **Photos:** upload queue with processing in the phone browser, the TV wall + grid, the phone gallery, Save via share sheet, Save selected, the ZIP, moderation, edge cases | 20 photos from 3 phones show up live on the TV and all phones; Save puts a photo into the iPhone Photos app; the ZIP downloads |
| **45** | **Music:** paste-link adding + oEmbed check, the fair queue, votes, skip vote, the mini-player, host controls, autoplay overlay; optional search with a key | 3 phones queue songs, the order is fair, a skip vote works, and a non-embeddable video is rejected with a clear message |
| **46** | **Present:** PDF/image upload (phone + laptop), the deck library, the presenter phone view, the laser, black screen, keyboard and clickers, notes | A 20-page PDF presents smoothly from a phone, the laser follows the pointer, and a `.pptx` shows the export steps |

### 🟨 Milestone 4: Party Games
| Phase | What | Done when |
|---|---|---|
| **47** | The game framework (lobby, clock sync, gestures, phone game screens, results) + **Quick Draw Duel** | 2 phones play 5 rounds; the clock offset stays under ~20 ms (shown in debug); false starts are detected |
| **48** | **Hot Potato**, both modes | Mode A with 3 phones and Mode B with a single guest phone both work start to finish |
| **49** | **Steady Hands** | 2–4 phones play; eggs drop on a real jolt but not on normal careful movement (tune with my real tests) |

### 🟦 Milestone 5: Camera
| Phase | What | Done when |
|---|---|---|
| **50** | The camera core + **Photo Booth** | Filters track faces, any phone can trigger the shutter, and photos and strips land in the album |
| **51** | **Party Workout** | 2 people doing squats in front of the webcam are counted within ±1 rep over 30 s |
| **52** | **Mirror Match**, or "Freeze Pose" if it's unreliable | A full 2-player round works and scores feel fair to me |

**Each phase ends with:** `npm test`, browser checks with simulated phones, screenshots, the design pass, commit, and the test checklist for me (collected into one YOUR TURN list at the end of an unattended run). Then push and merge into `main` if `npm test` passes (see `CLAUDE.md`).

---

## 11. Real-world test checklist (for me, at the end of each milestone)
- [ ] Friends on **iPhone and Android** join by scanning: under 10 seconds, no warnings
- [ ] 20+ photos at once: none lost, saving to the iPhone Photos app works
- [ ] Music plays for an hour without stalling; the skip vote feels fair
- [ ] Presenting a real PDF from my phone in front of people
- [ ] Party games with 3–4 people in a real room (latency and fairness)
- [ ] The webcam in a normal living-room light: tracking holds at 2–3 m distance


---

## 12. Review and fixes (done at the start of Phase 43)

Written by Claude Code after reading the whole plan. Each item is already fixed in the text above or listed as a rule for the phase that needs it.

**Wrong or risky**
1. **Tunnel vs. "everything stays local".** A cloudflared tunnel proxies all traffic (photos included) through Cloudflare, which contradicts principle 4. Fix: the tunnel is **opt-in** and the README says plainly what goes through it; the default QR stays the LAN link. Guests don't need HTTPS for Photos/Music/Present, but two features need a *secure context* (HTTPS or localhost): **Save to Photos via the share sheet** (`navigator.share({files})`) and **SHA-256 hashing / wake lock in the browser**. On plain-LAN http they fall back to a download link and server-side hashing.
2. **Duplicate-photo detection** was described client-side; `crypto.subtle` doesn't exist on http pages. Fix: the server always hashes (SHA-256) after upload; the client hash is only an optional shortcut.
3. **`createImageBitmap(file, {imageOrientation})`** is flaky on older iOS Safari. Fix: try it, fall back to `<img>` + canvas (browsers apply EXIF rotation when drawing).
4. **Mini-player** had no size, but YouTube requires a visible player of at least 200×200 px (see the fix in section 4).
5. **MediaPipe models** are not in the npm package (see section 7 fix): they are a manual download, so the camera phases must work without them (a clear "model files missing" screen) and their logic (rep counting, pose similarity) must be tested with recorded landmark data.
6. **Uploads are an open door.** Anyone on the network (or the tunnel URL) could POST files. Fix: uploads need a `clientId` that joined the room, a per-event party token, magic-byte sniffing (don't trust the MIME type), random server-side file names (no path traversal), per-client rate limits, a per-event size cap and a disk-space check. Host-only actions (hide, delete, approve, end party) are checked against the console's own socket, never a phone's claim.
7. **Protocol change.** Guests (unlimited) need an id space apart from players (P1-P4): `role` + `guestId` in the join message, and slot ids stay 1-4. This is a deliberate, backward-compatible addition to `shared/protocol.js` (documented there).
8. **Screen wake lock.** Phones sleeping during a party or a presentation would drop the connection. Fix: request `navigator.wakeLock` on the presenter/party phones and the TV page where available.
9. **Memory on the TV.** Decoding many 3000 px photos kills a laptop browser. Fix: the TV wall shows one full-size image at a time, the grid uses the 480 px thumbnails, everything else is lazy.
10. **Phase 43 was too big.** Split into 43a (roles + join + protocol), 43b (events + upload security + tunnel option), 43c (folders + QR corner).
11. **Acceptance criteria that can't be automated** (a phone without the mkcert certificate; an iPhone saving to Photos; a real hour of music) are moved to the real-world checklist (section 11); the phase's automated criteria use simulated sockets and a headless browser.
12. **Tests must not touch real data.** The server takes `DATA_DIR` (default `data/`, git-ignored); tests use a temp folder.

**Unclear, now decided**
- Players keep P1-P4 and their colors; guests get a name + emoji + their own color, never a P-number.
- "Continue last party" is the default on boot.
- Everything the plan calls "synth sounds" reuses the existing sound engine; no audio files.
- Kart racing on the TV and party features share the one socket room; a party event is not a new room.
