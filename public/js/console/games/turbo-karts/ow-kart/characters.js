// Turbo Karts GP racers: Quaternius "Ultimate Animated Character Pack" (CC0, see THIRD_PARTY_NOTICES.md).
// path = the glTF in public/assets/quaternius-characters/ · color/accent tint the kart parts we draw ourselves.
// If a model can't be loaded the racer falls back to a code-built character, so the game always works.
const Q = (file) => `quaternius-characters/glTF/${file}.gltf`;
// The 8 racers that look best and most different from each other. `skin` repaints the pack's "Skin"
// material (it ships almost black: the faces were black); animals keep their own.
export const GP_CHARACTERS = [
  { id: 'anne', name: 'Anne', path: Q('Pirate_Female'), skin: '#F0C09A', color: '#C08457', accent: '#F4D35E' },
  { id: 'suki', name: 'Suki', path: Q('Ninja_Female'), skin: '#EDBE97', color: '#495057', accent: '#F03E3E' },
  { id: 'merlo', name: 'Merlo', path: Q('Wizard'), skin: '#E9B88E', color: '#7048E8', accent: '#FFD43B' },
  { id: 'bjorn', name: 'Bjorn', path: Q('Viking_Male'), skin: '#E3AF86', color: '#8D6E63', accent: '#E03131' },
  { id: 'glint', name: 'Glint', path: Q('Knight_Golden_Male'), skin: '#D9A877', color: '#F2C94C', accent: '#FFFFFF' },
  { id: 'grub', name: 'Grub', path: Q('Goblin_Male'), color: '#74B816', accent: '#FFD43B' },
  { id: 'biscuit', name: 'Biscuit', path: Q('Pug'), color: '#E5C49F', accent: '#343A40' },
  { id: 'daisy', name: 'Daisy', path: Q('Cow'), color: '#F4F1EC', accent: '#F7A8B8' },
];
