// Photo Booth on the phone: a big shutter button, and the frames and stickers to pick from. The TV does the work
// (camera, face stickers, countdown, saving the photo to the Photos tab); this screen only asks, and shows what the TV says.
// state (from the TV): { frames: [{ id, name }], stickers: [{ id, name }], frame, sticker, status: 'idle' | 'counting' | 'saving' | 'saved', count, camera: 'on' | 'off', tracking }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createBoothPad({ root, send, onHome, haptics }) {
  const shutter = root.querySelector('#bp-shutter'), frames = root.querySelector('#bp-frames'), stickers = root.querySelector('#bp-stickers');
  const status = root.querySelector('#bp-status'), home = root.querySelector('#bp-home');
  let last = null;
  const chips = (host, list, current, kind) => {
    const key = `${current}|${list.map((x) => x.id).join()}`;
    if (host.dataset.key === key) return;
    host.dataset.key = key;
    host.innerHTML = list.map((x) => `<button type="button" data-id="${esc(x.id)}" aria-pressed="${x.id === current}">${esc(x.name)}</button>`).join('');
  };
  frames.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { send({ cmd: 'frame', id: b.dataset.id }); haptics?.play('tap'); } });
  stickers.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { send({ cmd: 'sticker', id: b.dataset.id }); haptics?.play('tap'); } });
  shutter.addEventListener('click', () => { if (!shutter.disabled) { send({ cmd: 'shoot' }); haptics?.play('item'); } });
  home?.addEventListener('click', () => onHome?.());
  return {
    update(state) {
      last = state || last;
      const s = last;
      if (!s || !s.frames) { status.textContent = 'Waiting for the TV…'; shutter.disabled = true; return; }
      chips(frames, s.frames, s.frame); chips(stickers, s.stickers, s.sticker);
      frames.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === s.frame)));
      stickers.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === s.sticker)));
      const counting = s.status === 'counting';
      shutter.disabled = s.camera !== 'on' || s.status !== 'idle';
      shutter.dataset.status = s.status;
      shutter.querySelector('b').textContent = counting ? String(Math.max(1, s.count)) : s.status === 'saved' ? '✓' : '';
      shutter.querySelector('span').textContent = counting ? 'Smile!' : s.status === 'saving' ? 'Saving…' : s.status === 'saved' ? 'Saved to Photos' : 'Take photo';
      status.textContent = s.camera !== 'on' ? 'The camera is not on yet' : s.tracking ? 'Camera is on · stickers follow faces' : 'Camera is on · frames only';
    },
  };
}
