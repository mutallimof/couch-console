// Shared constants used by the server, the console (laptop) and the remote (phone).

// Up to 4 phones (Phase 21c). Most games take 2; Balloon Pop, Draw and Target Range take 4.
export const MAX_PLAYERS = 4;

// Index 0 = P1, index 1 = P2, ... (P4's yellow is darkened so white text on it stays readable)
export const PLAYER_COLORS = ['#2F80ED', '#EB5757', '#27AE60', '#D99A00'];

export const colorFor = (playerId) => PLAYER_COLORS[playerId - 1];

// Guests (Phase 43): anyone can join to share photos, queue music or present, without a
// controller. They have no P-number: just a name, an emoji and a color of their own.
export const MAX_GUESTS = 200;
export const GUEST_COLORS = ['#9B51E0', '#F2994A', '#00A6A6', '#E0457B', '#5C7CFA', '#74B816', '#C9732B', '#6C757D'];
export const EMOJIS = ['😀', '😎', '🤠', '🦊', '🐼', '🐸', '🦄', '🐙', '🚀', '🍕', '🎸', '🌈', '⚡', '🍩', '🐯', '🦖'];
export const NAME_MAX = 20;

// How much space the party's photos may use (Settings -> Party)
export const PHOTO_LIMITS_GB = [1, 2, 3, 5, 10, 20];

// Room codes use A–Z without I and O (easy to read and type).
export const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

// A phone that reconnects within this time gets its old slot back.
export const RECONNECT_GRACE_MS = 30_000;


// Socket event names (see docs/PLAN.md, section 5).
export const EV = {
  CONSOLE_CREATE: 'console:create',
  REMOTE_JOIN: 'remote:join',
  PARTY_ACTIVITY: 'party:activity', // server -> console + phones: { entry } (a new line in the activity feed; an entry with a known id replaces it)
  ACTIVITY_GAME: 'activity:game', // console -> server: { playerId, game, what: 'won' } (the feed says who won)
  REMOTE_REPLACED: 'remote:replaced', // server -> an older tab of the same phone: a newer tab took over
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  CONSOLE_DISCONNECTED: 'console:disconnected',
  INPUT_POINTER: 'input:pointer',
  INPUT_BUTTON: 'input:button',
  INPUT_SWING: 'input:swing',
  INPUT_RECENTER: 'input:recenter', // { relearn?: true } = the phone's screen turned: the console learns its gyro axes again
  FEEDBACK_RUMBLE: 'feedback:rumble',
  FEEDBACK_SETTINGS: 'feedback:settings', // { phoneSounds?, theme?: 'light' | 'dark', rangeX?, rangeY? } (`theme` is also in the join answer)
  FEEDBACK_MODE: 'feedback:mode',   // { mode: 'pointer' | 'wheel' | 'keyboard', prompt? } (also in the join answer as `layout`)
  INPUT_WHEEL: 'input:wheel',       // { steer: -1..1 }
  INPUT_TEXT: 'input:text',         // { text } typed on the phone ('' = cancelled)
  // Raw phone sensors, ~60 per second: { alpha, beta, gamma, motion: { rx, ry, rz } }.
  // The console turns these into a cursor (pointer/gyro-pointer.js). input:pointer is
  // still used by the touchpad on phones without motion sensors.
  INPUT_MOTION: 'input:motion',
  // Party (Phase 43). Everything below is an addition: phones that don't know it still work.
  PARTY_ROSTER: 'party:roster',     // server -> console + phones: { people: [{ id, name, emoji, color, role, playerId, online }] }
  REMOTE_ROLE: 'remote:role',       // phone -> server, with ack: { to: 'player' | 'guest' } -> { ok, role, playerId?, color?, error? }
  PARTY_PHOTO: 'party:photo',       // server -> TV (always) and phones (visible photos): { kind: 'added' | 'removed' | 'hidden' | 'shown', photo }
  MUSIC_STATE: 'music:state',       // server -> TV + phones: { now, queue, paused, skips, skipNeeded, added?, skipped?, error? }
  MUSIC_ENDED: 'music:ended',       // TV -> server: { videoId } the song finished
  MUSIC_ERROR: 'music:error',       // TV -> server: { videoId, code } YouTube could not play it
  PRESENT_STATE: 'present:state',   // server -> TV + phones: { active, deck, page, black, presenter, laser, notes }
  PRESENT_DECK: 'present:deck',     // server -> TV + phones: { kind: 'added' | 'updated' | 'removed', deck }
  PRESENT_MOTION: 'present:motion', // presenter's phone -> server -> TV: raw sensors for the laser dot (only while the laser is on)
  REMOTE_PROFILE: 'remote:profile', // phone -> server, with ack: { name, emoji } -> { ok }
};

// The remote -> console input events the server relays (with playerId added).
export const INPUT_EVENTS = [EV.INPUT_POINTER, EV.INPUT_BUTTON, EV.INPUT_SWING, EV.INPUT_RECENTER, EV.INPUT_WHEEL, EV.INPUT_TEXT, EV.INPUT_MOTION];
