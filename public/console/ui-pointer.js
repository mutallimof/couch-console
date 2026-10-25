// The ONE place where the pointer meets the TV's screens (menus, settings, apps, kart menus, party games...).
// A screen only marks its elements; it never has to look at the pointer itself:
//
//   data-ui            something the cursor can highlight (it gets .ui-hover, and a bubbling `ui-hover` event the screen may listen to
//                      to keep its own selection in step, e.g. set an index). A tap / A on it passes through to the screen as usual,
//                      because the highlighted thing IS the selection.
//   data-key="PLUS"    an on-screen button that stands for a phone key: a tap / A on it sends that key to the screen
//   data-action, data-act, <button>   a tap / A on it clicks it (a normal `click` event)
//
// Existing D-pad focus (data-focus tiles, data-index grid items, data-mode picker items) is hover-aware too.
// A tap on the phone touchpad is an A press, so "hover + tap" and "hover + A" are the same thing everywhere.

export const HOVER_TARGETS = '[data-ui],[data-focus],[data-index],[data-mode],[data-key],[data-action],[data-act],button:not(:disabled),[role="button"]';
export const PRESS_TARGETS = '[data-key],[data-action],[data-act],[data-click],button:not(:disabled),[role="button"]';

export function createUiPointer({ pointers, root = document, deliver, canAct = () => true, onSound = () => {} }) {
  const last = new Map();       // playerId -> { x, y, el } where we looked last
  const swallow = new Set();    // players whose A is held and was used by us: the screen must not see its 'up' either

  const targetAt = (playerId, selector) => {
    const el = pointers.elementAt(playerId)?.closest?.(selector);
    return el && el.offsetParent !== null ? el : null;
  };

  // Every frame: a cursor that moved onto something new highlights it. (Only when it moved, so it never fights the D-pad.)
  function frame() {
    document.body.classList.toggle('pointer-live', pointers.ids().some((id) => pointers.active(id))); // (on-screen keys only show while a cursor is in use)
    for (const id of pointers.ids()) {
      const pos = pointers.position(id);
      const prev = last.get(id);
      if (prev && Math.hypot(pos.x - prev.x, pos.y - prev.y) < 1) continue;
      const el = targetAt(id, HOVER_TARGETS);
      last.set(id, { x: pos.x, y: pos.y, el });
      if (el === (prev?.el ?? null) || !el) continue;
      if (!canAct(id)) continue;
      el.classList.add('ui-hover');
      prev?.el?.classList.remove('ui-hover');
      const ev = new CustomEvent('ui-hover', { bubbles: true, cancelable: true, detail: { playerId: id } });
      if (el.dispatchEvent(ev)) onSound('hover');
    }
  }

  // A pressed (down) or released (up). Returns true when the press was used here (the screen must not get it).
  function press(playerId, state) {
    if (state !== 'down') return swallow.delete(playerId);
    if (!pointers.active(playerId) || !canAct(playerId)) return false;
    const el = targetAt(playerId, PRESS_TARGETS);
    if (!el) return false;
    swallow.add(playerId);
    onSound('select');
    el.classList.add('ui-pressed');
    setTimeout(() => el.classList.remove('ui-pressed'), 140);
    el.dispatchEvent(new CustomEvent('ui-press', { bubbles: true, detail: { playerId, key: el.dataset.key || null } }));
    if (el.dataset.key) {
      deliver({ playerId, button: el.dataset.key, state: 'down', virtual: true });
      setTimeout(() => deliver({ playerId, button: el.dataset.key, state: 'up', virtual: true }), 60);
    } else {
      el.click();
    }
    return true;
  }

  return { frame, press };
}

// A row of on-screen buttons for an app whose controls are phone keys, so it can be driven with the pointer too:
//   actionBar(container, [{ key: 'PLUS', label: 'Skip', hint: '+' }, ...])  -> the element (remove it on unmount)
export function actionBar(container, actions) {
  const bar = document.createElement('div');
  bar.className = 'ui-actions';
  bar.innerHTML = actions.map((a) => `<button type="button" class="ui-btn ghost ui-focus" data-key="${a.key}"><span>${a.label}</span>${a.hint ? `<kbd>${a.hint}</kbd>` : ''}</button>`).join('');
  container.append(bar);
  return bar;
}
