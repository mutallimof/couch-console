// Boot animation shown when the console page opens (about 2.7 s).
// The logo: a TV screen with a little couch inside, one cushion per player color. The screen
// draws itself, the cushions settle onto the couch, the screen lights up and the name rises in.
// Click, press a key, or press any phone button to skip it.
import { PLAYER_COLORS } from '../shared/protocol.js';

const DURATION_MS = 2700;
const REDUCED_MS = 1200;

// The logo as an inline SVG (original artwork, also usable at other sizes)
export function logoSvg(size = 250) {
  const cushions = PLAYER_COLORS.map((c, i) =>
    `<rect class="boot-cushion" style="--i:${i}" x="${52 + i * 25}" y="86" width="22" height="20" rx="6" fill="${c}"/>`).join('');
  return `<svg class="boot-logo" viewBox="0 0 200 170" width="${size}" height="${size * 0.85}" aria-hidden="true">
    <path class="boot-antenna" d="M78 22 L100 40 L122 22" fill="none" stroke="#2B3445" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <rect class="boot-screen-fill" x="22" y="40" width="156" height="108" rx="26" fill="#E7F0FD"/>
    <rect class="boot-glow" x="22" y="40" width="156" height="108" rx="26" fill="url(#boot-light)"/>
    <rect class="boot-frame" x="22" y="40" width="156" height="108" rx="26" fill="none" stroke="#2B3445" stroke-width="8" pathLength="1"/>
    <g class="boot-couch">
      <path d="M48 84 v-8 a10 10 0 0 1 10 -10 h84 a10 10 0 0 1 10 10 v8" fill="#2B3445"/>
      <rect x="38" y="84" width="14" height="30" rx="7" fill="#2B3445"/>
      <rect x="148" y="84" width="14" height="30" rx="7" fill="#2B3445"/>
      <rect x="46" y="104" width="108" height="12" rx="5" fill="#2B3445"/>
      ${cushions}
    </g>
    <defs><radialGradient id="boot-light" cx="0.5" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs>
  </svg>`;
}

export function playBoot({ sound } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.createElement('div');
  el.className = 'boot';
  const title = 'Couch Console';
  el.innerHTML = `
    ${logoSvg()}
    <h1 class="boot-title" aria-label="${title}">${[...title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</h1>
    <p class="boot-tag">Grab your phone</p>
    <p class="boot-skip">Press any button to skip</p>`;
  document.body.append(el);
  // A short chime as the screen lights up, if the browser already allows sound
  const chime = setTimeout(() => sound?.play('start'), reduced ? 0 : 900);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(chime);
    el.classList.add('boot-out');
    setTimeout(() => el.remove(), 320);
    removeEventListener('pointerdown', finish);
    removeEventListener('keydown', finish);
  };
  addEventListener('pointerdown', finish);
  addEventListener('keydown', finish);
  setTimeout(finish, reduced ? REDUCED_MS : DURATION_MS);
  return { skip: finish, get playing() { return !done; } };
}
