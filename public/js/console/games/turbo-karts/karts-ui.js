// Turbo Karts menu toolkit (GSAP): the animated background, pop-in panels, the bouncy focus,
// the press squash, screen wipes, and the sounds that go with them. Every menu screen of the kart
// game (select, track, pause, results) is built from these so they all move and sound the same.
//   Focus  = scale up with a bounce + a hover tick that climbs in pitch along the row
//   Press  = squash down, spring back, "select" sound
//   Panels = pop in with back.out / elastic.out; screens never cut: a colored band wipes across
// Reduced motion: no bounce or wipe, only a short fade.
import { gsap } from 'gsap';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const FOCUS_SCALE = 1.1;

// ---- sounds (our Kenney sounds through api.sound) ----
export function menuSounds(sound) {
  return {
    focus: (step = 0) => sound.play('hover', { step }),
    press: () => sound.play('select'),
    back: () => sound.play('back'),
    pop: () => sound.play('pop'),
    go: () => sound.play('start'),
    win: () => sound.play('golden'),
  };
}

// ---- animated background: a sunburst turning slowly, floating bubbles and a racing-flag band ----
// kind: 'select' (blue to pink) · 'track' (orange to pink) · 'results' (pink to blue) · 'pause' (dim)
export function menuBackground(host, kind = 'select') {
  const bg = document.createElement('div');
  bg.className = `kk-bg kk-bg-${kind}`;
  bg.innerHTML = '<i class="kk-rays"></i><i class="kk-check"></i>' + Array.from({ length: 9 }, (_, n) => `<b class="kk-bubble" style="--n:${n}"></b>`).join('');
  host.prepend(bg);
  const tweens = [];
  if (!REDUCED) {
    tweens.push(gsap.to(bg.querySelector('.kk-rays'), { rotation: 360, duration: 90, ease: 'none', repeat: -1 }));
    tweens.push(gsap.to(bg.querySelector('.kk-check'), { backgroundPositionX: '-160px', duration: 3.2, ease: 'none', repeat: -1 }));
    bg.querySelectorAll('.kk-bubble').forEach((b, n) => {
      gsap.set(b, { x: `${(n * 37) % 100}vw`, y: `${(n * 53) % 100}vh`, scale: 0.5 + ((n * 7) % 10) / 8 });
      tweens.push(gsap.to(b, { y: `-=${14 + (n % 4) * 6}vh`, x: `+=${(n % 2 ? 1 : -1) * 6}vw`, duration: 5 + (n % 5), ease: 'sine.inOut', yoyo: true, repeat: -1 }));
    });
  }
  return { el: bg, kill() { tweens.forEach((t) => t.kill()); gsap.killTweensOf(bg.querySelectorAll('*')); bg.remove(); } };
}

// ---- panels pop in ----
// from: 'up' | 'down' | 'left' | 'right' | 'scale'. ease: back.out for panels, elastic.out for the big title
export function popIn(el, { from = 'scale', delay = 0, ease = 'back.out(1.7)', duration = 0.55, stagger = 0 } = {}) {
  if (!el || (el.length === 0)) return null;
  if (REDUCED) return gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15, delay });
  const at = { up: { y: 70 }, down: { y: -70 }, left: { x: 90 }, right: { x: -90 }, scale: {} }[from];
  return gsap.fromTo(el, { opacity: 0, scale: 0.55, ...at }, { opacity: 1, scale: 1, x: 0, y: 0, duration, delay, ease, stagger, clearProps: 'transform' });
}
export function popOut(el, { duration = 0.22, to = 'scale' } = {}) {
  if (!el) return Promise.resolve();
  if (REDUCED) return gsap.to(el, { opacity: 0, duration: 0.12 }).then();
  const at = { up: { y: -60 }, down: { y: 60 }, scale: { scale: 0.7 } }[to];
  return gsap.to(el, { opacity: 0, ...at, duration, ease: 'power2.in' }).then();
}

