// Photo Booth: the laptop's (or TV's) webcam as a big mirror with original frames and face stickers (hats, glasses, crowns)
// that follow up to 4 faces. 3-2-1, a flash, and the photo goes to the party's Photos wall. Phones can press the shutter and pick
// the frame and sticker from their own screen.
//   D-pad: ◀ ▶ frame · ▲ ▼ sticker · A = take a photo · B = back to the menu
// Privacy: everything stays on this laptop (the face tracking runs in the browser, photos only go to this server's album);
// the camera is switched off the moment you leave, and a "Camera is on" badge shows while it is on.
import { party } from '../console/party.js';
import { FRAMES, drawFrame } from './photo-booth/booth-frames.js';
import { STICKERS, faceAnchor, drawSticker } from './photo-booth/booth-stickers.js';
import { createFaceTracker } from './photo-booth/booth-faces.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="#fff"><path d="M6 15h8l3-5h14l3 5h8v24H6z"/><circle cx="24" cy="26" r="8" fill="#C2255C"/><circle cx="24" cy="26" r="5"/></svg>`;
const STICKER_CHOICES = [{ id: 'none', name: 'No sticker' }, ...STICKERS, { id: 'mix', name: 'Mix it up' }];
const COUNT_FROM = 3;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

let api, root, els, stream, raf, tracker, alive = 0;
let state; // { frame, sticker, status, count, shot }

// Pure helpers (also used by the tests)
export const wrapIndex = (i, n) => ((i % n) + n) % n;
export function stickerFor(choice, faceIndex) {
  if (choice === 'none') return null;
  if (choice === 'mix') return STICKERS[faceIndex % STICKERS.length].id;
  return choice;
}

function say(text) { els.msg.textContent = text; els.msg.hidden = !text; }

function publish() {
  api?.emitBooth?.({
    frames: FRAMES.map(({ id, name }) => ({ id, name })), stickers: STICKER_CHOICES.map(({ id, name }) => ({ id, name })),
    frame: FRAMES[state.frame].id, sticker: STICKER_CHOICES[state.sticker].id, status: state.status, count: state.count, camera: stream ? 'on' : 'off', tracking: !!tracker,
  });
}

function renderControls() {
  els.frame.textContent = FRAMES[state.frame].name;
  els.sticker.textContent = STICKER_CHOICES[state.sticker].name;
  els.shutter.disabled = state.status !== 'idle' || !stream;
  els.stage.dataset.status = state.status;
  publish();
}

// ---------- The picture ----------

function draw(now) {
  raf = requestAnimationFrame(draw);
  const v = els.video, c = els.canvas;
  if (!stream || v.readyState < 2 || !v.videoWidth) return;
  if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
  const W = c.width, H = c.height, ctx = c.getContext('2d');
  ctx.save();
  ctx.translate(W, 0); ctx.scale(-1, 1); // a mirror: what you see is what you would see in a mirror
  ctx.drawImage(v, 0, 0, W, H);
  ctx.restore();
  const faces = tracker ? tracker.detect(v, now) : [];
  els.faces.textContent = tracker ? (faces.length ? `${faces.length} ${faces.length === 1 ? 'face' : 'faces'}` : 'Step into the picture') : '';
  faces.slice(0, 4).forEach((lm, i) => { const id = stickerFor(STICKER_CHOICES[state.sticker].id, i); if (id) drawSticker(ctx, id, faceAnchor(lm, W, H, true)); });
  drawFrame(ctx, FRAMES[state.frame].id, W, H, now / 1000, new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }));
}

// ---------- Taking the photo ----------

let counting = 0;
function shoot() {
  if (state.status !== 'idle' || !stream) return;
  state.status = 'counting'; state.count = COUNT_FROM;
  renderControls();
  const token = ++counting;
  const tick = () => {
    if (token !== counting || !alive) return;
    els.count.textContent = state.count > 0 ? String(state.count) : '';
    els.count.classList.remove('pop'); void els.count.offsetWidth; els.count.classList.add('pop');
    if (state.count > 0) { api.sound.play('tick'); publish(); setTimeout(() => { state.count -= 1; tick(); }, 1000); } else capture();
  };
  tick();
}

