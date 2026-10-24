// Slides (Phase 46): PDFs and picture decks are uploaded from a phone or the laptop, listed in a library, and
// presented by one person at a time (the presenter) with a phone as the remote. The TV draws the slides
// (pdf.js in the browser) and the server keeps the little state: which deck, which page, black screen, who presents.
// data/events/<id>/decks/<deckId>/ deck.json + file.pdf, or 1.jpg 2.jpg ... (+ thumbs t1.jpg ...).
import express from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, createReadStream, statSync } from 'node:fs';
import { join } from 'node:path';
import { EV } from '../public/js/shared/protocol.js';
import { sniff } from './photos.js';

export const MAX_PDF_BYTES = 60 * 1024 * 1024;
export const MAX_PAGE_BYTES = 15 * 1024 * 1024;
export const MAX_PAGES = 80;

// Formats a browser cannot show: the way to turn them into a PDF
export const EXPORT_STEPS = {
  pptx: 'PowerPoint: File → Export → PDF (or Save As → PDF).',
  ppt: 'PowerPoint: File → Export → PDF (or Save As → PDF).',
  key: 'Keynote: File → Export To → PDF.',
  odp: 'LibreOffice Impress: File → Export as PDF.',
};
export function exportHelp(filename) {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (!EXPORT_STEPS[ext]) return null;
  return `${EXPORT_STEPS[ext]} Google Slides: File → Download → PDF. Then upload the PDF here.`;
}
export const isPdf = (buf) => buf.length > 8 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
const cleanName = (n) => String(n ?? '').replace(/[\u0000-\u001f\u007f<>\\/]/g, '').replace(/\.(pdf|jpe?g|png|webp)$/i, '').trim().slice(0, 80) || 'Slides';

