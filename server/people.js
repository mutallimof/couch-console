// Who is in a room (Phase 43): players (P1-P4, with a controller) and guests (a name, an emoji and
// a color; no controller). The roster is what the TV and every phone show. Pure functions around a
// room object, so they can be tested without sockets.
import { cleanAvatar } from '../public/js/shared/avatar.js';
import { MAX_PLAYERS, MAX_GUESTS, PLAYER_COLORS, GUEST_COLORS, EMOJIS, NAME_MAX } from '../public/js/shared/protocol.js';

// Names come from phones: keep them short and free of control characters. (The pages also escape them.)
export function cleanName(name, fallback) {
  const n = String(name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return n || fallback;
}
export function cleanEmoji(emoji, fallback) {
  const e = String(emoji ?? '');
  return EMOJIS.includes(e) ? e : fallback;
}

// Make (or find) the person for this phone. key = the phone's clientId (or a per-socket fallback).
export function upsertPerson(room, key, { name, emoji, avatar } = {}) {
  let person = room.people.get(key);
  if (!person) {
    const n = room.people.size;
    person = {
      id: `u${++room.nextPersonId}`, key,
      name: cleanName(name, `Guest ${n + 1}`), emoji: cleanEmoji(emoji, EMOJIS[n % EMOJIS.length]),
      guestColor: GUEST_COLORS[n % GUEST_COLORS.length], avatar: cleanAvatar(avatar),
      playerId: null, socketId: null, online: false,
    };
    room.people.set(key, person);
  } else {
    if (name !== undefined) person.name = cleanName(name, person.name);
    if (emoji !== undefined) person.emoji = cleanEmoji(emoji, person.emoji);
    if (avatar !== undefined) person.avatar = cleanAvatar(avatar);
  }
  return person;
}

export const colorOf = (person) => (person.playerId ? PLAYER_COLORS[person.playerId - 1] : person.guestColor);

export function guestCount(room) {
  return [...room.people.values()].filter((p) => p.online && !p.playerId).length;
}

// The first free player slot, or 0
export function freeSlot(room) {
  for (let id = 1; id <= MAX_PLAYERS; id++) if (!room.slots.has(id)) return id;
  return 0;
}

export function roster(room) {
  return {
    people: [...room.people.values()].map((p) => ({
      id: p.id, name: p.name, emoji: p.emoji, avatar: p.avatar, color: colorOf(p),
      role: p.playerId ? 'player' : 'guest', playerId: p.playerId, online: p.online,
    })),
    slotsFree: MAX_PLAYERS - [...room.slots.keys()].length,
    guests: guestCount(room),
  };
}

export const canAddGuest = (room) => guestCount(room) < MAX_GUESTS;
