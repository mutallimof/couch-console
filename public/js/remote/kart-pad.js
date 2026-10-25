// Kart pad: the phone controller for Turbo Karts, held sideways.
//   Left thumb: two big buttons, ◀ LEFT and ▶ RIGHT. Holding one turns the wheel smoothly to
//   full lock (a quick tap is a small correction); let go and it straightens again. Your thumb
//   can slide from one to the other without lifting.
//   Right thumb: GAS, DRIFT, ITEM, BRAKE. Your thumb can slide between them too (e.g. GAS -> DRIFT);
//   the game keeps accelerating while DRIFT or ITEM is held.
//   Steering: Buttons, or Wheel (turn the phone like a wheel; wheel.js smooths it). Also Auto-gas and the haptics level.
// With the phone's rotation lock on, the page stays upright: then the pad turns itself sideways
// (and "Flip" turns it the other way round).
// Every way a touch can end is handled (lift, cancel, app switch), so nothing stays pressed.

const STEER_IN = 0.16;   // seconds from straight to full lock while a button is held
const STEER_OUT = 0.08;  // seconds back to straight after letting go
const MIN_CHANGE = 0.02; // don't send tiny steering changes

const load = (key) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const save = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* ignore */ } };

// Finger tracking for a zone of buttons: each finger is "on" the button under it, and can slide
// from button to button. onHold(name, fingerId) / onLetGo(name, fingerId); attr = the data attribute.
function trackFingers(zone, attr, onHold, onLetGo) {
  const fingers = new Map(); // pointerId -> button name under that finger (or null)
  const at = (x, y) => document.elementFromPoint(x, y)?.closest?.(`[data-${attr}]`)?.dataset[attr] ?? null;
  function move(e) {
    const now = at(e.clientX, e.clientY), was = fingers.get(e.pointerId);
    if (now === was) return;
    if (was != null) onLetGo(was, e.pointerId); // slid off a button...
    if (now != null) onHold(now, e.pointerId);  // ...onto the next one
    fingers.set(e.pointerId, now);
  }
  function up(e) {
    const was = fingers.get(e.pointerId);
    if (was != null) onLetGo(was, e.pointerId);
    fingers.delete(e.pointerId);
  }
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    zone.setPointerCapture(e.pointerId); // keep getting moves even outside the zone
    move(e);
  });
  zone.addEventListener('pointermove', (e) => { if (fingers.has(e.pointerId)) move(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, up);
  return { releaseAll() { for (const id of [...fingers.keys()]) up({ pointerId: id }); } };
}

// onButton(button, 'down' | 'up'), onSteer(-1..1), onTilt(on), onRecenter()
export function createKartPad({ root, onButton, onSteer, onTilt, onRecenter, haptics }) {
  const zone = root.querySelector('#kp-buttons');
  const steerZone = root.querySelector('#kp-steer');
  const buttons = [...zone.querySelectorAll('[data-kart]')];
  const steerButtons = [...steerZone.querySelectorAll('[data-steer]')];
  let tilt = load('couch.kartTilt');
  let autoGas = load('couch.kartAutoGas');
  let flipped = load('couch.kartFlip');

  // ---- Right thumb: who is holding what. A button is down while anyone (a finger or Auto-gas) holds it.
  const holders = new Map(buttons.map((b) => [b.dataset.kart, new Set()]));
  function hold(button, who) {
    const set = holders.get(button);
    if (set.has(who)) return;
    set.add(who);
    if (set.size === 1) {
      onButton(button, 'down');
      haptics?.play('tap');
      buttons.find((b) => b.dataset.kart === button).classList.add('pressed');
    }
  }
  function letGo(button, who) {
    const set = holders.get(button);
    if (!set?.delete(who) || set.size) return;
    onButton(button, 'up');
    buttons.find((b) => b.dataset.kart === button).classList.remove('pressed');
  }
  const right = trackFingers(zone, 'kart', hold, letGo);

  // ---- Left thumb: LEFT / RIGHT. The newest press wins if both are held.
  const held = []; // [{ dir: -1 | 1, finger }] in press order
  let steer = 0, target = 0, sent = NaN, last = 0, frame = 0;
  function aim() {
    target = tilt ? 0 : (held.at(-1)?.dir ?? 0);
    steerButtons.forEach((b) => b.classList.toggle('pressed', held.some((h) => String(h.dir) === b.dataset.steer)));
    if (!frame) { last = performance.now(); frame = setTimeout(ramp, 16); }
  }
  // Move the wheel toward the target a little every 16 ms, and send it
  // (a timer, not animation frames: those pause when the browser thinks the page is hidden)
  function ramp() {
    const t = performance.now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
    const rate = target === 0 || Math.sign(target) !== Math.sign(steer) ? 1 / STEER_OUT : 1 / STEER_IN;
    steer = steer < target ? Math.min(target, steer + rate * dt) : Math.max(target, steer - rate * dt);
    send(steer);
    frame = steer === target ? 0 : setTimeout(ramp, 16);
  }
  function send(value) {
    if (Math.abs(value - sent) < MIN_CHANGE && !(value === target && value !== sent)) return;
    sent = value;
    onSteer(value);
  }
  const left = trackFingers(steerZone, 'steer',
    (dir, finger) => { held.push({ dir: Number(dir), finger }); haptics?.play('tap'); aim(); },
    (dir, finger) => { const i = held.findIndex((h) => h.finger === finger && h.dir === Number(dir)); if (i >= 0) held.splice(i, 1); aim(); });

  // ---- Let go of everything (app switch, notification, leaving the kart screen)
  function releaseAll() {
    right.releaseAll();
    left.releaseAll();
    held.length = 0;
    aim();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  window.addEventListener('blur', releaseAll);

  // ---- Switches
  const tiltBtn = root.querySelector('#kp-tilt'), gasBtn = root.querySelector('#kp-autogas');
  const recenterBtn = root.querySelector('#kp-recenter'), flipBtn = root.querySelector('#kp-flip');
  const buttonsBtn = root.querySelector('#kp-buttons-mode'), hapticBtn = root.querySelector('#kp-haptic'), wheelArt = root.querySelector('.kp-wheel');
  function render() {
    tiltBtn.setAttribute('aria-pressed', tilt);
    buttonsBtn.setAttribute('aria-pressed', !tilt);
    hapticBtn.textContent = haptics ? `Haptics: ${haptics.supported ? haptics.level[0].toUpperCase() + haptics.level.slice(1) : 'not on this phone'}` : 'Haptics';
    hapticBtn.hidden = !haptics;
    gasBtn.setAttribute('aria-pressed', autoGas);
    recenterBtn.hidden = !tilt;
    steerZone.classList.toggle('tilt', tilt);
    root.classList.toggle('flipped', flipped);
  }
  function applyAutoGas() { if (autoGas) hold('A', 'auto'); else letGo('A', 'auto'); }
  const setTilt = (on) => {
    if (tilt === on) return;
    tilt = on; save('couch.kartTilt', tilt);
    left.releaseAll(); held.length = 0; aim();
    render(); onTilt(tilt);
  };
  tiltBtn.addEventListener('click', () => setTilt(true));
  buttonsBtn.addEventListener('click', () => setTilt(false));
  hapticBtn.addEventListener('click', () => { haptics?.cycle(); render(); });
  gasBtn.addEventListener('click', () => { autoGas = !autoGas; save('couch.kartAutoGas', autoGas); render(); applyAutoGas(); });
  recenterBtn.addEventListener('click', () => onRecenter());
  flipBtn.addEventListener('click', () => { flipped = !flipped; save('couch.kartFlip', flipped); render(); });
  render();

  return {
    get tilt() { return tilt; },
    get steer() { return steer; },
    // The wheel picture follows the phone (steer -1..1 turns it up to 80 degrees)
    setWheelVisual(value) { wheelArt?.style.setProperty('--wheel', `${(value * 80).toFixed(1)}deg`); },
    // The kart screen appears: Auto-gas holds GAS. It disappears: let go of everything.
    show() { applyAutoGas(); },
    hide() { releaseAll(); letGo('A', 'auto'); },
  };
}
