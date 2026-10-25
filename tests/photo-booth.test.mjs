// Photo Booth without a camera: the frames and stickers draw, the face anchor math is right, sticker choices work out. npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAMES, drawFrame } from '../public/js/console/games/photo-booth/booth-frames.js';
import { STICKERS, faceAnchor, drawSticker } from '../public/js/console/games/photo-booth/booth-stickers.js';
import { wrapIndex, stickerFor, applyCommand } from '../public/js/console/games/photo-booth.js';
import { EV } from '../public/js/shared/protocol.js';

// A pretend 2D canvas context: remembers the calls, answers gradients, counts save() and restore()
function fakeContext() {
  const calls = { save: 0, restore: 0, total: 0 };
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(t, name) {
      if (name === 'calls') return calls;
      if (name === 'createLinearGradient' || name === 'createRadialGradient') return () => gradient;
      if (name in t) return t[name];
      return (...args) => { calls.total++; if (name === 'save') calls.save++; if (name === 'restore') calls.restore++; return args[0]; };
    },
    set(t, name, value) { t[name] = value; return true; },
  });
}

test('every frame draws (and leaves the canvas state as it found it)', () => {
  assert.ok(FRAMES.length >= 5);
  assert.equal(new Set(FRAMES.map((f) => f.id)).size, FRAMES.length, 'unique ids');
  assert.equal(FRAMES[0].id, 'none', 'the first choice is no frame');
  for (const f of FRAMES) {
    const ctx = fakeContext();
    drawFrame(ctx, f.id, 1280, 720, 1.5, 'Couch Console');
    assert.equal(ctx.calls.save, ctx.calls.restore, `${f.id}: save/restore balance`);
    if (f.id !== 'none') assert.ok(ctx.calls.total > 5, `${f.id} draws something`);
  }
});

test('face anchors follow the face: size, tilt, mirror', () => {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  Object.assign(lm, { 33: { x: 0.4, y: 0.5 }, 263: { x: 0.6, y: 0.5 }, 10: { x: 0.5, y: 0.3 }, 152: { x: 0.5, y: 0.8 }, 2: { x: 0.5, y: 0.65 }, 0: { x: 0.5, y: 0.7 } });
  const a = faceAnchor(lm, 1000, 500, false);
  assert.ok(Math.abs(a.width - 200) < 1e-6, 'eyes 0.2 apart on a 1000 px picture');
  assert.ok(Math.abs(a.roll) < 1e-9, 'level eyes: no tilt');
  assert.ok(a.up.y < 0, 'up points up the picture');
  assert.ok(a.headTop.y < 0.3 * 500, 'the head top is above the forehead');
  // tilt the head: the right eye lower
  lm[263] = { x: 0.6, y: 0.6 };
  assert.ok(faceAnchor(lm, 1000, 500, false).roll > 0.2, 'tilted head tilts the sticker');
  // mirrored: x flips, the size stays
  const m = faceAnchor(lm, 1000, 500, true);
  assert.ok(Math.abs(m.eyes.x - (1 - 0.5) * 1000) < 1e-6);
  assert.equal(faceAnchor([], 1000, 500), null, 'no face, no anchor');
});

test('every sticker draws on a face', () => {
  const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  Object.assign(lm, { 33: { x: 0.4, y: 0.5 }, 263: { x: 0.6, y: 0.5 }, 10: { x: 0.5, y: 0.3 }, 152: { x: 0.5, y: 0.8 }, 2: { x: 0.5, y: 0.65 }, 0: { x: 0.5, y: 0.7 } });
  const anchor = faceAnchor(lm, 1280, 720, true);
  assert.ok(STICKERS.length >= 8);
  for (const s of STICKERS) {
    const ctx = fakeContext();
    drawSticker(ctx, s.id, anchor);
    assert.equal(ctx.calls.save, ctx.calls.restore, `${s.id}: save/restore balance`);
    assert.ok(ctx.calls.total > 5, `${s.id} draws something`);
  }
  const hats = STICKERS.filter((s) => ['crown', 'party', 'top'].includes(s.id)).length;
  assert.equal(hats, 3, 'hats and a crown are there');
});

test('sticker choices: none, one for everyone, or a different one per face', () => {
  assert.equal(stickerFor('none', 0), null);
  assert.equal(stickerFor('crown', 3), 'crown');
  const mixed = [0, 1, 2, 3].map((i) => stickerFor('mix', i));
  assert.equal(new Set(mixed).size, 4, 'four faces, four different stickers');
  assert.equal(wrapIndex(-1, 6), 5);
  assert.equal(wrapIndex(6, 6), 0);
  assert.equal(typeof applyCommand, 'function');
});

test('the booth messages exist in the protocol', () => {
  assert.equal(EV.BOOTH_CMD, 'booth:cmd');
  assert.equal(EV.BOOTH_STATE, 'booth:state');
});
