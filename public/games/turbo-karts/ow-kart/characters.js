// Turbo Karts racers: the KayKit characters (CC0, Kay Lousberg: Adventurers and Skeletons packs, see THIRD_PARTY_NOTICES.md).
// path = the optimized GLB in public/assets/cast/ (made by scripts/build-cast.mjs: no held weapons, only the clips we play:
// idle, sit, cheer, defeat, hit, wave) · color = this racer's own color (the CPU kart, the podium, the select screen).
// Names are ours. If a model can't be loaded the racer falls back to a code-built character, so the game always works.
const K = (file) => `cast/${file}.glb`;
export const GP_CHARACTERS = [
  { id: 'clanky', name: 'Sir Clanky', path: K('knight'), color: '#4D83FF', accent: '#FFD43B', kind: 'knight', tag: 'Polished and proud' },
  { id: 'grumbo', name: 'Grumbo', path: K('barbarian'), color: '#E8590C', accent: '#FFE066', kind: 'barbarian', tag: 'Loud, fast, fearless' },
  { id: 'fizzwick', name: 'Fizzwick', path: K('mage'), color: '#8B5CF6', accent: '#FFD43B', kind: 'mage', tag: 'Sparkles at every corner' },
  { id: 'nimble', name: 'Nimble', path: K('rogue'), color: '#2FBF71', accent: '#FFFFFF', kind: 'rogue', tag: 'Takes every shortcut' },
  { id: 'hoodsy', name: 'Hoodsy', path: K('rogue-hooded'), color: '#E64980', accent: '#FFE066', kind: 'rogue', tag: 'Quiet. Then very quick.' },
  { id: 'rattles', name: 'Rattles', path: K('skeleton-warrior'), color: '#F2C94C', accent: '#4B5563', kind: 'skeleton', tag: 'Bones to pick' },
  { id: 'spookle', name: 'Spookle', path: K('skeleton-mage'), color: '#22B8CF', accent: '#FFFFFF', kind: 'skeleton', tag: 'Haunts the slipstream' },
  { id: 'clatter', name: 'Clatter', path: K('skeleton-rogue'), color: '#A78BFA', accent: '#FFE066', kind: 'skeleton', tag: 'Rattles the leaderboard' },
];
export const CLIPS = ['idle', 'sit', 'cheer', 'defeat', 'hit', 'wave']; // what every model has
