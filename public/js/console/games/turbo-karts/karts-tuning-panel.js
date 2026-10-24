// The tuning panel (press T on the laptop during Turbo Karts): a slider for every number of the
// handling, camera and juice (ow-kart/tuning.js). Changes are used on the very next frame (the race
// reads the same `tuning` object), saved in this browser, and "Copy values" puts all numbers on the
// clipboard as text so they can be pasted back to become the new defaults.
import { TUNING_SCHEMA, TUNING_DEFAULTS, tuningText, clearTuning } from './ow-kart/tuning.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const decimals = (step) => (String(step).split('.')[1] || '').length;

export function createTuningPanel({ root, tuning, save }) {
  const el = document.createElement('aside');
  el.className = 'kart-tuning';
  el.hidden = true;
  el.innerHTML = `<header><b>Tuning</b><span>T = close</span></header>
    <div class="kt-scroll">${TUNING_SCHEMA.map(([group, rows], g) => `
      <details ${g === 0 ? 'open' : ''}><summary>${esc(group)}</summary>
        ${rows.map(([key, label, min, max, step]) => `
        <label class="kt-row" data-key="${key}" title="Double-click to reset this one (default ${TUNING_DEFAULTS[key]})">
          <span>${esc(label)}</span><output></output>
          <input type="range" min="${min}" max="${max}" step="${step}" value="${tuning[key]}">
        </label>`).join('')}
      </details>`).join('')}</div>
    <footer><button type="button" data-do="copy">Copy values</button><button type="button" data-do="reset">Reset all</button><span class="kt-msg" aria-live="polite"></span></footer>`;
  root.append(el);
  const msg = el.querySelector('.kt-msg');
  const say = (text) => { msg.textContent = text; clearTimeout(say.t); say.t = setTimeout(() => { msg.textContent = ''; }, 2500); };

  function show(row) {
    const [, , , , step] = TUNING_SCHEMA.flatMap(([, rows]) => rows).find((r) => r[0] === row.dataset.key);
    const v = tuning[row.dataset.key];
    row.querySelector('output').textContent = v.toFixed(decimals(step));
    row.classList.toggle('changed', v !== TUNING_DEFAULTS[row.dataset.key]);
    row.querySelector('input').value = v;
  }
  el.querySelectorAll('.kt-row').forEach(show);

  el.addEventListener('input', (e) => {
    const row = e.target.closest('.kt-row');
    if (!row) return;
    tuning[row.dataset.key] = Number(e.target.value);
    show(row);
    save();
  });
  el.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.kt-row');
    if (!row) return;
    tuning[row.dataset.key] = TUNING_DEFAULTS[row.dataset.key];
    show(row); save();
  });
  el.addEventListener('click', async (e) => {
    const what = e.target.closest('button')?.dataset.do;
    if (what === 'reset') {
      Object.assign(tuning, TUNING_DEFAULTS);
      clearTuning();
      el.querySelectorAll('.kt-row').forEach(show);
      say('Back to the defaults');
    } else if (what === 'copy') {
      const text = tuningText(tuning);
      try { await navigator.clipboard.writeText(text); say('Copied! Paste it to Claude'); } catch {
        // (no clipboard permission, e.g. plain http): show the text selected so Ctrl+C works
        const box = document.createElement('textarea');
        box.className = 'kt-text'; box.value = text; el.querySelector('.kt-scroll').prepend(box);
        box.select(); say('Press Ctrl+C to copy');
      }
    }
  });

  return {
    get open() { return !el.hidden; },
    toggle() {
      el.hidden = !el.hidden;
      if (!el.hidden) {
        el.querySelectorAll('.kt-row').forEach(show);
        import('gsap').then(({ gsap }) => gsap.fromTo(el, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.5)' })).catch(() => {});
      } else el.querySelector('.kt-text')?.remove();
    },
    destroy() { el.remove(); },
  };
}
