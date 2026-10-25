// The activity feed (Phase 55): short lines about what happened at the party ("Ana added 5 photos",
// "Ben queued a song", "Cem won Turbo Karts"). Kept in memory per room (the newest 60), pushed live to the TV
// and the phones, and fetched when a screen opens. Lines from the same person and kind that come
// close together are merged ("added 3 photos") instead of flooding the feed.
import { randomBytes } from 'node:crypto';
import { EV } from '../public/shared/protocol.js';

const KEEP = 60;
const MERGE_MS = 45_000;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const TEXT = {
  photos: (n) => `added ${plural(n, 'photo')}`,
  music: (n) => (n === 1 ? 'queued a song' : `queued ${n} songs`),
  present: () => 'started presenting',
  join: () => 'joined',
};

export function createActivity({ io, rooms, party }) {
  const listOf = (room) => (room.activity ||= []);

  // who = a person object from server/people.js (or null for the TV); kind = photos | music | present | join | won
  function add(code, who, kind, extra = {}) {
    const room = rooms.get(code);
    if (!room) return null;
    const list = listOf(room), now = Date.now();
    const name = who?.name || 'The TV';
    const last = list[list.length - 1];
    let entry;
    if (kind in TEXT && last && last.kind === kind && last.who.id === (who?.id || 'tv') && now - last.at < MERGE_MS) {
      entry = last; entry.n += 1; entry.at = now; entry.text = `${name} ${TEXT[kind](entry.n)}`;
    } else {
      const n = 1;
      const text = kind === 'won' ? `${name} won ${extra.game || 'a game'}` : `${name} ${TEXT[kind](n)}`;
      entry = { id: randomBytes(5).toString('hex'), at: now, kind, n, text, who: { id: who?.id || 'tv', name, emoji: who?.emoji || '📺', avatar: who?.avatar || null } };
      list.push(entry);
      if (list.length > KEEP) list.shift();
    }
    io.to(room.consoleId).emit(EV.PARTY_ACTIVITY, { entry });
    io.to(`remotes:${code}`).emit(EV.PARTY_ACTIVITY, { entry });
    return entry;
  }

  party.router.get('/activity', party.need(), (req, res) => {
    res.json({ entries: [...listOf(req.auth.room)].reverse().slice(0, 40) });
  });

  return { add, list: (code) => listOf(rooms.get(code) || {}) };
}
