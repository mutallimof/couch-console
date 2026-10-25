# Couch Console

A game console that runs in your web browser, and your **phone is the controller**.
Your laptop (or a TV connected to it) shows the home menu and the games; everybody joins by scanning one QR code. No app, no account, no cloud: it all stays on your own Wi-Fi.

| Home (light) | Home (dark) |
|---|---|
| ![Home, light theme](docs/screenshots/home-light.jpg) | ![Home, dark theme](docs/screenshots/home-dark.jpg) |

| Turbo Karts | Party Games | The phone |
|---|---|---|
| ![Turbo Karts race](docs/screenshots/kart-race.jpg) | ![Quick Draw lobby](docs/screenshots/party-lobby.jpg) | ![Phone remote](docs/screenshots/phone-remote.jpg) |

## What is in it

- **Turbo Karts**: a bright toy-box kart race with 8 tracks, 8 helmeted pilots, 4 chunky karts, drift boosts, items, **cups** (Sun Cup and Star Cup, 4 races each) and a **split screen for up to 4 players**. The phone turns into a kart pad (buttons or a tilt wheel, with haptics).
- **Party Games**: *Quick Draw*, *Hot Potato* and *Steady Hands*, where every phone is a controller (holster, swing, tilt).
- **Camera**: Photo Booth (the webcam as a mirror with frames and face stickers; photos go to the party album).
- **Arcade**: Table Tennis, Air Hockey, Bowling, Target Range, Paddle Duel, Balloon Pop, Juicy Slash (Easy / Normal / Hard), Alien Strike, Gem Dungeon and Draw.
- **Channels**: **News** (live headlines with photos, a ticker, a QR code to read the story on your phone, and Today in History), Photos (a shared album), Music (a fair YouTube queue), Present (slides from your phone), Weather, Video and Timer.
- Light, Dark or Auto theme (the phones follow the TV). 1 to 4 players plus unlimited guests. Every screen works with the phone's D-pad **and** with the pointer (move the phone, tap or press A), and with a keyboard and mouse if you have no phone.

All the details (controls for every game, settings, debug tools) are in [docs/GUIDE.md](docs/GUIDE.md).

## Requirements

