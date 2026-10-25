// Turbo Karts first menu: Single Race or a cup. Big toy-box cards, D-pad (◀ ▶, A, B) or pointer (point and tap / A).
import { CUPS } from './karts-cups.js';

const ART = {
  race: '<svg viewBox="0 0 96 64" aria-hidden="true"><rect x="8" y="10" width="6" height="46" rx="3" fill="#6B4A2B"/><path d="M14 12h60l-10 12 10 12H14z" fill="#fff"/><path d="M14 12h15v12H14zm30 0h15v12H44zM29 24h15v12H29zm30 0h15v12H59z" fill="#2B3445"/></svg>',
  sun: '<svg viewBox="0 0 96 64" aria-hidden="true"><circle cx="48" cy="30" r="14" fill="#FFD43B"/><g stroke="#FFB020" stroke-width="5" stroke-linecap="round">' + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path transform="rotate(${a} 48 30)" d="M48 6v6"/>`).join('') + '</g><path d="M30 58h36l-4-14H34z" fill="#FFB020"/><rect x="38" y="56" width="20" height="5" rx="2" fill="#8A5A00"/></svg>',
  star: '<svg viewBox="0 0 96 64" aria-hidden="true"><polygon points="48.0,10.0 53.6,24.3 68.9,25.2 57.0,34.9 60.9,49.8 48.0,41.5 35.1,49.8 39.0,34.9 27.1,25.2 42.4,24.3" fill="#C8B6FF" stroke="#7C5CFA" stroke-width="4" stroke-linejoin="round"/><circle cx="48" cy="32" r="5" fill="#7C5CFA"/></svg>',
};
const OPTIONS = [
  { id: 'race', title: 'Single Race', sub: 'Pick any track', color: '#2F80ED' },
  ...CUPS.map((c) => ({ id: c.id, title: c.name, sub: `4 races · ${c.blurb.split(':')[0].replace('Four ', '').replace('Four ', '')}`, color: c.color, cup: c })),
];

// onPick('race' | cup id) · onExit()
export function createKartMenu({ root, sound, onPick, onExit }) {
  let index = 0;
  const el = document.createElement('div');
  el.className = 'kart-menu';
  el.innerHTML = `<h1 class="ks-title">Turbo Karts</h1><p class="km-sub">What shall we race?</p>
    <div class="km-cards">${OPTIONS.map((o, i) => `<div class="km-card ui-focus" data-ui data-i="${i}" style="--c:${o.color}">
      <div class="km-art">${ART[o.id] || ART.race}</div><b>${o.title}</b><span>${o.cup ? o.cup.blurb : o.sub}</span></div>`).join('')}</div>
    <p class="ks-hint">◀ ▶ choose · A = go · B = back</p>
    <button type="button" class="ui-btn ghost ks-back" data-key="B">‹ Back</button>`;
  root.append(el);
  const cards = [...el.querySelectorAll('.km-card')];
  const draw = () => cards.forEach((c, i) => c.classList.toggle('focused', i === index));
  el.addEventListener('ui-hover', (ev) => { const c = ev.target.closest?.('.km-card'); if (c && Number(c.dataset.i) !== index) { index = Number(c.dataset.i); sound.play('hover'); draw(); } });
  draw();
  return {
    onButton({ button, state }) {
      if (state !== 'down') return;
      if (button === 'LEFT' || button === 'UP') { index = (index + OPTIONS.length - 1) % OPTIONS.length; sound.play('hover'); draw(); }
      else if (button === 'RIGHT' || button === 'DOWN') { index = (index + 1) % OPTIONS.length; sound.play('hover'); draw(); }
      else if (button === 'A') { sound.play('select'); onPick(OPTIONS[index].id); }
      else if (button === 'B') onExit();
    },
    destroy: () => el.remove(),
  };
}
