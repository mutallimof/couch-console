// The TV's side of the party (Phase 43): who is here (the roster from the server), the little
// "Ana joined" notes, and the host's key for the party's HTTP calls (changing the event, hiding photos...).
const listeners = new Set();
let roster = { people: [], slotsFree: 4, guests: 0 };
let room = '', hostToken = '', event = null;
const seenOnline = new Set(); // people we already welcomed

function toast(text) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  box.append(el);
  while (box.children.length > 2) box.firstChild.remove(); // at most two at once
  setTimeout(() => el.remove(), 3200);
}

// Photo notices (new photo, removed...) go to whoever is listening; if the Photos app is not open, a toast
const photoListeners = new Set();
const activityListeners = new Set();
let activity = []; // newest first
const deckListeners = new Set();

export const party = {
  toast,
  photosOpen: false,
  onDeck(fn) { deckListeners.add(fn); return () => deckListeners.delete(fn); },
  emitDeck(e) { deckListeners.forEach((fn) => fn(e)); },
  // Upload slides from the laptop (a form, so no JSON header)
  async upload(path, form) {
    const { 'content-type': _skip, ...headers } = party.headers();
    const res = await fetch(`/api/party${path}`, { method: 'POST', headers, body: form });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  },
  onPhoto(fn) { photoListeners.add(fn); return () => photoListeners.delete(fn); },
  emitPhoto(e) {
    photoListeners.forEach((fn) => fn(e));
    if (e.kind === 'added' && !party.photosOpen) toast(`📸 New photo from ${e.photo.byName}`);
  },
  // The activity feed ("Ana added 5 photos"): newest first; new lines also pop up as a note
  get activity() { return activity; },
  onActivity(fn) { activityListeners.add(fn); return () => activityListeners.delete(fn); },
  emitActivity(entry) {
    const i = activity.findIndex((e) => e.id === entry.id);
    if (i >= 0) activity.splice(i, 1);
    activity.unshift(entry);
    activity.length = Math.min(activity.length, 60);
    activityListeners.forEach((fn) => fn(entry));
    if (entry.kind !== 'join' && i < 0) toast(entry.text);
  },
  async loadActivity() { try { activity = (await party.call('GET', '/activity')).entries; activityListeners.forEach((fn) => fn()); } catch { /* offline */ } },
  // The person of a player slot (name, emoji, avatar), if known
  personOfPlayer: (playerId) => roster.people.find((p) => p.playerId === playerId),
  get roster() { return roster; },
  get people() { return roster.people; },
  get event() { return event; },
  get room() { return room; },
  // Called with the answer to "create room"
  setRoom(res) {
    room = res.room; hostToken = res.hostToken || ''; event = res.event || null;
    seenOnline.clear();
    roster = { people: [], slotsFree: 4, guests: 0 };
    listeners.forEach((fn) => fn());
  },
  onRoster(r) {
    for (const p of r.people) {
      if (p.online && !seenOnline.has(p.id)) { seenOnline.add(p.id); toast(`${p.emoji} ${p.name} joined`); }
      if (!p.online) seenOnline.delete(p.id);
    }
    roster = r;
    listeners.forEach((fn) => fn());
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  // Headers that prove "this is the TV" to the server
  headers: () => ({ 'x-couch-room': room, 'x-couch-host': hostToken, 'content-type': 'application/json' }),
  async call(method, path, body) {
    const res = await fetch(`/api/party${path}`, { method, headers: party.headers(), body: body ? JSON.stringify(body) : undefined });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  },
  async refreshEvent() { event = await party.call('GET', '/event'); listeners.forEach((fn) => fn()); return event; },
};
