// The one music player of the TV page, shared by main.js (which feeds it) and the Music screen (which shows it).
import { createMusicPlayer } from './music-player.js';
import { party } from './party.js';
import { socket } from './socket.js';

export const musicPlayer = createMusicPlayer({ socket, party });
