// One gyro pointer per player: phones stream raw sensors (input:motion), and each frame we
// ask every player's GyroPointer where its cursor is. See gyro-pointer.js for how it works
// (learns the phone's axes, heals drift, draws slightly ahead to hide the lag).
import { Pointer } from './gyro-pointer.js';

const BASE_DEG_PER_SCREEN = 24; // turn the phone this many degrees to cross the screen (speed 5)
const STALE_MS = 500;           // no samples for this long = the phone stopped sending

export function createGyroPointers() {
  const all = new Map(); // playerId -> { pointer, lastAt, count, hz }
  let speed = 1, steady = false;

  function get(playerId) {
    let p = all.get(playerId);
    if (!p) {
      const pointer = new Pointer({ degPerScreen: BASE_DEG_PER_SCREEN });
      pointer.sensitivity = speed;
      pointer.steady = steady;
      p = { pointer, lastAt: 0, count: 0, hz: 0 };
      all.set(playerId, p);
    }
    return p;
  }

  // Count samples per second for the debug readout
  setInterval(() => { for (const p of all.values()) { p.hz = p.count; p.count = 0; } }, 1000);

  return {
    // One sensor sample from a phone
    feed(playerId, sample) {
      const p = get(playerId), now = performance.now();
      const dt = p.lastAt ? Math.min(0.1, Math.max(1 / 240, (now - p.lastAt) / 1000)) : 1 / 60;
      p.lastAt = now;
      p.count++;
      p.pointer.setViewport(innerWidth, innerHeight);
      p.pointer.aspect = innerHeight / innerWidth;
      p.pointer.update(sample, dt, now);
    },
    // Where each live player's cursor is this frame: [{ playerId, x, y }] with x, y in 0..1
    frame(now) {
      const out = [];
      for (const [playerId, p] of all) {
        if (p.pointer.live && now - p.pointer.lastSeen > STALE_MS) p.pointer.live = false;
        if (!p.pointer.live) continue;
        const pos = p.pointer.sampleAt(now);
        out.push({ playerId, x: pos.x, y: pos.y });
      }
      return out;
    },
    recenter(playerId, relearn = false) { const p = all.get(playerId)?.pointer; if (relearn) p?.relearn(); else p?.recentre(); },
    // Forget what every phone's gyro axes looked like (a layout switch can turn the phone)
    relearnAll() { for (const p of all.values()) p.pointer.relearn(); },
    remove(playerId) { all.delete(playerId); },
    // Debug: switch the "draw slightly ahead" prediction on/off for every player
    toggleLead() { for (const p of all.values()) p.pointer.displayLead = !p.pointer.displayLead; },
    // Steady cursor: use only the phone's fused orientation (slower to react, but no learned gyro map)
    setSteady(on) { steady = on; for (const p of all.values()) p.pointer.steady = on; },
    // Settings level 1 (slow) ... 10 (fast); 5 = BASE_DEG_PER_SCREEN
    setSpeed(level) {
      speed = 1.2 ** (level - 5);
      for (const p of all.values()) p.pointer.sensitivity = speed;
    },
    // A line per player for ?debug=1
    describe() {
      return [...all].map(([id, p]) => {
        const r = p.pointer.rateDps;
        return `P${id} motion ${p.hz}/s  ${p.pointer.describeMap()}\n`
          + `   yaw ${r.yaw.toFixed(0)}°/s  pitch ${r.pitch.toFixed(0)}°/s  lead ${p.pointer.displayLead ? 'on' : 'off'}  ${p.pointer.steady ? 'STEADY' : 'gyro'}`;
      });
    },
  };
}
