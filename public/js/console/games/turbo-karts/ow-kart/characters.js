// Turbo Karts GP racers: Quaternius "Ultimate Animated Character Pack" (CC0, see THIRD_PARTY_NOTICES.md).
// path = the glTF in public/assets/quaternius-characters/ · color/accent tint the kart parts we draw ourselves.
// If a model can't be loaded the racer falls back to a code-built character, so the game always works.
const Q = (file) => `quaternius-characters/glTF/${file}.gltf`;
export const GP_CHARACTERS = [
  { id: 'anne', name: 'Anne', path: Q('Pirate_Female'), color: '#C08457', accent: '#F4D35E' },
  { id: 'henry', name: 'Henry', path: Q('Pirate_Male'), color: '#C92A2A', accent: '#FFD43B' },
  { id: 'suki', name: 'Suki', path: Q('Ninja_Female'), color: '#495057', accent: '#F03E3E' },
  { id: 'merlo', name: 'Merlo', path: Q('Wizard'), color: '#7048E8', accent: '#FFD43B' },
  { id: 'hazel', name: 'Hazel', path: Q('Witch'), color: '#9C36B5', accent: '#94D82D' },
  { id: 'bjorn', name: 'Bjorn', path: Q('Viking_Male'), color: '#8D6E63', accent: '#E03131' },
  { id: 'glint', name: 'Glint', path: Q('Knight_Golden_Male'), color: '#F2C94C', accent: '#FFFFFF' },
  { id: 'pepper', name: 'Pepper', path: Q('Chef_Female'), color: '#F4F1EC', accent: '#F76707' },
  { id: 'dusty', name: 'Dusty', path: Q('Cowboy_Male'), color: '#A47148', accent: '#4DABF7' },
  { id: 'fern', name: 'Fern', path: Q('Elf'), color: '#6FCF97', accent: '#E8F7EE' },
  { id: 'grub', name: 'Grub', path: Q('Goblin_Male'), color: '#74B816', accent: '#FFD43B' },
  { id: 'joy', name: 'Joy', path: Q('Doctor_Female_Young'), color: '#56CCF2', accent: '#FFFFFF' },
  { id: 'biscuit', name: 'Biscuit', path: Q('Pug'), color: '#E5C49F', accent: '#343A40' },
  { id: 'daisy', name: 'Daisy', path: Q('Cow'), color: '#F4F1EC', accent: '#F7A8B8' },
];
