// Connects the shared viewer (shared/viewer.js) on the TV to the phones: zoom, pan, fit and full screen commands go to whichever
// viewer is open (slides, a photo), and the phones are told when one is open so they can show their zoom keys.
// Full screen is only allowed by the browser after a real click or key press on the laptop. A phone's request waits for the next
// one ("press F or click"), and the laptop's own F key / button does it at once.
import { EV } from '../shared/protocol.js';

export function createViewerHub({ socket, notify = () => {} }) {
  const providers = new Set(); // functions returning the open viewer (or null)
  let pendingFs = false, timer = 0, lastSent = '';
  const active = () => { for (const p of providers) { const v = p(); if (v) return v; } return null; };

  function announce() {
    const v = active();
    const msg = v ? { active: true, ...v.state() } : { active: false };
    const key = JSON.stringify(msg);
    if (key !== lastSent) { lastSent = key; socket.emit(EV.VIEWER_STATE, msg); }
  }
  const hub = {
    add(provider) { providers.add(provider); hub.changed(); return () => { providers.delete(provider); hub.changed(); }; },
    changed() { cancelAnimationFrame(timer); timer = requestAnimationFrame(announce); },
    get active() { return active(); },
    // Called from a real click / key (works at once) or from a phone message (waits for the next real gesture)
    async fullscreen(real = false) {
      const v = active();
      if (document.fullscreenElement) { await document.exitFullscreen().catch(() => {}); return; }
      const res = await (v || { fullscreen: async () => 'blocked' }).fullscreen(document.documentElement);
      if (res === 'blocked' && !real) { pendingFs = true; notify('Press F or click the screen for full screen'); }
    },
    // the TV's own controls, and D-pad keys while zoomed in, are handled by the screens themselves
    zoomed: () => !!active()?.zoomed,
  };
  // the next real click or key press on the laptop completes a full screen asked for by a phone
  const gesture = (e) => { if (pendingFs && e.isTrusted) { pendingFs = false; document.documentElement.requestFullscreen?.().catch(() => {}); } };
  addEventListener('pointerdown', gesture, true);
  addEventListener('keydown', gesture, true);
  document.addEventListener('fullscreenchange', () => hub.changed());

  socket.on(EV.VIEWER_CMD, (c) => {
    const v = active();
    if (!v) return;
    if (c.op === 'zoom') v.zoomBy(c.f > 0 ? c.f : 1.3);
    else if (c.op === 'pan') v.panBy(c.dx || 0, c.dy || 0);
    else if (c.op === 'fit') v.toggleFit();
    else if (c.op === 'reset') v.reset();
    else if (c.op === 'fs') hub.fullscreen(false);
  });
  return hub;
}