// ---- focus and press ----
export function focusOn(el, scale = FOCUS_SCALE) {
  if (!el) return;
  el.classList.add('kk-focus');
  gsap.killTweensOf(el, 'scale');
  if (REDUCED) return gsap.set(el, { scale });
  gsap.to(el, { scale, duration: 0.55, ease: 'elastic.out(1.1, 0.42)', overwrite: 'auto' });
}
export function focusOff(el) {
  if (!el) return;
  el.classList.remove('kk-focus');
  gsap.killTweensOf(el, 'scale');
  gsap.to(el, { scale: 1, duration: REDUCED ? 0 : 0.18, ease: 'power2.out', overwrite: 'auto' });
}
// Squash flat, then spring back up to the focused size
export function pressSquash(el, back = FOCUS_SCALE) {
  if (!el) return Promise.resolve();
  if (REDUCED) return Promise.resolve();
  gsap.killTweensOf(el, 'scale,scaleX,scaleY');
  return gsap.timeline()
    .to(el, { scaleX: back * 1.08, scaleY: back * 0.82, duration: 0.07, ease: 'power2.out' })
    .to(el, { scaleX: back, scaleY: back, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' }).then();
}
// A little nod (used for "this cannot be done" and the stat bars)
export function shakeNo(el) {
  if (!el || REDUCED) return;
  gsap.fromTo(el, { x: -10 }, { x: 0, duration: 0.45, ease: 'elastic.out(1.4, 0.3)', clearProps: 'x' });
}

// Move the focus ring along a row of items: items[i] gets the bounce, the old one shrinks, a tick climbs with i
export function moveFocus(items, from, to, sounds) {
  if (from !== to) focusOff(items[from]);
  focusOn(items[to]);
  sounds?.focus(to);
}

// ---- screen wipe: a band of the three colors sweeps over the screen, `middle` runs while it is covered ----
export function wipe(host, middle, { duration = 0.42 } = {}) {
  if (REDUCED) { middle?.(); return Promise.resolve(); }
  const veil = document.createElement('div');
  veil.className = 'kk-wipe';
  veil.innerHTML = '<i></i><i></i><i></i>';
  host.append(veil);
  const bands = veil.querySelectorAll('i');
  return new Promise((resolve) => {
    gsap.timeline({ onComplete: () => { veil.remove(); resolve(); } })
      .fromTo(bands, { xPercent: -105 }, { xPercent: 0, duration, ease: 'power3.inOut', stagger: 0.07 })
      .add(() => middle?.())
      .to(bands, { xPercent: 105, duration, ease: 'power3.inOut', stagger: 0.07 }, '+=0.08');
  });
}

// ---- a row/column of big buttons that the pad and keyboard can drive ----
// items: [{ label, hint?, color?, onPress }]. Returns { el, handle(button) -> true if used, focus(i), destroy() }
export function buttonRow(host, items, { sounds, vertical = false, startAt = 0, className = '' } = {}) {
  const row = document.createElement('div');
  row.className = `kk-row ${vertical ? 'kk-col' : ''} ${className}`;
  row.innerHTML = items.map((it, n) => `<button type="button" class="kk-btn kk-c${(it.color ?? n) % 3}" data-i="${n}"><span class="kk-btn-label">${it.label}</span>${it.hint ? `<small>${it.hint}</small>` : ''}</button>`).join('');
  host.append(row);
  const els = [...row.querySelectorAll('.kk-btn')];
  let at = startAt, busy = false;
  const setFocus = (i, silent) => {
    const from = at;
    at = (i + els.length) % els.length;
    if (silent) { focusOn(els[at]); return; }
    moveFocus(els, from, at, sounds);
  };
  focusOn(els[at]);
  els.forEach((b, i) => {
    b.addEventListener('pointerenter', () => { if (i !== at) setFocus(i); });
    b.addEventListener('click', () => press(i));
  });
  async function press(i) {
    if (busy) return;
    busy = true;
    setFocus(i, true);
    sounds?.press();
    await pressSquash(els[i]);
    busy = false;
    items[i].onPress?.();
  }
  return {
    el: row,
    get index() { return at; },
    popIn: (opts) => popIn(els, { from: 'up', stagger: 0.08, ...opts }),
    // pad / keyboard: LEFT RIGHT (UP DOWN in a column) move, A presses
    handle(button) {
      const [prev, next] = vertical ? ['UP', 'DOWN'] : ['LEFT', 'RIGHT'];
      if (button === prev || (!vertical && button === 'UP')) { setFocus(at - 1); return true; }
      if (button === next || (!vertical && button === 'DOWN')) { setFocus(at + 1); return true; }
      if (button === 'A') { press(at); return true; }
      return false;
    },
    destroy() { els.forEach((b) => gsap.killTweensOf(b)); row.remove(); },
  };
}

// The big Lilita One title: pops in with an elastic bounce, then bobs gently
export function title(host, text, { color = 'white' } = {}) {
  const h = document.createElement('h1');
  h.className = `kk-title kk-title-${color}`;
  h.setAttribute('aria-label', text);
  h.innerHTML = [...text].map((ch, n) => `<span style="--n:${n}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  host.append(h);
  const letters = h.querySelectorAll('span');
  if (REDUCED) return h;
  gsap.fromTo(letters, { y: -80, opacity: 0, rotation: () => gsap.utils.random(-25, 25) }, { y: 0, opacity: 1, rotation: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)', stagger: 0.035 });
  gsap.to(letters, { y: -6, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.08, delay: 1.2 });
  return h;
}
export const killTitle = (h) => { if (!h) return; gsap.killTweensOf(h.querySelectorAll('span')); h.remove(); };
