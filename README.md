# Couch Console

A console you run in your web browser and control with your phone.

- Your **laptop** is the console. It shows a home menu and mini-games on the big screen.
- Your **phone** is the remote. You tilt it to move a pointer, tap buttons, and swing it to throw.
- A small **Node.js server** on your laptop passes the phone's input to the laptop page.

> 🚧 Work in progress. Done so far: Phase 1, pairing a phone with the laptop by QR code. Buttons, motion and games come in later phases. See `PLAN.md` for the roadmap.

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

No camera handy? Open `https://…trycloudflare.com/remote.html` on the phone and type the 4-letter room code shown on the laptop.

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
