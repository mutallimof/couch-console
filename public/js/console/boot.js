// Boot animation shown when the console page opens (about 3 s).
// Four player-colored dots swirl into a ring, then the name appears. Click, press a key,
// or press any phone button to skip it.
import { PLAYER_COLORS } from '../shared/protocol.js';

const DURATION_MS = 3300;

export function playBoot({ sound } = {}) {
  const el = document.createElement('div');
  el.className = 'boot';
  const title = 'Couch Console';
  el.innerHTML = `
    <div class="boot-stage">
      ${PLAYER_COLORS.map((c, i) => `<span class="boot-dot" style="--c:${c};--i:${i}"></span>`).join('')}
      <span class="boot-ring"></span>
    </div>
    <h1 class="boot-title">${[...title].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</h1>
    <p class="boot-tag">Grab your phone</p>`;
  document.body.append(el);
  // A short chime, if the browser already allows sound
  setTimeout(() => sound?.play('start'), 1500);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    el.classList.add('boot-out');
    setTimeout(() => el.remove(), 500);
    removeEventListener('pointerdown', finish);
    removeEventListener('keydown', finish);
  };
  addEventListener('pointerdown', finish);
  addEventListener('keydown', finish);
  setTimeout(finish, DURATION_MS);
  return { skip: finish, get playing() { return !done; } };
}
