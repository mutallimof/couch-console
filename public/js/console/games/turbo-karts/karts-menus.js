// Turbo Karts pause and results menus (karts-menu.css). Both are a big panel that pops in over a
// moving background with a row of large buttons: ◀ ▶ (or the keyboard arrows) move, A presses.
import { gsap } from 'gsap';
import { menuSounds, menuBackground, popIn, popOut, buttonRow, title, killTitle } from './karts-ui.js';

// ---- Pause ----
// onResume / onRestart / onRacers (change racers & track) / onQuit (back to the console menu)
export function createPauseMenu({ root, sound, onResume, onRestart, onRacers, onQuit }) {
  const sfx = menuSounds(sound);
  let el = null, row = null, heading = null, bg = null, closing = false;
  const close = async (then) => {
    if (!el || closing) return;
    closing = true;
    const gone = el;
    sfx.back();
    await popOut(gone.querySelector('.kk-panel'), { to: 'down' });
    gsap.to(gone, { opacity: 0, duration: 0.15 });
    await new Promise((r) => setTimeout(r, 120));
    killTitle(heading); row?.destroy(); bg?.kill(); gone.remove();
    el = row = heading = bg = null; closing = false;
    then?.();
  };
  return {
    get isOpen() { return !!el; },
    open() {
      if (el) return;
      el = document.createElement('div');
      el.className = 'kart-pause kk-overlay';
      el.innerHTML = '<div class="kk-panel"></div>';
      root.append(el);
      bg = menuBackground(el, 'pause');
      const panel = el.querySelector('.kk-panel');
      heading = title(panel, 'Paused');
      row = buttonRow(panel, [
        { label: 'Resume', hint: 'keep racing', color: 0, onPress: () => close(onResume) },
        { label: 'Restart', hint: 'same track', color: 1, onPress: () => close(onRestart) },
        { label: 'Racers & track', hint: 'start over', color: 2, onPress: () => close(onRacers) },
        { label: 'Quit', hint: 'to the menu', color: 1, onPress: () => close(onQuit) },
      ], { sounds: sfx });
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      popIn(panel, { ease: 'elastic.out(1, 0.6)', duration: 0.9 });
      row.popIn({ delay: 0.25 });
      sfx.pop();
    },
    handle(button) {
      if (!el || closing) return false;
      if (button === 'B' || button === 'PLUS') { close(onResume); return true; }
      return row.handle(button) || true; // (everything else does nothing while paused)
    },
    destroy() { killTitle(heading); row?.destroy(); bg?.kill(); el?.remove(); el = null; },
  };
}

// ---- Results ----
// content: { banner, color, podium (html), rows (html), coop } · onAgain / onRacers / onQuit
export function createResultsMenu({ root, sound, content, onAgain, onRacers, onQuit, afterPodium }) {
  const sfx = menuSounds(sound);
  const el = document.createElement('div');
  el.className = 'kart-results kk-overlay';
  el.innerHTML = `<div class="kart-card kk-panel">
      <div class="kk-banner" style="--c:${content.color}"><span>${content.banner}</span></div>
      ${content.podium}
      ${content.rows}
    </div>`;
  root.append(el);
  const bg = menuBackground(el, 'results');
  const card = el.querySelector('.kart-card');
  const row = buttonRow(card, [
    { label: 'Race again', color: 0, onPress: onAgain },
    { label: 'Racers & track', color: 1, onPress: onRacers },
    { label: 'Menu', color: 2, onPress: onQuit },
  ], { sounds: sfx, className: 'kk-results-row' });
  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3 });
  popIn(card, { from: 'down', ease: 'elastic.out(1, 0.65)', duration: 1 });
  popIn(card.querySelector('.kk-banner'), { from: 'down', delay: 0.15, ease: 'elastic.out(1, 0.5)', duration: 0.9 });
  popIn(card.querySelectorAll('.kk-table tr'), { from: 'right', delay: 0.9, stagger: 0.05, duration: 0.4, ease: 'back.out(1.4)' });
  row.popIn({ delay: 1.3 });
  sfx.win();
  afterPodium?.(card);
  return {
    el,
    handle(button) {
      if (button === 'B') { onRacers(); return true; }
      return row.handle(button);
    },
    destroy() { row.destroy(); bg.kill(); el.remove(); },
  };
}
