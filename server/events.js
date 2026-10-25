// A party's saved data (Phase 43): photos, music history and slide decks belong to an "event", not to a
// room code (room codes change whenever the TV page reloads). Everything lives on this laptop in
// data/events/<id>/ (git-ignored; set DATA_DIR to put it elsewhere, e.g. for tests).
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PHOTO_LIMITS_GB } from '../public/shared/protocol.js';

export function createEvents(dataDir) {
  const root = join(dataDir, 'events');
  const statePath = join(dataDir, 'state.json');
  mkdirSync(root, { recursive: true });

  const readJson = (path, fallback) => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; } };
  const dirOf = (id) => join(root, id);
  const isId = (id) => /^e-[a-z0-9-]{6,40}$/.test(String(id));

  function create(name) {
    const id = `e-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
    const event = { id, name: cleanEventName(name) || `Party ${new Date().toISOString().slice(0, 10)}`, createdAt: Date.now(), settings: { ...DEFAULT_SETTINGS } };
    for (const sub of ['', 'photos', 'thumbs', 'decks']) mkdirSync(join(dirOf(id), sub), { recursive: true });
    writeFileSync(join(dirOf(id), 'event.json'), JSON.stringify(event, null, 2));
    return event;
  }
  const get = (id) => {
    const e = isId(id) && existsSync(join(dirOf(id), 'event.json')) ? readJson(join(dirOf(id), 'event.json'), null) : null;
    if (e) e.settings = { ...DEFAULT_SETTINGS, ...(e.settings || {}) }; // (older events get the defaults)
    return e;
  };
  const list = () => (existsSync(root) ? readdirSync(root).map(get).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt) : []);

  // The event the party is using now: the last one (default), or a new one
  function current() {
    const id = readJson(statePath, {}).currentEventId;
    let event = get(id);
    if (!event) { event = list()[0] || create(); setCurrent(event.id); }
    return event;
  }
  function setCurrent(id) { writeFileSync(statePath, JSON.stringify({ currentEventId: id })); }
  function startNew(name) { const event = create(name); setCurrent(event.id); return event; }
  function rename(id, name) {
    const event = get(id); if (!event) return null;
    event.name = cleanEventName(name) || event.name;
    writeFileSync(join(dirOf(id), 'event.json'), JSON.stringify(event, null, 2));
    return event;
  }
  function updateSettings(id, patch) {
    const event = get(id); if (!event) return null;
    const s = event.settings;
    if (typeof patch?.approvePhotos === 'boolean') s.approvePhotos = patch.approvePhotos;
    if (typeof patch?.pauseMusicInGames === 'boolean') s.pauseMusicInGames = patch.pauseMusicInGames;
    if (PHOTO_LIMITS_GB.includes(patch?.photoLimitGB)) s.photoLimitGB = patch.photoLimitGB;
    writeFileSync(join(dirOf(id), 'event.json'), JSON.stringify(event, null, 2));
    return event;
  }
  // "End party & delete data": removes the folder (the caller asks for confirmation first)
  function remove(id) {
    if (!get(id)) return false;
    rmSync(dirOf(id), { recursive: true, force: true });
    if (readJson(statePath, {}).currentEventId === id) writeFileSync(statePath, JSON.stringify({}));
    return true;
  }
  // Free disk space in bytes (null if unknown): uploads are refused when it is nearly full
  function freeBytes() {
    try { const s = statfsSync(dataDir); return s.bavail * s.bsize; } catch { return null; }
  }
  return { root, dirOf, create, get, list, current, startNew, rename, updateSettings, remove, isId, freeBytes };
}

// Party settings kept with the event: photos wait for approval, the photo budget, music pausing for games
export const DEFAULT_SETTINGS = { approvePhotos: false, photoLimitGB: 3, pauseMusicInGames: true };

export function cleanEventName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}
