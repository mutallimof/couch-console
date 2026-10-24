// The party side of the phone (Phase 43): the welcome card (name + emoji), the tabs
// (Remote / Photos / Music / Present), and the "me" sheet (rename, become a player or a guest,
// show a QR code so the next person can join). Photos, Music and Present live in their own files
// and plug in with registerPane().
import { EV, EMOJIS, NAME_MAX } from '../shared/protocol.js';

const $ = (id) => document.getElementById(id);
const PROFILE_KEY = 'couch.profile';

export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch { return {}; }
}
function saveProfile(p) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* private mode: fine */ }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createParty({ socket, getRoom, getClientId, onRoleRequest, onTab, laser }) {
  let profile = loadProfile();
  let role = 'guest', slotsFree = 0, tab = 'remote', mode = 'pointer', roster = { people: [] }, me = null;
  const panes = []; // { id, label, icon, mod, mounted }
  let emoji = profile.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

  // ---- small helpers ----
  function toast(text, ms = 2600) {
    const el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = text;
    document.body.append(el);
    setTimeout(() => el.remove(), ms);
  }
  function emojiRow(host, selected, onPick) {
    host.innerHTML = EMOJIS.map((e) => `<button type="button" data-e="${e}" aria-pressed="${e === selected}">${e}</button>`).join('');
    host.onclick = (ev) => {
      const b = ev.target.closest('[data-e]');
      if (!b) return;
      host.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(b.dataset.e);
    };
  }

  // ---- welcome card ----
  $('w-name').value = profile.name || '';
  emojiRow($('w-emoji'), emoji, (e) => { emoji = e; });
  $('welcome').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const chosen = ev.submitter?.value === 'guest' ? 'guest' : 'player';
    const name = $('w-name').value.trim().slice(0, NAME_MAX);
    if (!name) { $('w-note').textContent = 'Type your name first.'; $('w-name').focus(); return; }
    profile = { name, emoji, role: chosen };
    saveProfile(profile);
    $('w-name').blur();
    $('welcome').hidden = true;
    onRoleRequest(profile);
  });

  // ---- tabs ----
  function renderTabs() {
    const list = [...(role === 'player' ? [{ id: 'remote', label: 'Remote', icon: '🎮' }] : []), ...panes];
    $('tabs').innerHTML = list.map((t) => `<button class="tab" type="button" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}"><b>${t.icon}</b>${t.label}</button>`).join('');
    const visible = joinedOnce && mode === 'pointer';
    $('tabs').hidden = !visible;
    $('panes').hidden = !visible || tab === 'remote';
    document.querySelectorAll('.pane').forEach((p) => { p.hidden = `pane-${tab}` !== p.id; });
  }
  $('tabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });
  function setTab(id) {
    if (id === 'remote' && role !== 'player') id = panes[0]?.id || 'remote';
    tab = id;
    const pane = panes.find((p) => p.id === id);
    if (pane && !pane.mounted) {
      pane.mounted = true;
      try { pane.mod.mount($(`pane-${id}`), ctx); } catch (err) { console.error(`${id} pane failed`, err); $(`pane-${id}`).textContent = 'This section could not load.'; }
    }
    pane?.mod.show?.();
    renderTabs();
    onTab?.(tab);
  }

  // ---- "me" sheet ----
  let sheetEmoji = emoji;
  function openSheet() {
    $('s-name').value = me?.name || profile.name || '';
    sheetEmoji = me?.emoji || emoji;
    emojiRow($('s-emoji'), sheetEmoji, (e) => { sheetEmoji = e; });
    $('s-qr').hidden = true;
    renderRoleButton();
    $('sheet').hidden = false;
  }
  function renderRoleButton() {
    const b = $('s-role');
    b.hidden = false;
    if (role === 'player') b.textContent = 'Leave my player slot (become a guest)';
    else if (slotsFree > 0) b.textContent = `🎮 Join as player (${slotsFree} free)`;
    else { b.textContent = 'All 4 player slots are taken'; b.disabled = true; return; }
    b.disabled = false;
  }
  $('me-btn').addEventListener('click', openSheet);
  $('s-close').addEventListener('click', () => { $('sheet').hidden = true; });
  $('sheet').addEventListener('click', (ev) => { if (ev.target === $('sheet')) $('sheet').hidden = true; });
  $('s-save').addEventListener('click', () => {
    const name = $('s-name').value.trim().slice(0, NAME_MAX);
    if (!name) return;
    profile = { ...profile, name, emoji: sheetEmoji };
    saveProfile(profile);
    socket.emit(EV.REMOTE_PROFILE, { name, emoji: sheetEmoji }, (res) => { if (res?.ok) { $('sheet').hidden = true; toast('Saved'); } });
  });
  $('s-role').addEventListener('click', () => {
    const to = role === 'player' ? 'guest' : 'player';
    socket.emit(EV.REMOTE_ROLE, { to }, (res) => {
      if (!res?.ok) return toast(res?.error === 'FULL' ? 'All 4 player slots are taken.' : 'Could not change.');
      profile = { ...profile, role: to };
      saveProfile(profile);
      $('sheet').hidden = true;
      onRoleRequest({ ...profile, changedTo: to, res });
    });
  });
  $('s-invite').addEventListener('click', async () => {
    try {
      const r = await fetch(`/qr?room=${getRoom()}`);
      $('s-qr').src = (await r.json()).dataUrl;
      $('s-qr').hidden = false;
    } catch { toast('Could not make the QR code.'); }
  });

  // ---- what the phone page tells us ----
  let joinedOnce = false;
  const ctx = {
    socket, toast, esc,
    getRoom, getClientId,
    me: () => me,
    roster: () => roster,
    role: () => role,
    laser, // { start(): Promise<{ ok, reason? }>, emit(on) }: the presenter's laser pointer (Present tab)
    // Extra headers for the party's HTTP calls: who we are and which room
    headers: () => ({ 'x-couch-room': getRoom(), 'x-couch-client': getClientId() }),
  };

  return {
    ctx,
    get profile() { return profile; },
    needsWelcome: () => !profile.name,
    showWelcome(note = '') {
      $('w-note').textContent = note;
      $('w-play').hidden = false;
      $('welcome').hidden = false;
    },
    registerPane(id, label, icon, mod) { panes.push({ id, label, icon, mod, mounted: false }); renderTabs(); },
    onJoined(res) {
      joinedOnce = true;
      role = res.role === 'player' ? 'player' : 'guest';
      me = res.person || me;
      slotsFree = res.slotsFree ?? slotsFree;
      roster = { people: res.people || [] };
      $('me-btn').hidden = false;
      $('me-emoji').textContent = me?.emoji || '🙂';
      $('me-name').textContent = me?.name || '';
      if (res.full) toast('All 4 player slots are taken: you are in as a guest.', 4000);
      if (role !== 'player' && tab === 'remote') tab = panes[0]?.id || 'remote';
      if (role === 'player' && !panes.some((p) => p.id === tab)) tab = 'remote';
      setTab(tab);
    },
    onRoster(r) {
      roster = r;
      slotsFree = r.slotsFree ?? slotsFree;
      const mine = r.people.find((p) => p.id === me?.id);
      if (mine) { me = { ...me, name: mine.name, emoji: mine.emoji }; $('me-emoji').textContent = mine.emoji; $('me-name').textContent = mine.name; }
      if (!$('sheet').hidden) renderRoleButton();
    },
    // The console changed the controller layout (pointer / wheel / keyboard)
    setMode(m) { mode = m; renderTabs(); },
    setTab,
    get tab() { return tab; },
    get role() { return role; },
  };
}
