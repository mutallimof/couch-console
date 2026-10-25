// A grid of items (thumbnails) that P1 browses: hovering with the pointer or using the
// D-pad moves the highlight. Used by the Photos and Video channels.
//   grid.move(button) · grid.hover(playerId) · grid.index · grid.setIndex(i)

export function createFocusGrid({ items, columns, onChange }) {
  let index = 0;
  let lastPos = null;

  function setIndex(i, silent = false) {
    if (i === index || i < 0 || i >= items.length) return;
    items[index]?.classList.remove('focused');
    index = i;
    items[index].classList.add('focused');
    items[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!silent) onChange?.(index);
  }
  items[0]?.classList.add('focused');

  return {
    get index() { return index; },
    setIndex,
    // D-pad: UP / DOWN / LEFT / RIGHT
    move(button) {
      const step = { LEFT: -1, RIGHT: 1, UP: -columns, DOWN: columns }[button];
      if (step) setIndex(Math.max(0, Math.min(items.length - 1, index + step)));
    },
    // Pointer: highlight the item under the cursor, but only when the cursor moved
    // (so it doesn't fight with the D-pad).
    hover(pos) {
      if (!pos || (lastPos && Math.hypot(pos.x - lastPos.x, pos.y - lastPos.y) < 2)) return;
      lastPos = pos;
      const el = document.elementFromPoint(pos.x, pos.y)?.closest('[data-index]');
      if (el && items.includes(el)) setIndex(Number(el.dataset.index));
    },
  };
}
