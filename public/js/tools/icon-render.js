// Renders one isometric "toy diorama" icon (see icon-scenes.js) into a transparent 512x512 canvas.
// Same camera, same studio light and the same tiled base for every icon, so they all match.
import * as THREE from 'three';
import { SCENES, makeBase } from './icon-scenes.js';

const id = new URLSearchParams(location.search).get('id');
const SIZE = 512;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
// Soft studio light: a sky/ground fill, a warm key from the upper left with soft shadows, a cool kick from the right
scene.add(new THREE.HemisphereLight('#ffffff', '#cdd9ff', 1.5));
const key = new THREE.DirectionalLight('#fff1dc', 2.3);
key.position.set(-6, 10, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
key.shadow.radius = 5;
key.shadow.bias = -0.0006;
scene.add(key);
const kick = new THREE.DirectionalLight('#cfe3ff', 0.9);
kick.position.set(7, 4, 6);
scene.add(kick);

const root = new THREE.Group();
scene.add(root);
root.add(makeBase(THREE, id));
SCENES[id]?.(THREE, root);
root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

// Isometric camera, framed on the base
const cam = new THREE.OrthographicCamera(-3.95, 3.95, 3.95, -3.95, 0.1, 60);
cam.position.set(9, 8.2, 9);
cam.lookAt(0, 1.1, 0);
renderer.render(scene, cam);
// Where the picture is (so the script can crop the empty margins away)
const gl = renderer.getContext(), px = new Uint8Array(SIZE * SIZE * 4);
gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, px);
let x0 = SIZE, y0 = SIZE, x1 = 0, y1 = 0;
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (px[(y * SIZE + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); const yy = SIZE - 1 - y; y0 = Math.min(y0, yy); y1 = Math.max(y1, yy); }
const pad = 6;
window.__bbox = { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), width: Math.min(SIZE, x1 + pad) - Math.max(0, x0 - pad), height: Math.min(SIZE, y1 + pad) - Math.max(0, y0 - pad) };
window.__rendered = id;
