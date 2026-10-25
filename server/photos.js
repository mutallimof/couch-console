// The party album (Phase 44): photos sent from phones, stored per event on this laptop.
// data/events/<id>/photos/<photoId>.<ext> (full size), thumbs/<photoId>.jpg (480 px), photos.json (the list).
// Safety: we never trust a file's name or declared type. The bytes decide (JPEG, PNG, WebP, GIF, HEIC);
// files are saved under random ids; every upload needs a joined phone; there is a per-phone rate limit,
// a per-event size limit and a "disk nearly full" check.
import express from 'express';
import multer from 'multer';
import { ZipArchive } from 'archiver';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, statSync, createReadStream, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EV } from '../public/js/shared/protocol.js';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MIN_FREE_BYTES = 300 * 1024 * 1024; // refuse uploads when the laptop has less free space than this
const RATE = { max: 40, windowMs: 60_000 }; // uploads per phone per minute

// What the first bytes say the file is (never the name or the declared type)
export function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg', preview: true };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png', preview: true };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', type: 'image/webp', preview: true };
  if (buf.subarray(0, 3).toString('latin1') === 'GIF') return { ext: 'gif', type: 'image/gif', preview: true };
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(buf.subarray(8, 12).toString('latin1'))) {
    return { ext: 'heic', type: 'image/heic', preview: false }; // iPhones normally convert; other browsers can't show it
  }
  return null;
}

