// The avatar maker on the phone (Phase 55): a big preview and one little stepper per part.
// `onChange(avatar)` is called on every change; call the returned `set(avatar)` to load another face.
import { PARTS, LIMITS, SKINS, HAIR_COLORS, BGS, avatarSvg, cleanAvatar, randomAvatar } from '../shared/avatar.js';

export function mountAvatarEditor(host, start, onChange) {
  let a = cleanAvatar(start);
  host.classList.add('av-edit');
  host.innerHTML = `<div class="av-preview"></div><div class="av-rows"></div><button type="button" class="join-btn ghost av-random">🎲 Surprise me</button>`;
  const preview = host.querySelector('.av-preview'), rows = host.querySelector('.av-rows');
  const swatch = { skin: SKINS, hairColor: HAIR_COLORS, bg: BGS };
  const label = (key, names) => (swatch[key] ? `<i style="background:${swatch[key][a[key]]}"></i>` : names[a[key]]);
  function draw() {
    preview.innerHTML = avatarSvg(a, 112);
    rows.innerHTML = PARTS.map(([key, title, names]) => `
      <div class="av-row"><span>${title}</span>
        <button type="button" data-k="${key}" data-d="-1" aria-label="Previous ${title}">‹</button>
        <b>${label(key, names)}</b>
        <button type="button" data-k="${key}" data-d="1" aria-label="Next ${title}">›</button></div>`).join('');
  }
  host.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]');
    if (b) { const k = b.dataset.k; a = { ...a, [k]: (a[k] + Number(b.dataset.d) + LIMITS[k]) % LIMITS[k] }; draw(); onChange(a); }
    else if (ev.target.closest('.av-random')) { a = randomAvatar(); draw(); onChange(a); }
  });
  draw();
  return { set(next) { a = cleanAvatar(next); draw(); }, get: () => a };
}
