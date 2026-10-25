// What the camera games share: the webcam as a mirror on a canvas, a visible "Camera is on" badge, a clear message when the camera
// can't start, body tracking, and switching everything off when the game closes. Same privacy rules as Photo Booth: the picture and
// the tracking stay in this browser on the laptop; nothing is recorded, saved or sent.
//   ?posetest=1 on the console link lets a test feed pretend bodies (window.__pose.set([...])) instead of a camera.
import { createPoseTracker } from './pose-tracker.js';
import { toDisplay } from './pose-math.js';

const TEST = new URLSearchParams(location.search).get('posetest') === '1';

export function createCameraKit({ root, onStatus = () => {} }) {
  const stage = document.createElement('div');
  stage.className = 'cg-stage';
  stage.innerHTML = `<video class="cg-video" playsinline muted></video><canvas class="cg-canvas"></canvas>
    <span class="cg-cam" hidden><i></i><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.4" fill="#C2255C"/></svg>Camera is on</span>
    <span class="cg-priv">Nothing is recorded: the camera stays on this laptop</span>
    <p class="cg-msg" hidden></p>`;
  root.append(stage);
  const video = stage.querySelector('video'), canvas = stage.querySelector('canvas'), cam = stage.querySelector('.cg-cam'), msg = stage.querySelector('.cg-msg');
  let stream = null, tracker = null, token = 0, testBodies = [];
  if (TEST) window.__pose = { set(list) { testBodies = list; }, get on() { return !!stream; } };

  // the picture's box has the camera's shape (the names and counts are placed as shares of it)
  const setShape = () => { stage.style.setProperty('--ar', `${canvas.width} / ${canvas.height}`); stage.style.setProperty('--ar-num', String(canvas.width / canvas.height)); };
  const say = (text) => { msg.textContent = text; msg.hidden = !text; };

  async function start() {
    const my = ++token;
    if (TEST) { say(''); cam.hidden = false; stream = { fake: true, getTracks: () => [] }; onStatus({ camera: true, tracking: true }); return; }
    if (!navigator.mediaDevices?.getUserMedia) { say('This browser cannot use the camera here. Open the console on https:// or localhost.'); return; }
    say('Starting the camera…');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
      if (my !== token) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s; video.srcObject = s;
      await video.play().catch(() => {});
      cam.hidden = false; say('Getting the body tracking ready…');
      onStatus({ camera: true, tracking: false });
      const t = await createPoseTracker();
      if (my !== token) { t?.close(); return; }
      tracker = t;
      say(t ? '' : 'Body tracking could not start (the pose model did not load). Reload the page; if it keeps happening, see the README.');
      onStatus({ camera: true, tracking: !!t });
    } catch (err) {
      say(err.name === 'NotAllowedError' ? 'The camera is blocked. Allow it in the address bar (the camera icon), then open this game again.'
        : err.name === 'NotFoundError' ? 'No camera found on this computer.' : `The camera did not start (${err.name || 'error'}).`);
      onStatus({ camera: false, tracking: false });
    }
  }
  function stop() {
    token++;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    tracker?.close(); tracker = null;
    cam.hidden = true;
  }

  return {
    stage, video, canvas, say,
    get on() { return !!stream; },
    get tracking() { return !!tracker || TEST; },
    start, stop,
    // Draw the mirrored camera picture into the canvas; returns its size { W, H } (or null while there is no picture yet)
    drawMirror() {
      const ctx = canvas.getContext('2d');
      if (TEST) { if (canvas.width !== 1280) { canvas.width = 1280; canvas.height = 720; setShape(); } ctx.fillStyle = '#2b3445'; ctx.fillRect(0, 0, 1280, 720); return { W: 1280, H: 720, ctx }; }
      if (!stream || video.readyState < 2 || !video.videoWidth) return null;
      if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; setShape(); }
      const W = canvas.width, H = canvas.height;
      ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, W, H); ctx.restore();
      return { W, H, ctx };
    },
    // The bodies in the picture now, in display space (see pose-math.js): [{ ...landmarks }]
    bodies(now) {
      const aspect = (canvas.width || 16) / (canvas.height || 9);
      if (TEST) return testBodies.map((b) => b.map((p) => ({ ...p, vis: (p.vis ?? p.v ?? 1) > 0.4 })));
      if (!tracker) return [];
      return tracker.detect(video, now).map((lm) => toDisplay(lm, aspect));
    },
    aspect: () => (canvas.width || 16) / (canvas.height || 9),
    destroy() { stop(); stage.remove(); if (TEST) delete window.__pose; },
  };
}