function capture() {
  api.sound.play('pop');
  els.flash.classList.remove('go'); void els.flash.offsetWidth; els.flash.classList.add('go');
  els.canvas.toBlob((blob) => {
    if (!blob) { state.status = 'idle'; renderControls(); return; }
    const url = URL.createObjectURL(blob);
    els.shot.querySelector('img').src = url;
    els.shot.classList.add('show');
    setTimeout(() => { els.shot.classList.remove('show'); setTimeout(() => URL.revokeObjectURL(url), 600); }, 3200);
    upload(blob).then((ok) => {
      state.status = 'saved'; renderControls();
      party.toast(ok ? '📸 Saved to the Photos wall' : '⚠️ Could not save the photo');
      setTimeout(() => { if (alive && state.status === 'saved') { state.status = 'idle'; renderControls(); } }, 2200);
    });
  }, 'image/jpeg', 0.92);
  state.status = 'saving'; state.count = 0; els.count.textContent = '';
  renderControls();
}

// The photo goes to the party album as "Photo Booth" (the host may always add photos)
async function upload(blob) {
  try {
    const form = new FormData();
    form.append('photo', blob, 'photo-booth.jpg');
    const t = document.createElement('canvas'), k = 480 / els.canvas.width; t.width = 480; t.height = Math.round(els.canvas.height * k);
    t.getContext('2d').drawImage(els.canvas, 0, 0, t.width, t.height);
    const thumb = await new Promise((r) => t.toBlob(r, 'image/jpeg', 0.8));
    if (thumb) form.append('thumb', thumb, 'thumb.jpg');
    form.append('w', String(els.canvas.width)); form.append('h', String(els.canvas.height)); form.append('booth', '1');
    const res = await party.upload('/photos', form);
    return res.ok;
  } catch { return false; }
}

// ---------- Controls ----------

function stepFrame(dir) { state.frame = wrapIndex(state.frame + dir, FRAMES.length); api.sound.play('hover'); renderControls(); }
function stepSticker(dir) { state.sticker = wrapIndex(state.sticker + dir, STICKER_CHOICES.length); api.sound.play('hover'); renderControls(); }
export function applyCommand(cmd) { // from a phone
  if (cmd.cmd === 'shoot') return shoot();
  const ids = cmd.cmd === 'frame' ? FRAMES : STICKER_CHOICES;
  const key = cmd.cmd === 'frame' ? 'frame' : 'sticker';
  const at = cmd.id ? ids.findIndex((x) => x.id === cmd.id) : -1;
  state[key] = at >= 0 ? at : wrapIndex(state[key] + (cmd.dir || 1), ids.length);
  renderControls();
}

function onButton({ button, state: s, playerId }) {
  if (s !== 'down') return;
  if (button === 'B') return api.exit();
  if (button === 'A') {
    // a pointer over a control wins; otherwise the shutter
    const p = api.pointer(playerId), hit = p && document.elementFromPoint(p.x, p.y)?.closest('[data-act]');
    if (hit && root.contains(hit)) return act(hit.dataset.act);
    return shoot();
  }
  if (button === 'LEFT') stepFrame(-1);
  else if (button === 'RIGHT') stepFrame(1);
  else if (button === 'UP') stepSticker(-1);
  else if (button === 'DOWN') stepSticker(1);
}
function act(name) {
  if (name === 'shoot') shoot();
  else if (name === 'frame-') stepFrame(-1);
  else if (name === 'frame+') stepFrame(1);
  else if (name === 'sticker-') stepSticker(-1);
  else if (name === 'sticker+') stepSticker(1);
  else if (name === 'back') api.exit();
}

// ---------- Camera ----------