export function createPhotos({ app, io, rooms, party, activity }) {
  const { events, need, who } = party;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 2, fields: 9 } });
  const rate = new Map(); // personKey -> [timestamps]
  const router = express.Router();

  const listPath = (id) => join(events.dirOf(id), 'photos.json');
  const load = (id) => { try { return JSON.parse(readFileSync(listPath(id), 'utf8')); } catch { return []; } };
  const save = (id, list) => { const tmp = `${listPath(id)}.tmp`; writeFileSync(tmp, JSON.stringify(list)); renameSync(tmp, listPath(id)); };
  const usedBytes = (list) => list.reduce((n, p) => n + (p.size || 0), 0);
  const fileOf = (id, p) => join(events.dirOf(id), 'photos', `${p.id}.${p.ext}`);
  const thumbOf = (id, p) => join(events.dirOf(id), 'thumbs', `${p.id}.jpg`);

  // What a phone may see: shown photos plus its own waiting ones. The host sees everything (with flags).
  const view = (p) => ({ id: p.id, by: p.by, byName: p.byName, byEmoji: p.byEmoji, byAvatar: p.byAvatar, byColor: p.byColor, at: p.at, w: p.w, h: p.h, size: p.size, noPreview: !!p.noPreview, hidden: !!p.hidden, pending: !!p.pending, ext: p.ext });
  const visibleTo = (a) => (p) => a.host || (!p.hidden && (!p.pending || p.by === a.person?.id));

  // Tell the TV (always) and the phones (only about photos that are visible) that the album changed
  function announce(code, kind, p) {
    const room = rooms.get(code);
    if (!room) return;
    io.to(room.consoleId).emit(EV.PARTY_PHOTO, { kind, photo: view(p) });
    if (!p.hidden && !p.pending) io.to(`remotes:${code}`).emit(EV.PARTY_PHOTO, { kind, photo: view(p) });
  }

  router.get('/photos', need(), (req, res) => {
    const id = events.current().id;
    res.json({ event: id, settings: events.current().settings, photos: load(id).filter(visibleTo(req.auth)).map(view) });
  });

  router.post('/photos', need(), (req, res) => {
    const a = req.auth;
    if (!a.person && !a.host) return res.status(401).json({ error: 'NOT_JOINED' });
    upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'thumb', maxCount: 1 }])(req, res, (err) => {
      if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'TOO_BIG' : 'BAD_UPLOAD' });
      const full = req.files?.photo?.[0]?.buffer;
      if (!full) return res.status(400).json({ error: 'NO_FILE' });
      const kind = sniff(full);
      if (!kind) return res.status(415).json({ error: 'NOT_AN_IMAGE' });
      // rate limit per phone
      const key = a.person?.key || 'host', now = Date.now();
      const hits = (rate.get(key) || []).filter((t) => now - t < RATE.windowMs);
      if (hits.length >= RATE.max) return res.status(429).json({ error: 'SLOW_DOWN' });
      hits.push(now); rate.set(key, hits);

      const event = events.current(), list = load(event.id);
      const hash = createHash('sha256').update(full).digest('hex');
      const dupe = list.find((p) => p.hash === hash && !p.deleted);
      if (dupe) return res.json({ duplicate: true, photo: view(dupe) });
      const free = events.freeBytes();
      if (free !== null && free < MIN_FREE_BYTES) return res.status(507).json({ error: 'DISK_FULL' });
      if (usedBytes(list) + full.length > event.settings.photoLimitGB * 1024 ** 3) return res.status(507).json({ error: 'LIMIT' });

      const id = randomBytes(10).toString('hex');
      const w = Math.min(20000, Math.max(0, parseInt(req.body?.w, 10) || 0)), h = Math.min(20000, Math.max(0, parseInt(req.body?.h, 10) || 0));
      const p = {
        id, ext: kind.ext, hash, size: full.length, w, h, at: Date.now(),
        by: a.person?.id || 'host', byName: a.person?.name || (req.body?.booth ? 'Photo Booth' : 'TV'), byEmoji: a.person?.emoji || (req.body?.booth ? '📸' : '📺'), byAvatar: a.person?.avatar || null,
        byColor: a.person ? (a.person.playerId ? ['#2F80ED', '#EB5757', '#27AE60', '#D99A00'][a.person.playerId - 1] : a.person.guestColor) : '#5B6577',
        hidden: false, pending: !!event.settings.approvePhotos && !a.host, noPreview: !kind.preview,
      };
      mkdirSync(join(events.dirOf(event.id), 'photos'), { recursive: true });
      mkdirSync(join(events.dirOf(event.id), 'thumbs'), { recursive: true });
      writeFileSync(fileOf(event.id, p), full);
      const thumb = req.files?.thumb?.[0]?.buffer;
      if (thumb && sniff(thumb)?.ext === 'jpg' && thumb.length < 600 * 1024) writeFileSync(thumbOf(event.id, p), thumb);
      list.push(p);
      save(event.id, list);
      announce(a.code, 'added', p);
      if (!p.pending && a.person) activity?.add(a.code, a.person, 'photos');
      res.json({ ok: true, photo: view(p) });
    });
  });

  // Photos are served by their random id (an unguessable address, only shown to people in the room).
  // Hidden or waiting photos are served only to the host (with the token in ?h=).
  function serve(kind) {
    return (req, res) => {
      const id = events.current().id, p = load(id).find((x) => x.id === String(req.params.id));
      if (!p) return res.status(404).end();
      const token = String(req.query.h || '');
      const code = String(req.query.room || '').toUpperCase(), room = rooms.get(code);
      const host = !!room && token.length === room.hostToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(room.hostToken));
      if ((p.hidden || p.pending) && !host) return res.status(404).end();
      let path = kind === 'thumb' && existsSync(thumbOf(id, p)) ? thumbOf(id, p) : fileOf(id, p);
      if (!existsSync(path)) return res.status(404).end();
      const type = path.endsWith('.jpg') && kind === 'thumb' ? 'image/jpeg' : ({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic' }[p.ext]);
      res.set({ 'Content-Type': type, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Length': statSync(path).size });
      if (kind === 'full' && req.query.download) res.set('Content-Disposition', `attachment; filename="${(p.byName || 'photo').replace(/[^\w .-]/g, '_')}-${p.id.slice(0, 6)}.${p.ext}"`);
      createReadStream(path).pipe(res);
    };
  }
  router.get('/photos/:id/thumb', serve('thumb'));
  router.get('/photos/:id/full', serve('full'));

  // Hide / show (host), approve (host), delete (the owner or the host)
  const find = (req, res) => {
    const id = events.current().id, list = load(id), p = list.find((x) => x.id === req.params.id);
    if (!p) { res.status(404).json({ error: 'NO_PHOTO' }); return null; }
    return { id, list, p };
  };
  router.post('/photos/:id/hide', need(true), (req, res) => {
    const f = find(req, res); if (!f) return;
    f.p.hidden = req.body?.hidden !== false;
    save(f.id, f.list);
    io.to(req.auth.room.consoleId).emit(EV.PARTY_PHOTO, { kind: f.p.hidden ? 'hidden' : 'shown', photo: view(f.p) });
    io.to(`remotes:${req.auth.code}`).emit(EV.PARTY_PHOTO, { kind: f.p.hidden ? 'removed' : 'added', photo: view(f.p) });
    res.json({ ok: true });
  });
  router.post('/photos/:id/approve', need(true), (req, res) => {
    const f = find(req, res); if (!f) return;
    f.p.pending = false;
    save(f.id, f.list);
    announce(req.auth.code, 'added', f.p);
    res.json({ ok: true });
  });
  router.delete('/photos/:id', need(), (req, res) => {
    const f = find(req, res); if (!f) return;
    if (!req.auth.host && f.p.by !== req.auth.person?.id) return res.status(403).json({ error: 'NOT_YOURS' });
    for (const path of [fileOf(f.id, f.p), thumbOf(f.id, f.p)]) rmSync(path, { force: true });
    save(f.id, f.list.filter((x) => x.id !== f.p.id));
    io.to(req.auth.room.consoleId).emit(EV.PARTY_PHOTO, { kind: 'removed', photo: view(f.p) });
    io.to(`remotes:${req.auth.code}`).emit(EV.PARTY_PHOTO, { kind: 'removed', photo: view(f.p) });
    res.json({ ok: true });
  });

  // Everything as one ZIP (JPEGs are already compressed, so they are stored as they are). Downloads are links
  // the browser opens, so who is asking comes in the address: ?room=ABCD&client=<id> (or &h=<host token>).
  router.get('/photos.zip', (req, res) => {
    const code = String(req.query.room || '').toUpperCase(), room = rooms.get(code);
    if (!room) return res.status(401).end();
    const token = String(req.query.h || '');
    const host = token.length === room.hostToken.length && timingSafeEqual(Buffer.from(token), Buffer.from(room.hostToken));
    if (!host && !room.people.get(String(req.query.client || ''))) return res.status(401).end();
    const event = events.current(), list = load(event.id).filter((p) => !p.hidden && !p.pending && existsSync(fileOf(event.id, p)));
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${event.name.replace(/[^\w .-]/g, '_') || 'party'}-photos.zip"` });
    const zip = new ZipArchive({ store: true });
    zip.on('error', () => res.end());
    zip.pipe(res);
    list.forEach((p, i) => zip.file(fileOf(event.id, p), { name: `${String(i + 1).padStart(3, '0')} ${p.byName.replace(/[^\w .-]/g, '_')}.${p.ext}` }));
    zip.finalize();
  });

  // How big the ZIP would be (shown before downloading on a phone)
  router.get('/photos-size', need(), (req, res) => {
    const list = load(events.current().id).filter((p) => !p.hidden && !p.pending);
    res.json({ count: list.length, bytes: usedBytes(list) });
  });

  party.router.use(router);
  return { load, announce };
}
