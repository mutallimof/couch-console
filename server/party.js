// The party's HTTP side (Phase 43): who is calling (a joined phone, or the TV with its host token),
// and the event (name, new party, end party). Photos, music and slides add their routes in later phases.
import express from 'express';
import { createEvents } from './events.js';
import { timingSafeEqual } from 'node:crypto';

export function createParty({ app, rooms, dataDir }) {
  const events = createEvents(dataDir);
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  // Who is asking? { room, code, host, person } or null. A phone proves it joined the room by sending its
  // clientId; the TV proves it is the host with the token it got when it created the room.
  function who(req) {
    const code = String(req.get('x-couch-room') || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return null;
    const token = String(req.get('x-couch-host') || '');
    const host = token.length === room.hostToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(room.hostToken));
    const person = room.people.get(String(req.get('x-couch-client') || '')) || null;
    if (!host && !person) return null;
    return { room, code, host, person };
  }
  // Express middleware: 401 unless a joined phone or the host; hostOnly for admin actions
  const need = (hostOnly = false) => (req, res, next) => {
    const a = who(req);
    if (!a) return res.status(401).json({ error: 'NOT_JOINED' });
    if (hostOnly && !a.host) return res.status(403).json({ error: 'HOST_ONLY' });
    req.auth = a;
    next();
  };

  router.get('/event', need(), (req, res) => res.json(events.current()));
  router.get('/events', need(true), (req, res) => res.json(events.list()));
  router.post('/event/new', need(true), (req, res) => res.json(events.startNew(req.body?.name)));
  router.patch('/event', need(true), (req, res) => {
    const event = events.rename(events.current().id, req.body?.name);
    res.json(event);
  });
  router.patch('/event/settings', need(true), (req, res) => res.json(events.updateSettings(events.current().id, req.body)));
  // Deleting everything needs the event's id as confirmation (the TV asks twice before sending it)
  router.delete('/event', need(true), (req, res) => {
    const event = events.current();
    if (req.body?.confirm !== event.id) return res.status(400).json({ error: 'CONFIRM' });
    events.remove(event.id);
    res.json({ ok: true, event: events.current() }); // a fresh, empty event takes its place
  });

  app.use('/api/party', router);
  return { events, router, need, who };
}