async function startCamera(token) {
  if (!navigator.mediaDevices?.getUserMedia) return say('This browser cannot use the camera here. Open the console on https:// or localhost.');
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    if (token !== alive) { s.getTracks().forEach((t) => t.stop()); return; }
    stream = s;
    els.video.srcObject = s;
    await els.video.play().catch(() => {});
    say('');
    els.cam.hidden = false;
    renderControls();
    // Face stickers load in the background: the booth works (with frames) before they are ready
    createFaceTracker().then((t) => { if (token === alive) { tracker = t; els.faces.textContent = ''; renderControls(); if (!t) say('Face stickers are off (the face model could not load), frames still work.'); } else t?.close(); });
  } catch (err) {
    const why = err.name === 'NotAllowedError' ? 'The camera is blocked. Allow it in the address bar (the camera icon), then open Photo Booth again.'
      : err.name === 'NotFoundError' ? 'No camera found on this computer.' : `The camera did not start (${err.name || 'error'}).`;
    say(why);
    renderControls();
  }
}
function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (els?.video) els.video.srcObject = null;
}

export default {
  id: 'photo-booth',
  title: 'Photo Booth',
  color: '#C2255C',
  icon: ICON,
  minPlayers: 1,
  maxPlayers: 4,
  mount(container, gameApi) {
    api = gameApi;
    const token = ++alive;
    state = { frame: 0, sticker: 0, status: 'idle', count: 0 };
    root = document.createElement('div');
    root.className = 'booth';
    root.innerHTML = `
      <div class="booth-stage" data-status="idle">
        <video class="booth-video" playsinline muted></video>
        <canvas class="booth-canvas"></canvas>
        <div class="booth-top">
          <span class="booth-cam" hidden><i></i><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.4" fill="#C2255C"/></svg>Camera is on</span>
          <span class="booth-priv">Photos stay on this laptop</span>
          <span class="booth-faces"></span>
        </div>
        <div class="booth-count"></div>
        <div class="booth-flash"></div>
        <div class="booth-shot"><img alt=""><span>Saved to the Photos wall</span></div>
        <p class="booth-msg" hidden></p>
      </div>
      <div class="booth-bar">
        <div class="booth-pick"><button data-act="frame-" aria-label="Previous frame">◀</button><span><small>Frame</small><b class="b-frame"></b></span><button data-act="frame+" aria-label="Next frame">▶</button></div>
        <button class="booth-shutter ui-btn primary" data-act="shoot"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>Take photo</button>
        <div class="booth-pick"><button data-act="sticker-" aria-label="Previous sticker">▲</button><span><small>Sticker</small><b class="b-sticker"></b></span><button data-act="sticker+" aria-label="Next sticker">▼</button></div>
      </div>
      <p class="booth-hints ui-hints"><span><kbd>A</kbd> Photo</span><span><kbd>◀▶</kbd> Frame</span><span><kbd>▲▼</kbd> Sticker</span><span><kbd>B</kbd> Back</span></p>`;
    container.append(root);
    els = {
      stage: root.querySelector('.booth-stage'), video: root.querySelector('video'), canvas: root.querySelector('canvas'), cam: root.querySelector('.booth-cam'), faces: root.querySelector('.booth-faces'),
      count: root.querySelector('.booth-count'), flash: root.querySelector('.booth-flash'), shot: root.querySelector('.booth-shot'), msg: root.querySelector('.booth-msg'),
      frame: root.querySelector('.b-frame'), sticker: root.querySelector('.b-sticker'), shutter: root.querySelector('.booth-shutter'),
    };
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
    api.onButton(onButton);
    api.onBooth?.(applyCommand);
    api.setController('booth');
    renderControls();
    say('Starting the camera…');
    raf = requestAnimationFrame(draw);
    startCamera(token);
  },
  unmount() {
    alive++; counting++;
    cancelAnimationFrame(raf);
    stopCamera();
    tracker?.close(); tracker = null;
    api?.emitBooth?.({ camera: 'off' });
    root?.remove();
    api = root = els = null;
  },
};
