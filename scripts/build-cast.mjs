// Builds the racing cast from the KayKit character packs (CC0, Kay Lousberg; see THIRD_PARTY_NOTICES.md).
// For each character: drop every held weapon / accessory (anything attached to a hand slot), keep only the clips the game
// uses, resample and quantize, and write a small GLB into public/assets/cast/. Only these optimized files are committed.
//   node scripts/build-cast.mjs <adventures pack folder> <skeletons pack folder>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize, resample, weld } from '@gltf-transform/functions';
import { readdirSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [adv, skel] = process.argv.slice(2);
if (!adv || !skel) { console.error('usage: node scripts/build-cast.mjs <adventures folder> <skeletons folder>'); process.exit(1); }
const find = (root, name) => {
  const hit = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? hit(join(dir, e.name)) : e.name === name ? [join(dir, e.name)] : []));
  return hit(root)[0];
};
// The clips the game plays. Names in the packs differ a little; each wanted clip lists what to look for.
const CLIPS = { idle: 'Idle', sit: 'Sit_Chair_Idle', cheer: 'Cheer', defeat: 'Death_A', hit: 'Hit_A', wave: 'Interact' };
const CAST = [
  ['knight', adv, 'Knight.glb'], ['barbarian', adv, 'Barbarian.glb'], ['mage', adv, 'Mage.glb'], ['rogue', adv, 'Rogue.glb'], ['rogue-hooded', adv, 'Rogue_Hooded.glb'],
  ['skeleton-warrior', skel, 'Skeleton_Warrior.glb'], ['skeleton-mage', skel, 'Skeleton_Mage.glb'], ['skeleton-rogue', skel, 'Skeleton_Rogue.glb'],
];
const out = new URL('../public/assets/cast/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const [id, root, file] of CAST) {
  const path = find(root, file);
  const doc = await io.read(path), g = doc.getRoot();
  const removed = [];
  // 1. held things: every mesh below a hand slot (weapons, shields, tools)
  for (const node of g.listNodes()) {
    let up = node.getParentNode(), underSlot = false;
    while (up) { if (/slot/i.test(up.getName())) underSlot = true; up = up.getParentNode(); }
    if (underSlot && node.getMesh()) { removed.push(node.getName()); node.dispose(); }
  }
  // 2. only the clips we use, renamed to our own names
  const keep = new Map(Object.entries(CLIPS).map(([ours, theirs]) => [theirs, ours]));
  for (const anim of g.listAnimations()) {
    if (keep.has(anim.getName())) anim.setName(keep.get(anim.getName()));
    else { anim.listChannels().forEach((c) => c.dispose()); anim.listSamplers().forEach((s) => s.dispose()); anim.dispose(); }
  }
  const missing = Object.keys(CLIPS).filter((n) => !g.listAnimations().some((a) => a.getName() === n));
  if (missing.length) throw new Error(`${id}: missing clips ${missing}`);
  await doc.transform(prune(), dedup(), resample(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 12 }), prune());
  const file2 = join(out, `${id}.glb`);
  writeFileSync(file2, await io.writeBinary(doc));
  console.log(id.padEnd(18), `${(statSync(file2).size / 1e6).toFixed(2)} MB`, 'removed:', removed.join(', ') || '-');
}
