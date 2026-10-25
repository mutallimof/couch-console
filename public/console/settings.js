// Settings screen. It uses the same interface as a game, so the menu can open it like one.
//   D-pad up/down: choose a row · left/right: change the value · A: press · B: back
// Pointer + A also works on every control.
// Settings has a second page, "Party" (Phase 43): the party's name, a new party, photo approval,
// the photo limit, and ending the party (which asks three times).
import { graphics } from './graphics-prefs.js';
import { party } from './party.js';
import { PHOTO_LIMITS_GB } from '../shared/protocol.js';
import { nextChoice } from '../shared/theme.js';

const ICON = `<svg viewBox="0 0 48 48" width="64" height="64" aria-hidden="true" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round">
  <path d="M8 14h32M8 24h32M8 34h32"/>
  <circle cx="30" cy="14" r="4.5" fill="#fff"/><circle cx="16" cy="24" r="4.5" fill="#fff"/><circle cx="26" cy="34" r="4.5" fill="#fff"/>
</svg>`;

// prefs: { getSensitivity(), setSensitivity(n), getPhoneSounds(), setPhoneSounds(on), showQR() } from main.js
const MAIN_ACTIONS = ['theme', 'sens-up', 'mute', 'phone-sounds', 'steady', 'cartoon', 'ao', 'debug', 'party', 'qr'];
const PARTY_ACTIONS = ['rename', 'new-party', 'approve', 'limit-up', 'music-pause', 'download', 'end-party', 'back'];
const THEME_LABELS = { light: 'Light', dark: 'Dark', auto: 'Auto' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createSettings(prefs) {
  let root, api, row = 0, page = 'main';
  let endStep = 0; // "End party": 0 = not asked, 1-2 = asked, the third A deletes
  let message = '';
  const actions = () => (page === 'main' ? MAIN_ACTIONS : PARTY_ACTIONS);

  function renderMain() {
    const level = prefs.getSensitivity();
    const bars = Array.from({ length: 10 }, (_, i) => `<span class="lvl ${i < level ? 'on' : ''}"></span>`).join('');
    const on = (v) => (v ? 'On' : 'Off');
    return `
        <h1>Settings</h1>
        <div class="set-row ui-row ui-focus" data-row="0"><span class="set-label label">Theme</span>
          <button class="set-btn ui-btn wide" data-action="theme">${THEME_LABELS[prefs.getTheme()]}</button></div>
        <div class="set-row ui-row ui-focus" data-row="1">
          <span class="set-label label">Pointer speed</span>
          <button class="set-btn ui-btn" data-action="sens-down">−</button>
          <span class="levels">${bars}</span>
          <button class="set-btn ui-btn" data-action="sens-up">+</button>
        </div>
        <div class="set-row ui-row ui-focus" data-row="2"><span class="set-label label">Sound</span>
          <button class="set-btn ui-btn wide" data-action="mute">${api.sound.muted ? 'Off' : 'On'}</button></div>
        <div class="set-row ui-row ui-focus" data-row="3"><span class="set-label label">Phone sounds</span>
          <button class="set-btn ui-btn wide" data-action="phone-sounds">${on(prefs.getPhoneSounds())}</button></div>
        <div class="set-row ui-row ui-focus" data-row="4"><span class="set-label label">Steady cursor</span>
          <button class="set-btn ui-btn wide" data-action="steady">${on(prefs.getSteady())}</button></div>
        <div class="set-row ui-row ui-focus" data-row="5"><span class="set-label label">Cartoon look (karts)</span>
          <button class="set-btn ui-btn wide" data-action="cartoon">${on(graphics.cartoon)}</button></div>
        <div class="set-row ui-row ui-focus" data-row="6"><span class="set-label label">Soft shadows (karts)</span>
          <button class="set-btn ui-btn wide" data-action="ao">${on(graphics.ao)}</button></div>
        <div class="set-row ui-row ui-focus" data-row="7"><span class="set-label label">Debug readout (fps, ping)</span>
          <button class="set-btn ui-btn wide" data-action="debug">${on(prefs.getDebug())}</button></div>
        <div class="set-row ui-row ui-focus" data-row="8"><span class="set-label label">Party</span>
          <button class="set-btn ui-btn wide" data-action="party">Open ›</button></div>
        <div class="set-row ui-row ui-focus" data-row="9"><span class="set-label label">Add a phone</span>
          <button class="set-btn ui-btn wide" data-action="qr">Show QR code</button></div>
        <p class="set-hint">Theme: Light, Dark or Auto (follows this laptop); the phones follow it too. Steady cursor: turn it On if the cursor wanders or shakes. Cartoon look and soft shadows make Turbo Karts prettier; turn them Off if it runs slowly. D-pad to choose · A to press · B to go back</p>`;
  }

  function renderParty() {
    const ev = party.event || {}, s = ev.settings || {};
    const people = party.people.filter((p) => p.online);
    const end = ['End party & delete data', 'Delete everything? Press A again', 'Really? This cannot be undone. A again'][endStep];
    return `
        <h1>Party</h1>
        <div class="set-row ui-row ui-focus" data-row="0"><span class="set-label label">Name</span>
          <button class="set-btn ui-btn wide" data-action="rename">${esc(ev.name || '…')} ✎</button></div>
        <div class="set-row ui-row ui-focus" data-row="1"><span class="set-label label">Start a new party</span>
          <button class="set-btn ui-btn wide" data-action="new-party">New ›</button></div>
        <div class="set-row ui-row ui-focus" data-row="2"><span class="set-label label">Approve photos first</span>
          <button class="set-btn ui-btn wide" data-action="approve">${s.approvePhotos ? 'On' : 'Off'}</button></div>
        <div class="set-row ui-row ui-focus" data-row="3"><span class="set-label label">Photo storage limit</span>
          <button class="set-btn ui-btn wide" data-action="limit-up">${s.photoLimitGB ?? 3} GB</button></div>
        <div class="set-row ui-row ui-focus" data-row="4"><span class="set-label label">Pause music in games</span>
          <button class="set-btn ui-btn wide" data-action="music-pause">${s.pauseMusicInGames === false ? 'Off' : 'On'}</button></div>
        <div class="set-row ui-row ui-focus" data-row="5"><span class="set-label label">All photos</span>
          <button class="set-btn ui-btn wide" data-action="download">Download ZIP ⬇</button></div>
        <div class="set-row ui-row ui-focus ${endStep ? 'danger' : ''}" data-row="6"><span class="set-label label">${endStep ? '⚠️' : ''} Danger zone</span>
          <button class="set-btn ui-btn wide" data-action="end-party">${end}</button></div>
        <div class="set-row ui-row ui-focus" data-row="7"><span class="set-label label"> </span>
          <button class="set-btn ui-btn wide" data-action="back">‹ Back</button></div>
        <p class="set-hint">${message || `${people.length} here now (${people.filter((p) => p.role === 'player').length} playing). Data is saved on this laptop in the data folder. B = back`}</p>`;
  }

  function render() {
    root.innerHTML = `<div class="settings theme-bg">${page === 'main' ? renderMain() : renderParty()}</div>`;
    root.querySelectorAll('.set-row').forEach((r, i) => r.classList.toggle('focused', i === row));
    root.querySelector('.set-row.focused')?.scrollIntoView({ block: 'nearest' });
  }

  async function partyAction(action) {
    try {
      if (action !== 'end-party') endStep = 0;
      if (action === 'rename') {
        message = 'Type the new name on your phone…';
        render();
        api.setController('keyboard', 'New party name');
      } else if (action === 'new-party') {
        await party.call('POST', '/event/new', {});
        await party.refreshEvent();
        message = 'A new, empty party has started.';
      } else if (action === 'approve') {
        await party.call('PATCH', '/event/settings', { approvePhotos: !party.event.settings.approvePhotos });
        await party.refreshEvent();
      } else if (action === 'limit-up') {
        const i = PHOTO_LIMITS_GB.indexOf(party.event.settings.photoLimitGB);
        await party.call('PATCH', '/event/settings', { photoLimitGB: PHOTO_LIMITS_GB[(i + 1) % PHOTO_LIMITS_GB.length] });
        await party.refreshEvent();
      } else if (action === 'music-pause') {
        await party.call('PATCH', '/event/settings', { pauseMusicInGames: party.event.settings.pauseMusicInGames === false });
        await party.refreshEvent();
      } else if (action === 'download') {
        window.open(`/api/party/photos.zip?room=${party.room}&h=${encodeURIComponent(party.headers()['x-couch-host'])}`, '_blank');
        message = 'The ZIP is downloading in a new tab.';
      } else if (action === 'end-party') {
        if (endStep < 2) { endStep++; } else {
          await party.call('DELETE', '/event', { confirm: party.event.id });
          await party.refreshEvent();
          endStep = 0;
          message = 'Everything was deleted. A new, empty party has started.';
        }
      } else if (action === 'back') {
        page = 'main'; row = 7; endStep = 0; message = '';
      }
    } catch (err) {
      message = 'That did not work. Is the laptop server still running?';
      console.error(err);
    }
    render();
  }

  function act(action) {
    if (page === 'party') { api.sound.play('select'); return partyAction(action); }
    if (action === 'theme') {
      prefs.setTheme(nextChoice(prefs.getTheme()));
      api.sound.play('select');
    } else if (action === 'sens-down' || action === 'sens-up') {
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
    } else if (action === 'steady') {
      prefs.setSteady(!prefs.getSteady());
      api.sound.play('select');
    } else if (action === 'cartoon' || action === 'ao') {
      graphics.set(action, !graphics[action]);
      api.sound.play('select');
    } else if (action === 'debug') {
      prefs.setDebug(!prefs.getDebug());
      api.sound.play('select');
    } else if (action === 'party') {
      page = 'party'; row = 0; message = '';
      api.sound.play('select');
      party.refreshEvent().then(render).catch(() => {});
    } else if (action === 'qr') {
      api.sound.play('select');
      prefs.showQR();
    }
    render();
  }

  function onButton({ playerId, button, state }) {
    if (state !== 'down') return;
    if (button === 'B') {
      if (page === 'party') { page = 'main'; row = 7; endStep = 0; message = ''; return render(); }
      return api.exit();
    }
    const rows = actions().length;
    if (button === 'UP' || button === 'DOWN') {
      row = (row + (button === 'DOWN' ? 1 : rows - 1)) % rows;
      endStep = 0;
      api.sound.play('hover');
      return render();
    }
    if (button === 'LEFT' || button === 'RIGHT') {
      if (page === 'main' && row === 0) act('theme');
      else if (page === 'main' && row === 1) act(button === 'RIGHT' ? 'sens-up' : 'sens-down');
      return;
    }
    if (button === 'A') {
      // A pointer over a control wins; otherwise press the focused row's main control.
      const p = api.pointer(playerId);
      const hit = p && document.elementFromPoint(p.x, p.y)?.closest('[data-action]');
      if (hit && root.contains(hit)) return act(hit.dataset.action);
      act(actions()[row]);
    }
  }

  // A new party name typed on a phone
  function onText({ text }) {
    api.setController('pointer');
    if (page !== 'party' || !text) { message = ''; return render(); }
    party.call('PATCH', '/event', { name: text }).then(() => party.refreshEvent()).then(() => { message = 'Renamed.'; render(); }).catch(() => { message = 'Could not rename.'; render(); });
  }

  return {
    id: 'settings',
    title: 'Settings',
    color: '#697386',
    icon: ICON,
    minPlayers: 1,
    maxPlayers: 1, // only the menu driver (P1) changes settings
    mount(container, gameApi) {
      api = gameApi;
      root = container;
      row = 0; page = 'main'; endStep = 0; message = '';
      api.onButton(onButton);
      api.onText?.(onText);
      render();
    },
    unmount() {
      root.innerHTML = '';
    },
  };
}
