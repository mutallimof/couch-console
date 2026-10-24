// Which Kenney sound plays for which game sound (Phase 55; CC0 packs in public/assets/sounds/kenney/).
// file: path under /assets/sounds/kenney/ · vol: 0..1 · rate: playback speed. A sound that is missing here (or a
// page where the audio library didn't load) uses the synth sound of the same name in sound.js.
const I = (n) => `interface/Audio/${n}.ogg`, M = (n) => `impact/Audio/${n}.ogg`, J = (d, n) => `jingles/Audio/${d} jingles/jingles_${n}.ogg`;
export const KENNEY = {
  hover: { file: I('tick_001'), vol: 0.22 },
  join: { file: I('confirmation_002'), vol: 0.5 },
  leave: { file: I('close_002'), vol: 0.45 },
  select: { file: I('select_002'), vol: 0.55 },
  back: { file: I('back_002'), vol: 0.5 },
  pop: { file: I('drop_002'), vol: 0.6 },
  golden: { file: J('Pizzicato', 'PIZZI04'), vol: 0.5 },
  bomb: { file: M('impactPunch_heavy_000'), vol: 0.8 },
  hit: { file: M('impactGeneric_light_002'), vol: 0.45 },
  wall: { file: M('impactPlate_light_001'), vol: 0.35 },
  point: { file: I('error_003'), vol: 0.4 },
  strike: { file: J('Steel', 'STEEL03'), vol: 0.6 },
  roll: { file: M('impactWood_light_001'), vol: 0.35, rate: 0.6 },
  pins: { file: M('impactWood_heavy_001'), vol: 0.7 },
  shot: { file: M('impactMetal_light_000'), vol: 0.45 },
  clink: { file: I('glass_003'), vol: 0.35 },
  clear: { file: I('scroll_003'), vol: 0.4 },
  tick: { file: I('tick_002'), vol: 0.3 },
  start: { file: J('8-Bit', 'NES00'), vol: 0.45 },
  end: { file: J('Hit', 'HIT07'), vol: 0.5 },
};
// The menu's hover sound gets higher in each column (a major pentatonic run)
export const HOVER_RATES = [1, 1.122, 1.26, 1.498, 1.682];
