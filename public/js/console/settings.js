// Settings screen. It uses the same interface as a game, so the menu can open it like one.
//   D-pad up/down: choose a row · left/right: change the value · A: press · B: back
// Pointer + A also works on every control.

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round">
  <path d="M8 14h32M8 24h32M8 34h32"/>
  <circle cx="30" cy="14" r="4.5" fill="#fff"/><circle cx="16" cy="24" r="4.5" fill="#fff"/><circle cx="26" cy="34" r="4.5" fill="#fff"/>
</svg>`;

// prefs: { getSensitivity(), setSensitivity(n), getPhoneSounds(), setPhoneSounds(on), showQR() } from main.js
const ROWS = 4;

export function createSettings(prefs) {
  let root, api, row = 0;

  function render() {
    const level = prefs.getSensitivity();
    const bars = Array.from({ length: 10 }, (_, i) => `<span class="lvl ${i < level ? 'on' : ''}"></span>`).join('');
    root.innerHTML = `
      <div class="settings">
        <h1>Settings</h1>
        <div class="set-row" data-row="0">
          <span class="set-label">Pointer speed</span>
          <button class="set-btn" data-action="sens-down">−</button>
          <span class="levels">${bars}</span>
          <button class="set-btn" data-action="sens-up">+</button>
        </div>
        <div class="set-row" data-row="1">
          <span class="set-label">Sound</span>
          <button class="set-btn wide" data-action="mute">${api.sound.muted ? 'Off' : 'On'}</button>
        </div>
        <div class="set-row" data-row="2">
          <span class="set-label">Phone sounds</span>
          <button class="set-btn wide" data-action="phone-sounds">${prefs.getPhoneSounds() ? 'On' : 'Off'}</button>
        </div>
        <div class="set-row" data-row="3">
          <span class="set-label">Add a phone</span>
          <button class="set-btn wide" data-action="qr">Show QR code</button>
        </div>
        <p class="set-hint">D-pad to choose · A to press · B to go back</p>
      </div>`;
    root.querySelectorAll('.set-row').forEach((r, i) => r.classList.toggle('focused', i === row));
  }

  function act(action) {
    if (action === 'sens-down' || action === 'sens-up') {
      const next = prefs.getSensitivity() + (action === 'sens-up' ? 1 : -1);
      if (next < 1 || next > 10) return;
      prefs.setSensitivity(next);
      api.sound.play('tick');
    } else if (action === 'mute') {
      api.sound.setMuted(!api.sound.muted);
      api.sound.play('select');
    } else if (action === 'phone-sounds') {
      prefs.setPhoneSounds(!prefs.getPhoneSounds());
      api.sound.play('select');
    } else if (action === 'qr') {
      api.sound.play('select');
      prefs.showQR();
    }
    render();
  }

  function onButton({ playerId, button, state }) {
    if (state !== 'down') return;
    if (button === 'B') return api.exit();
    if (button === 'UP' || button === 'DOWN') {
      row = (row + (button === 'DOWN' ? 1 : ROWS - 1)) % ROWS;
      api.sound.play('hover');
      return render();
    }
    if (button === 'LEFT' || button === 'RIGHT') {
      if (row === 0) act(button === 'RIGHT' ? 'sens-up' : 'sens-down');
      return;
    }
    if (button === 'A') {
      // A pointer over a control wins; otherwise press the focused row's main control.
      const p = api.pointer(playerId);
      const hit = p && document.elementFromPoint(p.x, p.y)?.closest('[data-action]');
      if (hit && root.contains(hit)) return act(hit.dataset.action);
      act(['sens-up', 'mute', 'phone-sounds', 'qr'][row]);
    }
  }

  return {
    id: 'settings',
    title: 'Settings',
    color: '#8A94A6',
    icon: ICON,
    minPlayers: 1,
    maxPlayers: 1, // only the menu driver (P1) changes settings
    mount(container, gameApi) {
      api = gameApi;
      root = container;
      row = 0;
      api.onButton(onButton);
      render();
    },
    unmount() {
      root.innerHTML = '';
    },
  };
}
