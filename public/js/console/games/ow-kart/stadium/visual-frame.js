// OpenWii's roadFrame(s, lateral, heading), bound to the stadium course (see track.js).
import { roadFrame as frame } from '../frame.js';
import { model } from './track.js';
export const roadFrame = (s, lateral, heading) => frame(model, s, lateral, heading);
