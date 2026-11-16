// Turbo Karts pilots: eight racers in the same racing suit, each with a helmet of their own (shape, visor, stickers, ears or fins).
// Everything is built in code (karts-pilot.js), so there are no model files. color = the helmet / the pilot's signature color (the
// ring on the select screen, the podium) · accent = the suit color the computer drivers wear (a player wears their own player color).
// Names and designs are ours.
export const GP_CHARACTERS = [
  { id: 'dash', name: 'Dash', color: '#3FA9FF', accent: '#2F80ED', tag: 'Star helmet, always first off the line', helmet: 'round + star' },
  { id: 'bruno', name: 'Bruno', color: '#D9954F', accent: '#E8590C', tag: 'Big ears, bigger heart', helmet: 'bear ears' },
  { id: 'finn', name: 'Finn', color: '#46A7E8', accent: '#12B8A6', tag: 'Cuts through every corner', helmet: 'shark fin' },
  { id: 'mimi', name: 'Mimi', color: '#F06EAA', accent: '#E64980', tag: 'Lands on all four wheels', helmet: 'cat ears' },
  { id: 'hopper', name: 'Hopper', color: '#7FD9A0', accent: '#7C5CFF', tag: 'Hops over everything', helmet: 'bunny ears' },
  { id: 'blaze', name: 'Blaze', color: '#FF5A3C', accent: '#F03E3E', tag: 'Nose cone, full throttle', helmet: 'rocket' },
  { id: 'rex', name: 'Rex', color: '#69D24A', accent: '#2FBF71', tag: 'Small arms, huge boost', helmet: 'dino plates' },
  { id: 'zap', name: 'Zap', color: '#FFD21F', accent: '#5B3FD9', tag: 'Lightning in a helmet', helmet: 'mohawk + bolt' },
];
export const CLIPS = ['drive', 'idle', 'wave', 'cheer', 'defeat', 'hit']; // what every pilot can do

// When each clip plays (turbo-karts.js, karts-showroom.js, karts-podium.js follow this):
//   idle: select screen, start grid, podium · wave: a player picks the pilot · cheer: finishing 1st to 3rd, a kart is chosen, 1st on the podium (2nd and 3rd wave)
//   hit: an item or a hazard hits · defeat (slump): finishing 4th or lower
export const finishClip = (place) => (place <= 3 ? 'cheer' : 'defeat');
