// Walk the TV's home focus to a thing with the D-pad, the way a player would (Phase 55 home screen).
// `press(button)` sends one D-pad button from a phone; `tv` is the console page; key is e.g. 'dock:photos' or 'hero:turbo-karts'.
export async function focusOn(tv, press, key) {
  for (let i = 0; i < 30; i++) {
    const d = await tv.evaluate((k) => {
      const f = document.querySelector('.menu .focused'), t = document.querySelector(`.menu [data-focus="${k}"]`);
      if (!t) return 'MISSING';
      if (f === t) return 'HERE';
      const a = f.getBoundingClientRect(), b = t.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      return Math.abs(dy) > Math.abs(dx) * 0.6 ? (dy > 0 ? 'DOWN' : 'UP') : (dx > 0 ? 'RIGHT' : 'LEFT');
    }, key);
    if (d === 'HERE') return;
    if (d === 'MISSING') throw new Error(`no ${key} on the home screen`);
    await press(d);
  }
  throw new Error(`could not reach ${key} with the D-pad`);
}
