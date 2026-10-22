# Couch Console

A console you run in your web browser and control with your phone.

- Your **laptop** is the console. It shows a home menu and mini-games on the big screen.
- Your **phone** is the remote. You tilt it to move a pointer, tap buttons, and swing it to throw.
- A small **Node.js server** on your laptop passes the phone's input to the laptop page.

> 🚧 Work in progress. Milestone 1 is almost done: pairing, phone buttons, tilt pointer, the home menu, Balloon Pop and Draw. Two-player games come next. See `PLAN.md` for the roadmap.

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

**Terminal 2: start the https tunnel**
```
cloudflared tunnel --url http://localhost:3000
```
After a few seconds it prints a link like `https://something-random.trycloudflare.com`.

**Then:**
1. Open that `https://…trycloudflare.com` link **on your laptop**.
2. Scan the QR code on the laptop screen with your phone's camera.
3. The phone shows a big **P1** badge, and the laptop shows **P1 Connected**.
4. On the phone, tap **Tap to start**. On iPhone, tap **Allow** when it asks about motion.
5. Hold the phone like a TV remote, with its top edge pointing at the laptop screen. Turn and tilt it to move your cursor on the laptop.
6. Press **Recenter** any time to make the current direction the middle of the screen.

7. **Click the laptop page once** with your mouse or touchpad. Browsers block sound until you do. Press **F11** for full screen.

### Using the console
| Phone button | What it does |
|---|---|
| Point + **A** | open the tile you're pointing at |
| **D-pad** | move between tiles |
| **B** | go back |
| **HOME** | return to the menu from anywhere |

- **Balloon Pop:** press A to start, then point at balloons and press A to pop them. Normal balloons are +1, golden ones +3, and spiky ones −2 (your phone buzzes on Android). A round lasts 60 seconds, and your best score is saved.
- **Draw:** hold A to paint. The D-pad changes the color, + and − change the brush size, and B clears the picture.
- **Settings:** pointer speed (1 to 10), sound on/off, and **Show QR code** to connect a phone again.

If the phone can't use motion sensors, or you tapped "Don't Allow", it shows a **touchpad** instead. Drag on it to move the cursor.
On iPhone, to get the motion question again: Settings → Apps → Safari → Clear History and Website Data, then reload the page.

No camera handy? Open `https://…trycloudflare.com/remote.html` on the phone and type the 4-letter room code shown on the laptop.

**Debug mode:** add `?debug=1` to the end of the laptop link (for example `https://…trycloudflare.com/console.html?debug=1`).
On the phone, add `&debug=1` to the end of its link. You'll see live sensor numbers, messages per second and ping times.

**Good to know**
- Refreshing the phone page keeps you as P1.
- If you close the phone page, the laptop shows P1 as "Waiting…". For 30 seconds that slot is saved for the same phone, so another phone can't take it until then.
- Refreshing the laptop page makes a new room and QR code. Scan the new one with your phone.

To stop everything, press `Ctrl + C` in each terminal.

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
