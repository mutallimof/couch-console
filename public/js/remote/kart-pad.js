// Kart pad: the phone controller for Turbo Karts, held sideways.
//   Left thumb: the steering strip. Where your thumb is = how hard you steer (-1..1), with a
//   dead zone in the middle so a resting thumb drives straight. A marker shows your thumb.
//   Right thumb: GAS, DRIFT, ITEM, BRAKE. Your thumb can slide from one button to the next
//   without lifting (e.g. GAS -> DRIFT); the game keeps accelerating while DRIFT or ITEM is held.
//   Switches: Tilt steering (turn the phone like a wheel instead of the strip) and Auto-gas.
// Every way a touch can end is handled (lift, cancel, app switch), so nothing stays pressed.

const DEAD_ZONE = 0.1;   // the middle 10% of the strip means "straight"
const MIN_CHANGE = 0.01; // don't send tiny steering changes

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const load = (key) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const save = (key, on) => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* ignore */ } };

// onButton(button, 'down' | 'up'), onSteer(-1..1), onTilt(on), onRecenter()
export function createKartPad({ root, onButton, onSteer, onTilt, onRecenter }) {
  const strip = root.querySelector('#kp-strip');
  const thumb = root.querySelector('#kp-thumb');
  const zone = root.querySelector('#kp-buttons');
  const buttons = [...zone.querySelectorAll('[data-kart]')];
  let tilt = load('couch.kartTilt');
  let autoGas = load('couch.kartAutoGas');

  // ---- Buttons: who is holding what. A button is down while anyone (a finger or Auto-gas) holds it.
  const holders = new Map(buttons.map((b) => [b.dataset.kart, new Set()]));
  const fingers = new Map(); // pointerId -> the button under that finger (or null)
  function hold(button, who) {
    const set = holders.get(button);
    if (set.has(who)) return;
    set.add(who);
    if (set.size === 1) {
      onButton(button, 'down');
      navigator.vibrate?.(8);
      buttons.find((b) => b.dataset.kart === button).classList.add('pressed');
    }
  }
  function letGo(button, who) {
    const set = holders.get(button);
    if (!set?.delete(who) || set.size) return;
    onButton(button, 'up');
    buttons.find((b) => b.dataset.kart === button).classList.remove('pressed');
  }
  // The button under a point (only inside the button zone)
  const buttonAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-kart]')?.dataset.kart ?? null;

  function fingerAt(e) {
    const now = buttonAt(e.clientX, e.clientY), was = fingers.get(e.pointerId);
    if (now === was) return;
    if (was) letGo(was, e.pointerId); // slid off a button...
    if (now) hold(now, e.pointerId);  // ...onto the next one
    fingers.set(e.pointerId, now);
  }
  function fingerUp(e) {
    const was = fingers.get(e.pointerId);
    if (was) letGo(was, e.pointerId);
    fingers.delete(e.pointerId);
  }
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    zone.setPointerCapture(e.pointerId); // keep getting moves even outside the zone
    fingerAt(e);
  });
  zone.addEventListener('pointermove', (e) => { if (fingers.has(e.pointerId)) fingerAt(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, fingerUp);

  // ---- Steering strip
  let steerFinger = null, steer = 0, sent = NaN;
  function send(value) {
    steer = value;
    if (Math.abs(value - sent) < MIN_CHANGE && !(value === 0 && sent !== 0)) return;
    sent = value;
    onSteer(value);
  }
  // (the marker's center stays one radius inside the strip, so it's never cut off at full lock)
  function setThumb(fraction) { thumb.style.left = `calc(32px + ${fraction} * (100% - 64px))`; }
  function stripAt(e) {
    const r = strip.getBoundingClientRect();
    const f = clamp((e.clientX - r.left) / r.width, 0, 1);
    setThumb(f);
    const raw = f * 2 - 1; // -1 (left edge) .. 1 (right edge)
    // dead zone in the middle, then the rest of the way scaled back to the full -1..1
    const out = Math.abs(raw) < DEAD_ZONE ? 0 : Math.sign(raw) * (Math.abs(raw) - DEAD_ZONE) / (1 - DEAD_ZONE);
    send(out);
  }
  function stripUp(e) {
    if (e.pointerId !== steerFinger) return;
    steerFinger = null;
    strip.classList.remove('active');
    setThumb(0.5);
    send(0);
  }
  strip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (tilt || steerFinger != null) return;
    steerFinger = e.pointerId;
    strip.setPointerCapture(e.pointerId);
    strip.classList.add('active');
    stripAt(e);
  });
  strip.addEventListener('pointermove', (e) => { if (e.pointerId === steerFinger) stripAt(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) strip.addEventListener(type, stripUp);

  // ---- Let go of everything (app switch, notification, leaving the kart screen)
  function releaseAll() {
    for (const [id, button] of fingers) if (button) letGo(button, id);
    fingers.clear();
    if (steerFinger != null) stripUp({ pointerId: steerFinger });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  window.addEventListener('blur', releaseAll);

  // ---- Switches
  const tiltBtn = root.querySelector('#kp-tilt'), gasBtn = root.querySelector('#kp-autogas');
  const recenterBtn = root.querySelector('#kp-recenter');
  function render() {
    tiltBtn.setAttribute('aria-pressed', tilt);
    gasBtn.setAttribute('aria-pressed', autoGas);
    recenterBtn.hidden = !tilt;
    strip.classList.toggle('tilt', tilt);
    root.querySelector('#kp-strip-hint').textContent = tilt ? 'Tilt the phone to steer' : '◀ slide to steer ▶';
  }
  function applyAutoGas() { if (autoGas) hold('A', 'auto'); else letGo('A', 'auto'); }
  tiltBtn.addEventListener('click', () => {
    tilt = !tilt; save('couch.kartTilt', tilt);
    if (steerFinger != null) stripUp({ pointerId: steerFinger });
    render(); onTilt(tilt);
  });
  gasBtn.addEventListener('click', () => { autoGas = !autoGas; save('couch.kartAutoGas', autoGas); render(); applyAutoGas(); });
  recenterBtn.addEventListener('click', () => onRecenter());
  render();

  return {
    get tilt() { return tilt; },
    get steer() { return steer; },
    // The kart screen appears: Auto-gas holds GAS. It disappears: let go of everything.
    show() { setThumb(0.5); applyAutoGas(); },
    hide() { releaseAll(); letGo('A', 'auto'); },
  };
}