- A laptop or desktop with **Windows, macOS or Linux** and a modern browser (Chrome, Edge or Firefox; Chrome gives the best 3D speed).
- **[Node.js](https://nodejs.org) 20 or newer** (the "LTS" download). Check with `node -v`.
- Phones on the **same Wi-Fi** (or any phone, if you use the tunnel). No app, no account.
- Optional: [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for the https tunnel (`npm run tunnel` tells you how to install it).

## Quick start

```
git clone <this repository>
cd couch-console
npm install
npm start
```

Then open **http://localhost:3000** on the laptop, press **F11** for full screen and click the page once so the browser may play sound. A QR code shows on the screen; to use it with phones, read the next part.

## Joining with phones

1. Scan the **QR code** on the screen with the phone camera (or open `/remote.html` on the phone and type the 4-letter room code).
2. Type a name and press **Play** (you get a controller, P1 to P4) or **Just join** (a guest: Photos, Music and Present, no controller). Making your own look is optional.
3. Tap **Tap to start**. On an iPhone, allow motion access when it asks.

Phones only give out their motion sensors, the camera and the laser pointer on **secure (`https://`) pages**, so the QR code must point to an https address. Pick one:

- **The tunnel (easiest, works anywhere):** `npm run tunnel`. It starts the console and a free cloudflared tunnel together, and the QR code then sends phones to the `https://…trycloudflare.com` link. If cloudflared is not installed it prints the install step for your system.
- **Your own Wi-Fi (faster, one-time setup):** `npm run certs` makes a local certificate (needs [mkcert](https://github.com/FiloSottile/mkcert)), install it on each phone once, then use the `https://` address `npm start` prints. Step by step in [docs/GUIDE.md](docs/GUIDE.md).

No phone? On the QR screen choose **No phone? Use mouse & keyboard** (arrow keys, Enter = A, Esc = B, H = Home, mouse = pointer).

## Optional config (.env)

Everything works without any setting. To change something, copy `.env.example` to `.env` (in the project folder; it is never committed to git) and fill in what you want:

| Setting | What it does |
|---|---|
| `YOUTUBE_API_KEY` | Turns on **YouTube search** in the Video and Music channels. Without it you can still paste YouTube links; only the search box is off (with a friendly hint). |
| `PORT`, `HTTPS_PORT` | The ports (default 3000 and 3443). |
| `LAN_IP` | The Wi-Fi address for the QR code, if the wrong one is picked. |
| `PUBLIC_URL` | A public https link that reaches the console (`npm run tunnel` sets it for you). |
| `DATA_DIR` | Where photos, slides and party settings are saved (default `data/`). |

## Project structure

```
server/        the Node server (index.js) and its features: people, photos, music, slides, news, saved data, .env reading
public/
  console.html, remote.html   the laptop (TV) page and the phone page
  console/     laptop code: menu, settings, pointer layer, sound, party, slides
  phone/       phone code: remote pad, kart pad, haptics, photo booth, party games
  games/       one file per game (+ a .game.json); turbo-karts/ holds the big one
  apps/        the channels: News, Photos, Music, Present, Weather, Video, Timer
  shared/      what both sides use: socket events, theme, the picture viewer, avatars
  css/         design tokens (theme.css), shared components, one file per area
  assets/      models, icons, sounds
scripts/       tunnel, make-certs, run-tests, render-icons, screenshot and speed-check tools
tests/         automatic tests (npm test)
docs/          the guide, screenshots, and a test checklist
```

A game is a `<name>.js` plus a `<name>.game.json` in `public/games/` (or `public/apps/`); the menu finds it by itself. `npm test` runs the unit tests and, if [Playwright](https://playwright.dev) is installed (`npm install` adds it), the end-to-end tests that drive a real browser with two fake phones.

## Troubleshooting

- **The phone cannot connect / the page does not open.** The phone must be on the **same Wi-Fi** as the laptop (guest or "client isolation" networks block it), or use `npm run tunnel`. Check the address under the QR code: `localhost` only works on the laptop itself. On Windows the firewall may ask to allow Node.js: choose **Allow** (private networks).
- **The wrong address is in the QR code** (a virtual adapter, a VPN). Set `LAN_IP=192.168.x.y` in `.env` (the real Wi-Fi address; `npm start` lists every network it sees).
- **"Motion needs a secure page" / the tilt does nothing.** You opened an `http://` address. Use the tunnel or the local certificate (see above). On iPhone: Settings → Apps → Safari → Clear History and Website Data, then reload, to be asked for motion access again.
- **Camera (Photo Booth) does not start.** The browser must be allowed to use the camera: click the camera icon in the address bar and choose **Allow**. It needs `http://localhost` or an https address. The camera is only on while the Photo Booth is open.
- **No sound.** Click the laptop page once (browsers block sound until you do) and check Settings → Sound.
- **Turbo Karts is slow or stutters.** Press F3 for the speed readout. Turn **Cartoon look** and **Soft shadows** off in Settings. The game lowers its own picture quality when it cannot keep up; split screen with 3 to 4 players uses a smaller picture on purpose. Make sure the browser uses your graphics card (Chrome: Settings → System → "Use graphics acceleration").
- **`npm install` fails.** Check `node -v` (20 or newer). Delete the `node_modules` folder and run it again.

## Credits

Free assets and libraries: Kenney (car and racing kits, sounds), Quaternius (pirate kit), KayKit (one knight, for the home icon), Poly Haven (a road texture), Google MediaPipe (face tracking), three.js, GSAP, PixiJS, Howler, pdf.js, socket.io and Express. News headlines and photos come from the free public feeds of BBC News, DW and Tagesschau (headline, summary and link only); Today in History is from Wikipedia (CC BY-SA). The kart rules are a port of [OpenWii](https://github.com/pattssun/OpenWii) (MIT). Pilots, karts and everything else are original, and nothing here uses Nintendo assets.
Full list with licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
