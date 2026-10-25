// The party music queue (Phase 45). Phones add YouTube links; the TV plays them (YouTube's own player).
// This file is the rules and the HTTP side; the queue itself is plain data so it can be tested.
//   Fair order: songs go round-robin by person (a person's 1st song, then everyone else's 1st, then 2nd...);
//   within a round, more votes play first, then whoever added first. Everybody may have 3 songs waiting.
import express from 'express';
import { EV } from '../public/shared/protocol.js';

export const MAX_WAITING_PER_PERSON = 3;
export const skipNeeded = (online) => Math.max(2, Math.ceil(online * 0.4));

// youtu.be/ID, watch?v=ID, embed/ID, shorts/ID, live/ID, music.youtube.com/watch?v=ID, or a bare 11-character id
export function parseVideoId(text) {
  const t = String(text || '').trim();
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})(?![\w-])/) || t.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}

// The play order of the waiting songs (a new array; the input is not changed). `manual` = song ids the host
// arranged by hand: they come first, in that order.
export function orderQueue(items, manual = []) {
  const count = new Map(), rank = new Map(), firstAt = new Map();
  for (const it of [...items].sort((x, y) => x.addedAt - y.addedAt)) {
    const n = count.get(it.by) ?? 0;
    rank.set(it.id, n); count.set(it.by, n + 1);
    if (!firstAt.has(it.by)) firstAt.set(it.by, it.addedAt);
  }
  const pinned = manual.map((id) => items.find((q) => q.id === id)).filter(Boolean);
  const rest = items.filter((q) => !manual.includes(q.id))
    .sort((x, y) => rank.get(x.id) - rank.get(y.id) || y.votes.length - x.votes.length || firstAt.get(x.by) - firstAt.get(y.by) || x.addedAt - y.addedAt);
  return [...pinned, ...rest];
}

// A music state for one party: { queue: [], now: null, paused: false, skips: Set(personId), manual: order override }
export function createMusicState() {
  return { queue: [], now: null, paused: false, skips: new Set(), nextId: 0, history: [], manual: [] };
}

export function addSong(state, person, video) {
  const waiting = state.queue.filter((q) => q.by === person.id).length;
  if (waiting >= MAX_WAITING_PER_PERSON) return { error: 'TOO_MANY' };
  if (state.queue.some((q) => q.videoId === video.videoId) || state.now?.videoId === video.videoId) return { error: 'ALREADY' };
  const item = {
    id: `s${++state.nextId}`, videoId: video.videoId, title: video.title, channel: video.channel, thumb: video.thumb,
    by: person.id, byName: person.name, byEmoji: person.emoji, byColor: person.color, addedAt: Date.now(), votes: [],
  };
  state.queue.push(item);
  if (!state.now) advance(state);
  return { item };
}

// Take the next song (the first in the fair order) as the one playing. Returns it, or null when the queue is empty.
export function advance(state) {
  const next = orderQueue(state.queue, state.manual)[0] || null;
  if (state.now) state.history.push({ videoId: state.now.videoId, title: state.now.title, by: state.now.by, at: Date.now() });
  state.now = null;
  state.skips = new Set();
  state.paused = false;
  if (next) {
    state.queue = state.queue.filter((q) => q.id !== next.id);
    state.manual = state.manual.filter((id) => id !== next.id);
    state.now = { ...next, startedAt: Date.now() };
  }
  return state.now;
}

export function vote(state, person, songId) {
  const it = state.queue.find((q) => q.id === songId);
  if (!it) return { error: 'NO_SONG' };
  if (it.by === person.id) return { error: 'OWN_SONG' };
  const i = it.votes.indexOf(person.id);
  if (i >= 0) it.votes.splice(i, 1); else it.votes.push(person.id); // a second tap takes the vote back
  return { ok: true, votes: it.votes.length };
}

// A skip vote on the song that is playing. Returns { skipped, votes, needed }
export function skipVote(state, person, online) {
  if (!state.now) return { error: 'NOTHING_PLAYING' };
  state.skips.add(person.id);
  const needed = skipNeeded(online);
  if (state.skips.size >= needed) { advance(state); return { skipped: true, votes: needed, needed }; }
  return { skipped: false, votes: state.skips.size, needed };
}

export function removeSong(state, person, songId, isHost) {
  const it = state.queue.find((q) => q.id === songId);
  if (!it) return { error: 'NO_SONG' };
  if (!isHost && it.by !== person?.id) return { error: 'NOT_YOURS' };
  state.queue = state.queue.filter((q) => q.id !== songId);
  state.manual = state.manual.filter((id) => id !== songId);
  return { ok: true };
}

// Host: move a waiting song one place up (dir -1) or down (+1). The order is then fixed by hand.
export function moveSong(state, songId, dir) {
  const ids = orderQueue(state.queue, state.manual).map((q) => q.id), i = ids.indexOf(songId), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return { error: 'EDGE' };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  state.manual = ids;
  return { ok: true };
}

