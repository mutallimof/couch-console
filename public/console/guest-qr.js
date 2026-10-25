// The "Scan to add ..." QR for guests (people who are not one of the 4 players). It opens guest.html on the phone: upload-only,
// no player slot. The server decides the address (https: tunnel or local https), the same way as the main join QR.
import { party } from './party.js';

const cache = new Map(); // `${room}:${kind}` -> data URL
const key = (kind) => `${party.room}:${kind}`;

// Already loaded? ('' if not yet)
export const guestQrNow = (kind) => cache.get(key(kind)) || '';

export async function loadGuestQr(kind) {
  const k = key(kind);
  if (cache.has(k)) return cache.get(k);
  if (!party.room) return '';
  try {
    const { dataUrl } = await (await fetch(`/qr?room=${party.room}&for=${kind}`)).json();
    if (dataUrl) cache.set(k, dataUrl);
    return dataUrl || '';
  } catch { return ''; } // offline: the badge just stays hidden
}

// A small corner badge inside `parent` (a positioned screen). Returns the element.
export function mountGuestQr(parent, kind, label) {
  const el = document.createElement('div');
  el.className = 'guest-qr loading';
  el.hidden = true;
  el.innerHTML = `<img alt="QR code: ${label}"><span>${label}<small>no controller needed</small></span>`;
  parent.append(el);
  loadGuestQr(kind).then((url) => { if (!url || !el.isConnected) return; el.querySelector('img').src = url; el.hidden = false; el.classList.remove('loading'); });
  return el;
}
