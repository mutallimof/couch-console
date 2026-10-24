// The stadium scenery files were written against a module-level track (OpenWii's track.js).
// This gives them the same names, bound to our track model of the Grand Stadium course.
import { createTrackModel, wrap, clamp, angle } from '../track-model.js';
import { STADIUM } from './stadium-def.js';

export const model = createTrackModel(STADIUM);
export const TRACK_LENGTH = model.length;
export const ROAD_HALF = model.roadHalf;
export const WALL_HALF = model.wallHalf;
export const TRACK_SAMPLES = model.samples;
export const controlDistances = model.controlDistances;
export const SECTIONS = {
  antiStart: controlDistances[STADIUM.stadium.anti[0]], antiEnd: controlDistances[STADIUM.stadium.anti[1]],
  glideStart: model.glides[0].start, glideEnd: model.glides[0].end,
};
export const BOOST_PADS = model.boostPads;
export const ITEM_ROWS = model.itemRows;
export const COIN_SPOTS = model.coinSpots;
export const { trackAt, surfaceAt, project } = model;
export { wrap, clamp, angle };
