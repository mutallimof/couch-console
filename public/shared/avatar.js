// Original little avatars (Phase 55): a face shape, a skin tone, hair, eyes, a mouth and an accessory,
// on a colored round background. Drawn as SVG so the phone (editor) and the TV (sidebar, lobbies,
// results, photo credits, activity) draw exactly the same face. An avatar is just small whole numbers.

export const SKINS = ['#FFE0C2', '#F6C8A0', '#E0A678', '#C98B5B', '#9A6540', '#6B4429'];
export const HAIR_COLORS = ['#2B2118', '#6B3E1F', '#B5651D', '#E8B94A', '#D8456B', '#6C5CE7'];
export const BGS = ['#FFD3A5', '#FFC1D6', '#B9E6FF', '#C9F2D5', '#E3D4FF', '#FFE9A3', '#FFB8A8', '#CFE0FF'];
export const LIMITS = { face: 3, skin: SKINS.length, hair: 7, hairColor: HAIR_COLORS.length, eyes: 5, mouth: 4, acc: 6, bg: BGS.length };
export const PARTS = [
  ['face', 'Face', ['Round', 'Square', 'Oval']],
  ['skin', 'Skin', null],
  ['hair', 'Hair', ['None', 'Short', 'Long', 'Curly', 'Mohawk', 'Bun', 'Spiky']],
  ['hairColor', 'Hair color', null],
  ['eyes', 'Eyes', ['Dots', 'Happy', 'Big', 'Sleepy', 'Wink']],
  ['mouth', 'Mouth', ['Smile', 'Open', 'Cat', 'Flat']],
  ['acc', 'Extra', ['None', 'Glasses', 'Sunglasses', 'Headband', 'Bow', 'Party hat']],
  ['bg', 'Background', null],
];

const int = (v, max, fallback) => (Number.isInteger(v) && v >= 0 && v < max ? v : fallback);
// Anything from the network becomes a valid avatar (or the default one)
export function cleanAvatar(a) {
  const o = a && typeof a === 'object' ? a : {};
  return Object.fromEntries(Object.entries(LIMITS).map(([k, max]) => [k, int(o[k], max, k === 'hair' ? 1 : 0)]));
}
export function randomAvatar(rand = Math.random) {
  return Object.fromEntries(Object.entries(LIMITS).map(([k, max]) => [k, Math.floor(rand() * max)]));
}

export function avatarSvg(avatar, size = 64) {
  const a = cleanAvatar(avatar), skin = SKINS[a.skin], hc = HAIR_COLORS[a.hairColor], ink = '#2B2118';
  const head = [
    `<circle cx="50" cy="54" r="30" fill="${skin}"/>`,
    `<rect x="21" y="25" width="58" height="58" rx="17" fill="${skin}"/>`,
    `<ellipse cx="50" cy="54" rx="26" ry="32" fill="${skin}"/>`,
  ][a.face];
  const top = a.face === 2 ? 22 : 24;
  const hairBack = ['', '', `<path d="M18 56c-4-30 12-40 32-40s36 10 32 40c0 12-4 24-8 28l-6-34H32l-6 34c-4-4-8-16-8-28z" fill="${hc}"/>`, '', '', `<circle cx="50" cy="14" r="11" fill="${hc}"/>`, ''][a.hair];
  const hairFront = [
    '',
    `<path d="M20 50c-2-24 12-32 30-32s32 8 30 32c-6-12-14-17-30-17S26 38 20 50z" fill="${hc}"/>`,
    `<path d="M20 52c-2-26 12-34 30-34s32 8 30 34c-4-14-12-20-30-20S24 38 20 52z" fill="${hc}"/>`,
    [[26, 32, 11], [40, 25, 12], [56, 25, 12], [72, 33, 11], [20, 46, 9], [80, 46, 9]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${hc}"/>`).join(''),
    `<path d="M42 ${top - 14}h16l4 26H38z" fill="${hc}"/>`,
    `<path d="M22 48c0-20 12-28 28-28s28 8 28 28c-8-10-16-12-28-12s-20 2-28 12z" fill="${hc}"/>`,
    [[28, 40], [38, 30], [50, 26], [62, 30], [72, 40]].map(([x, y]) => `<path d="M${x - 7} ${y + 8}l7-${y - 10}l7 ${y - 10}z" fill="${hc}" transform="translate(0 ${-4})"/>`).join('') + `<path d="M22 50c0-12 8-20 28-20s28 8 28 20c-8-6-16-8-28-8s-20 2-28 8z" fill="${hc}"/>`,
  ][a.hair];
  const eye = (x) => [
    `<circle cx="${x}" cy="54" r="3.6" fill="${ink}"/>`,
    `<path d="M${x - 5} 56q5-8 10 0" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
    `<ellipse cx="${x}" cy="54" rx="5" ry="6" fill="#fff"/><circle cx="${x}" cy="55" r="3.4" fill="${ink}"/><circle cx="${x - 1.2}" cy="53.4" r="1.2" fill="#fff"/>`,
    `<path d="M${x - 5} 55h10" stroke="${ink}" stroke-width="3.4" stroke-linecap="round"/>`,
    x < 50 ? `<circle cx="${x}" cy="54" r="3.6" fill="${ink}"/>` : `<path d="M${x - 5} 55q5 5 10 0" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
  ][a.eyes];
  const mouth = [
    `<path d="M41 68q9 9 18 0" stroke="${ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
    `<path d="M41 66h18q-2 11-9 11t-9-11z" fill="#8A2B3A"/>`,
    `<path d="M40 67q5 7 10 0q5 7 10 0" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    `<path d="M43 69h14" stroke="${ink}" stroke-width="3.2" stroke-linecap="round"/>`,
  ][a.mouth];
  const cheeks = `<circle cx="33" cy="64" r="4.4" fill="#FF8FA3" opacity=".45"/><circle cx="67" cy="64" r="4.4" fill="#FF8FA3" opacity=".45"/>`;
  const acc = [
    '',
    `<g fill="none" stroke="${ink}" stroke-width="2.6"><circle cx="38" cy="54" r="9"/><circle cx="62" cy="54" r="9"/><path d="M47 54h6"/></g>`,
    `<g fill="${ink}"><rect x="27" y="47" width="21" height="14" rx="6"/><rect x="52" y="47" width="21" height="14" rx="6"/><rect x="47" y="50" width="6" height="3"/></g>`,
    `<path d="M20 40q30-14 60 0l-1 8q-29-12-58 0z" fill="#FF5C8A"/>`,
    `<g fill="#FF5C8A"><path d="M66 24l14-8v18z"/><path d="M66 24L52 16v18z"/><circle cx="66" cy="25" r="4.5" fill="#FFC93C"/></g>`,
    `<path d="M50 -2l15 30H35z" fill="#3FA9FF"/><circle cx="50" cy="-2" r="4.5" fill="#FFC93C"/><path d="M38 20h24" stroke="#fff" stroke-width="3"/>`,
  ][a.acc];
  return `<svg class="avatar" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><defs><clipPath id="av-c"><circle cx="50" cy="50" r="50"/></clipPath></defs><circle cx="50" cy="50" r="50" fill="${BGS[a.bg]}"/><g clip-path="url(#av-c)" transform="translate(0 6)">${hairBack}${head}${hairFront}${eye(38)}${eye(62)}${cheeks}${mouth}${acc}</g></svg>`;
}
