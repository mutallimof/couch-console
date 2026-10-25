// Connected players on the console. Other modules subscribe with onChange().
import { MAX_PLAYERS, colorFor } from '../shared/protocol.js';

const connected = new Map(); // playerId -> { playerId, color }
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn());

export const players = {
  join(playerId, color) {
    connected.set(playerId, { playerId, color: color || colorFor(playerId) });
    notify();
  },
  leave(playerId) {
    connected.delete(playerId);
    notify();
  },
  clear() {
    connected.clear();
    notify();
  },
  isConnected: (playerId) => connected.has(playerId),
  list: () => [...connected.values()],
  // All slots 1..MAX_PLAYERS, connected or not (for the pairing screen).
  slots: () => Array.from({ length: MAX_PLAYERS }, (_, i) => ({
    playerId: i + 1,
    color: colorFor(i + 1),
    connected: connected.has(i + 1),
  })),
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
