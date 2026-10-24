// Shared constants used by the server, the console (laptop) and the remote (phone).

// Up to 4 phones (Phase 21c). Most games take 2; Balloon Pop, Draw and Target Range take 4.
export const MAX_PLAYERS = 4;

// Index 0 = P1, index 1 = P2, ... (P4's yellow is darkened so white text on it stays readable)
export const PLAYER_COLORS = ['#2F80ED', '#EB5757', '#27AE60', '#D99A00'];

export const colorFor = (playerId) => PLAYER_COLORS[playerId - 1];

// Room codes use A–Z without I and O (easy to read and type).
export const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

// A phone that reconnects within this time gets its old slot back.
export const RECONNECT_GRACE_MS = 30_000;

// R = DRIFT on the kart pad (Phase 22)
export const BUTTONS = ['A', 'B', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME', 'PLUS', 'MINUS', 'R'];

// Socket event names (see PLAN.md, section 5).
export const EV = {
  CONSOLE_CREATE: 'console:create',
  REMOTE_JOIN: 'remote:join',
  PLAYER_JOINED: 'player:joined',
  PLAYER_LEFT: 'player:left',
  CONSOLE_DISCONNECTED: 'console:disconnected',
  INPUT_POINTER: 'input:pointer',
  INPUT_BUTTON: 'input:button',
  INPUT_SWING: 'input:swing',
  INPUT_RECENTER: 'input:recenter', // { relearn?: true } = the phone's screen turned: the console learns its gyro axes again
  FEEDBACK_RUMBLE: 'feedback:rumble',
  FEEDBACK_SETTINGS: 'feedback:settings',
  FEEDBACK_MODE: 'feedback:mode',   // { mode: 'pointer' | 'wheel' | 'keyboard', prompt? } (also in the join answer as `layout`)
  INPUT_WHEEL: 'input:wheel',       // { steer: -1..1 }
  INPUT_TEXT: 'input:text',         // { text } typed on the phone ('' = cancelled)
  // Raw phone sensors, ~60 per second: { alpha, beta, gamma, motion: { rx, ry, rz } }.
  // The console turns these into a cursor (pointer/gyro-pointer.js). input:pointer is
  // still used by the touchpad on phones without motion sensors.
  INPUT_MOTION: 'input:motion',
};

// The remote -> console input events the server relays (with playerId added).
export const INPUT_EVENTS = [EV.INPUT_POINTER, EV.INPUT_BUTTON, EV.INPUT_SWING, EV.INPUT_RECENTER, EV.INPUT_WHEEL, EV.INPUT_TEXT, EV.INPUT_MOTION];