export function createPresent({ app, io, rooms, party }) {
  const { events, need } = party;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: MAX_PAGES * 2, fields: 12 } });
  const router = express.Router();
  const states = new Map(); // event id -> { deckId, page, black, presenter: { id, name } | null, laser: bool }

  const decksDir = () => join(events.dirOf(events.current().id), 'decks');
  const deckDir = (id) => join(decksDir(), id);
  const isDeckId = (id) => /^[a-f0-9]{20}$/.test(String(id));
  const readDeck = (id) => { try { return isDeckId(id) ? JSON.parse(readFileSync(join(deckDir(id), 'deck.json'), 'utf8')) : null; } catch { return null; } };
  const writeDeck = (d) => writeFileSync(join(deckDir(d.id), 'deck.json'), JSON.stringify(d));
  const listDecks = () => (existsSync(decksDir()) ? readdirSync(decksDir()).map(readDeck).filter(Boolean).sort((a, b) => b.createdAt - a.createdAt) : []);
  const stateOf = () => { const id = events.current().id; if (!states.has(id)) states.set(id, { deckId: null, page: 1, black: false, presenter: null, laser: false }); return states.get(id); };
  const view = (d) => d && ({ id: d.id, name: d.name, kind: d.kind, pages: d.pages, by: d.by, byName: d.byName, createdAt: d.createdAt, thumbs: d.thumbs || 0, lastPage: d.lastPage || 1 });

  const publicState = () => {
    const s = stateOf(), d = s.deckId ? readDeck(s.deckId) : null;
    return { active: !!(s.deckId && d), deck: view(d), page: s.page, black: s.black, presenter: s.presenter, laser: s.laser, notes: d?.notes?.[s.page] || '' };
  };
  function broadcast(code) {
    const room = rooms.get(code); if (!room) return;
    const st = publicState();
    io.to(room.consoleId).emit(EV.PRESENT_STATE, st);
    io.to(`remotes:${code}`).emit(EV.PRESENT_STATE, st);
  }

  router.get('/decks', need(), (req, res) => res.json(listDecks().map(view)));
  router.get('/present', need(), (req, res) => res.json(publicState()));

  // Upload: kind=pdf with one file, or kind=images with files (+ matching thumbs). PowerPoint and Keynote files get the export steps.
  router.post('/decks', need(), (req, res) => {
    upload.fields([{ name: 'files', maxCount: MAX_PAGES }, { name: 'thumbs', maxCount: MAX_PAGES }])(req, res, (err) => {
      if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'TOO_BIG' : 'BAD_UPLOAD' });
      const files = req.files?.files || [];
      if (!files.length) return res.status(400).json({ error: 'NO_FILE' });
      const help = files.map((f) => exportHelp(f.originalname)).find(Boolean);
      if (help) return res.status(415).json({ error: 'NEEDS_PDF', message: `A browser cannot show that file type. ${help}` });
      const a = req.auth, id = randomBytes(10).toString('hex');
      const deck = { id, name: cleanName(req.body?.name || files[0].originalname), by: a.person?.id || 'host', byName: a.person?.name || 'TV', createdAt: Date.now(), notes: {}, lastPage: 1 };
      if (isPdf(files[0].buffer)) {
        if (files[0].size > MAX_PDF_BYTES) return res.status(413).json({ error: 'TOO_BIG' });
        mkdirSync(deckDir(id), { recursive: true });
        writeFileSync(join(deckDir(id), 'file.pdf'), files[0].buffer);
        Object.assign(deck, { kind: 'pdf', pages: Math.max(0, parseInt(req.body?.pages, 10) || 0) }); // (the TV counts the pages and tells us)
      } else {
        const bad = files.find((f) => !['jpg', 'png', 'webp', 'gif'].includes(sniff(f.buffer)?.ext) || f.size > MAX_PAGE_BYTES);
        if (bad) return res.status(415).json({ error: 'NOT_AN_IMAGE', message: 'Slides must be a PDF or pictures (JPG, PNG, WebP).' });
        mkdirSync(deckDir(id), { recursive: true });
        files.forEach((f, i) => writeFileSync(join(deckDir(id), `${i + 1}.${sniff(f.buffer).ext}`), f.buffer));
        (req.files.thumbs || []).forEach((t, i) => { if (sniff(t.buffer)?.ext === 'jpg' && t.size < 400 * 1024) writeFileSync(join(deckDir(id), `t${i + 1}.jpg`), t.buffer); });
        Object.assign(deck, { kind: 'images', pages: files.length, exts: files.map((f) => sniff(f.buffer).ext), thumbs: (req.files.thumbs || []).length });
      }
      writeDeck(deck);
      const room = a.room;
      io.to(room.consoleId).emit(EV.PRESENT_DECK, { kind: 'added', deck: view(deck) });
      io.to(`remotes:${a.code}`).emit(EV.PRESENT_DECK, { kind: 'added', deck: view(deck) });
      res.json({ ok: true, deck: view(deck) });
    });
  });

  // Files by deck id (an unguessable address, only listed to people in the room)
  router.get('/decks/:id/file', (req, res) => {
    const d = readDeck(req.params.id);
    if (!d || d.kind !== 'pdf') return res.status(404).end();
    const path = join(deckDir(d.id), 'file.pdf');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': statSync(path).size, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    createReadStream(path).pipe(res);
  });
  const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  router.get('/decks/:id/page/:n', (req, res) => {
    const d = readDeck(req.params.id), n = parseInt(req.params.n, 10);
    if (!d || d.kind !== 'images' || !(n >= 1 && n <= d.pages)) return res.status(404).end();
    res.set({ 'Content-Type': MIME[d.exts[n - 1]], 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    createReadStream(join(deckDir(d.id), `${n}.${d.exts[n - 1]}`)).pipe(res);
  });
  router.get('/decks/:id/thumb/:n', (req, res) => {
    const d = readDeck(req.params.id), n = parseInt(req.params.n, 10), path = d && join(deckDir(d.id), `t${n}.jpg`);
    if (path && existsSync(path)) { res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' }); return createReadStream(path).pipe(res); }
    if (d?.kind === 'images' && n >= 1 && n <= d.pages) return res.redirect(`/api/party/decks/${d.id}/page/${n}`); // (no thumbnail: the picture itself)
    res.status(404).end();
  });

  // The TV renders PDFs, so it tells us the page count and sends small pictures of each page (host only)
  router.post('/decks/:id/meta', need(true), (req, res) => {
    const d = readDeck(req.params.id); if (!d) return res.status(404).json({ error: 'NO_DECK' });
    const pages = parseInt(req.body?.pages, 10);
    if (pages >= 1 && pages <= 2000) d.pages = pages;
    writeDeck(d);
    io.to(req.auth.room.consoleId).emit(EV.PRESENT_DECK, { kind: 'updated', deck: view(d) });
    io.to(`remotes:${req.auth.code}`).emit(EV.PRESENT_DECK, { kind: 'updated', deck: view(d) });
    broadcast(req.auth.code);
    res.json({ ok: true });
  });
  router.post('/decks/:id/thumb/:n', need(true), express.raw({ type: 'image/jpeg', limit: '400kb' }), (req, res) => {
    const d = readDeck(req.params.id), n = parseInt(req.params.n, 10);
    if (!d || !(n >= 1 && n <= 2000) || !Buffer.isBuffer(req.body) || sniff(req.body)?.ext !== 'jpg') return res.status(400).json({ error: 'BAD_THUMB' });
    writeFileSync(join(deckDir(d.id), `t${n}.jpg`), req.body);
    d.thumbs = Math.max(d.thumbs || 0, n);
    writeDeck(d);
    res.json({ ok: true });
  });
  router.put('/decks/:id/notes', need(), (req, res) => {
    const d = readDeck(req.params.id); if (!d) return res.status(404).json({ error: 'NO_DECK' });
    if (!req.auth.host && d.by !== req.auth.person?.id) return res.status(403).json({ error: 'NOT_YOURS' });
    d.notes = { ...(d.notes || {}), [String(parseInt(req.body?.page, 10) || 1)]: String(req.body?.text ?? '').slice(0, 2000) };
    writeDeck(d);
    broadcast(req.auth.code);
    res.json({ ok: true });
  });
  router.delete('/decks/:id', need(), (req, res) => {
    const d = readDeck(req.params.id); if (!d) return res.status(404).json({ error: 'NO_DECK' });
    if (!req.auth.host && d.by !== req.auth.person?.id) return res.status(403).json({ error: 'NOT_YOURS' });
    const s = stateOf();
    if (s.deckId === d.id) Object.assign(s, { deckId: null, presenter: null, black: false, laser: false });
    rmSync(deckDir(d.id), { recursive: true, force: true });
    io.to(req.auth.room.consoleId).emit(EV.PRESENT_DECK, { kind: 'removed', deck: view(d) });
    io.to(`remotes:${req.auth.code}`).emit(EV.PRESENT_DECK, { kind: 'removed', deck: view(d) });
    broadcast(req.auth.code);
    res.json({ ok: true });
  });

  // ---- presenting ----
  const whoAmI = (a) => (a.person ? { id: a.person.id, name: a.person.name } : { id: 'host', name: 'TV' });
  const mayDrive = (a, s) => a.host || (s.presenter && a.person?.id === s.presenter.id);
  router.post('/present/start', need(), (req, res) => {
    const d = readDeck(String(req.body?.deckId || '')); if (!d) return res.status(404).json({ error: 'NO_DECK' });
    const s = stateOf();
    if (s.deckId && s.presenter && s.presenter.id !== whoAmI(req.auth).id && !req.auth.host) return res.status(409).json({ error: 'BUSY', message: `${s.presenter.name} is presenting.` });
    Object.assign(s, { deckId: d.id, page: Math.min(d.lastPage || 1, d.pages || 1) || 1, black: false, presenter: whoAmI(req.auth), laser: false });
    broadcast(req.auth.code);
    res.json(publicState());
  });
  router.post('/present/goto', need(), (req, res) => {
    const s = stateOf();
    if (!s.deckId || !mayDrive(req.auth, s)) return res.status(403).json({ error: 'NOT_PRESENTER' });
    const d = readDeck(s.deckId), max = d?.pages || 1;
    const target = req.body?.delta ? s.page + Math.sign(req.body.delta) : parseInt(req.body?.page, 10);
    s.page = Math.max(1, Math.min(max, Number.isFinite(target) ? target : s.page));
    s.black = false;
    if (d) { d.lastPage = s.page; writeDeck(d); }
    broadcast(req.auth.code);
    res.json({ page: s.page });
  });
  router.post('/present/black', need(), (req, res) => {
    const s = stateOf();
    if (!s.deckId || !mayDrive(req.auth, s)) return res.status(403).json({ error: 'NOT_PRESENTER' });
    s.black = req.body?.on !== false && (req.body?.on === true || !s.black);
    broadcast(req.auth.code);
    res.json({ black: s.black });
  });
  router.post('/present/laser', need(), (req, res) => {
    const s = stateOf();
    if (!s.deckId || !mayDrive(req.auth, s)) return res.status(403).json({ error: 'NOT_PRESENTER' });
    s.laser = !!req.body?.on;
    broadcast(req.auth.code);
    res.json({ laser: s.laser });
  });
  router.post('/present/end', need(), (req, res) => {
    const s = stateOf();
    if (s.deckId && !mayDrive(req.auth, s)) return res.status(403).json({ error: 'NOT_PRESENTER' });
    Object.assign(s, { deckId: null, black: false, presenter: null, laser: false });
    broadcast(req.auth.code);
    res.json({ ok: true });
  });
  router.post('/present/takeover', need(true), (req, res) => {
    const s = stateOf(); if (!s.deckId) return res.status(400).json({ error: 'NOT_PRESENTING' });
    s.presenter = { id: 'host', name: 'TV' };
    broadcast(req.auth.code);
    res.json(publicState());
  });

  // The presenter's phone streams its motion for the laser dot: the server passes it to the TV (only from the presenter, only while the laser is on)
  io.on('connection', (socket) => {
    socket.on(EV.PRESENT_MOTION, (sample) => {
      if (socket.data.role !== 'remote') return;
      const room = rooms.get(socket.data.room), s = stateOf();
      const person = room?.people.get(socket.data.personKey);
      if (!room || !s.laser || !person || s.presenter?.id !== person.id) return;
      io.volatile.to(room.consoleId).emit(EV.PRESENT_MOTION, sample);
    });
  });

  party.router.use(router);
  return { stateOf, publicState };
}