// ---------- HTTP + sockets ----------
export function createMusic({ app, io, rooms, party, activity }) {
  const { events, need } = party;
  const states = new Map(); // event id -> music state (the queue is live; it starts empty when the laptop restarts)
  const stateOf = () => { const id = events.current().id; if (!states.has(id)) states.set(id, createMusicState()); return states.get(id); };
  const router = express.Router();
  const base = () => process.env.YOUTUBE_OEMBED_URL || 'https://www.youtube.com/oembed'; // (overridable for tests)

  const onlineCount = (room) => [...room.people.values()].filter((p) => p.online).length;
  const personOf = (a) => (a.person ? { id: a.person.id, name: a.person.name, emoji: a.person.emoji, color: a.person.playerId ? ['#2F80ED', '#EB5757', '#27AE60', '#D99A00'][a.person.playerId - 1] : a.person.guestColor } : { id: 'host', name: 'TV', emoji: '📺', color: '#5B6577' });

  const publicState = (room) => {
    const s = stateOf();
    return {
      now: s.now && { id: s.now.id, videoId: s.now.videoId, title: s.now.title, channel: s.now.channel, thumb: s.now.thumb, by: s.now.by, byName: s.now.byName, byEmoji: s.now.byEmoji, byColor: s.now.byColor, startedAt: s.now.startedAt },
      queue: orderQueue(s.queue, s.manual).map((q) => ({ id: q.id, videoId: q.videoId, title: q.title, thumb: q.thumb, by: q.by, byName: q.byName, byEmoji: q.byEmoji, byColor: q.byColor, votes: q.votes })),
      paused: s.paused, skips: s.skips.size, skipNeeded: skipNeeded(onlineCount(room)),
    };
  };
  function broadcast(code, extra) {
    const room = rooms.get(code); if (!room) return;
    const msg = { ...publicState(room), ...extra };
    io.to(room.consoleId).emit(EV.MUSIC_STATE, msg);
    io.to(`remotes:${code}`).emit(EV.MUSIC_STATE, msg);
  }

  router.get('/music', need(), (req, res) => res.json(publicState(req.auth.room)));

  router.post('/music/add', need(), async (req, res) => {
    const id = parseVideoId(req.body?.link);
    if (!id) return res.status(400).json({ error: 'BAD_LINK', message: 'That does not look like a YouTube link.' });
    // Ask YouTube if this video may be played on another website (the TV). No key needed.
    let info;
    try {
      const r = await fetch(`${base()}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { signal: AbortSignal.timeout(8000) });
      if (r.status === 401 || r.status === 403 || r.status === 404) return res.status(422).json({ error: 'NOT_EMBEDDABLE', message: "This video can't play on the TV. Try another upload, e.g. a 'lyrics' or 'audio' version." });
      if (!r.ok) throw new Error(String(r.status));
      info = await r.json();
    } catch {
      return res.status(502).json({ error: 'OFFLINE', message: 'Could not check the video. Is the laptop online?' });
    }
    const s = stateOf(), who = personOf(req.auth);
    const out = addSong(s, who, { videoId: id, title: String(info.title || 'YouTube video').slice(0, 120), channel: String(info.author_name || '').slice(0, 80), thumb: info.thumbnail_url || `https://i.ytimg.com/vi/${id}/mqdefault.jpg` });
    if (out.error === 'TOO_MANY') return res.status(429).json({ error: out.error, message: `You already have ${MAX_WAITING_PER_PERSON} songs waiting. Wait for one to play.` });
    if (out.error === 'ALREADY') return res.status(409).json({ error: out.error, message: 'That song is already in the queue.' });
    broadcast(req.auth.code, { added: { id: out.item.id, byName: who.name } });
    if (req.auth.person) activity?.add(req.auth.code, req.auth.person, 'music');
    res.json({ ok: true, song: out.item.title });
  });

  router.post('/music/vote', need(), (req, res) => {
    const out = vote(stateOf(), personOf(req.auth), String(req.body?.id || ''));
    if (out.error) return res.status(400).json(out);
    broadcast(req.auth.code); res.json(out);
  });
  router.post('/music/skip', need(), (req, res) => {
    const s = stateOf();
    if (req.auth.host) { advance(s); broadcast(req.auth.code, { skipped: true }); return res.json({ skipped: true }); }
    const out = skipVote(s, personOf(req.auth), onlineCount(req.auth.room));
    if (out.error) return res.status(400).json(out);
    broadcast(req.auth.code, out.skipped ? { skipped: true } : {});
    res.json(out);
  });
  router.post('/music/remove', need(), (req, res) => {
    const out = removeSong(stateOf(), personOf(req.auth), String(req.body?.id || ''), req.auth.host);
    if (out.error) return res.status(out.error === 'NOT_YOURS' ? 403 : 404).json(out);
    broadcast(req.auth.code); res.json(out);
  });
  router.post('/music/move', need(true), (req, res) => {
    const out = moveSong(stateOf(), String(req.body?.id || ''), req.body?.dir === 'up' ? -1 : 1);
    if (out.error) return res.status(400).json(out);
    broadcast(req.auth.code); res.json(out);
  });
  router.post('/music/pause', need(true), (req, res) => {
    stateOf().paused = !!req.body?.paused;
    broadcast(req.auth.code); res.json({ ok: true });
  });

  // The TV tells us when a song ended or could not play (YouTube error 101/150 = not allowed here, or the network)
  io.on('connection', (socket) => {
    socket.on(EV.MUSIC_ENDED, (payload) => {
      if (socket.data.role !== 'console') return;
      const s = stateOf();
      if (payload?.videoId && s.now?.videoId !== payload.videoId) return; // (an old notice)
      advance(s); broadcast(socket.data.room);
    });
    socket.on(EV.MUSIC_ERROR, (payload) => {
      if (socket.data.role !== 'console') return;
      const s = stateOf();
      if (!s.now || s.now.videoId !== payload?.videoId) return;
      const failed = s.now;
      advance(s);
      broadcast(socket.data.room, { error: { byName: failed.byName, by: failed.by, title: failed.title, code: Number(payload.code) || 0 } });
    });
  });

  party.router.use(router);
  return { stateOf, states };
}
