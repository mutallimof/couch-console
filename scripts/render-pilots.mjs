// Draws the eight pilots, front and back, on one contact sheet (docs/screenshots/pilots/pilots-roster.jpg), and optionally the four karts.
//   node scripts/render-pilots.mjs [out=docs/screenshots/pilots] 
import { mkdirSync } from 'node:fs';
import { findPlaywright, startServer } from '../tests/helpers-e2e.mjs';

const pw = findPlaywright();
const out = process.argv[2] || 'docs/screenshots/pilots';
mkdirSync(out, { recursive: true });
const PORT = 9400 + Math.floor(Math.random() * 300);
const server = await startServer(PORT);
const browser = await pw.chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('page error:', String(e).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${PORT}/console.html?noboot=1&fx=off`);
  await page.evaluate(async () => {
    const THREE = await import('three');
    const models = await import('/games/turbo-karts/karts-models.js');
    const { GP_CHARACTERS } = await import('/games/turbo-karts/ow-kart/characters.js');
    const { KARTS } = await import('/games/turbo-karts/karts-data.js');
    models.setThree(THREE);
    const canvas = document.createElement('canvas'); canvas.id = 'sheet'; canvas.width = 1600; canvas.height = 1200;
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:1200px;z-index:9999';
    document.body.append(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(1); renderer.setScissorTest(true);
    renderer.toneMapping = THREE.NeutralToneMapping;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#BFE3FF');
    scene.add(new THREE.HemisphereLight('#ffffff', '#b5a98f', 2.4));
    const sun = new THREE.DirectionalLight('#fff3dd', 2.6); sun.position.set(3, 6, 5); scene.add(sun);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
    const cw = 200, ch = 300;
    const shoot = (obj, col, row, az, dist, y, look) => {
      obj.rotation.y = az; scene.add(obj);
      cam.position.set(0, y, dist); cam.lookAt(0, look, 0);
      cam.aspect = cw / ch; cam.updateProjectionMatrix();
      renderer.setViewport(col * cw, 1200 - (row + 1) * ch, cw, ch); renderer.setScissor(col * cw, 1200 - (row + 1) * ch, cw, ch);
      renderer.render(scene, cam); scene.remove(obj);
    };
    window.__sheet = { roster() {
      renderer.setClearColor('#BFE3FF'); renderer.clear();
      GP_CHARACTERS.forEach((c, i) => {
        const p = models.makeStandingCharacter(c, null, c.accent);
        p.anim.play('idle');
        for (let k = 0; k < 30; k++) p.anim.mixer.update(1 / 30);
        const col = (i % 4) * 2, row = Math.floor(i / 4);
        p.object.scale.setScalar(1);
        shoot(p.object, col, row, -0.35, 5.2, 2.5, 1.35); shoot(p.object, col + 1, row, Math.PI + 0.35, 5.2, 2.5, 1.35);
        p.anim.play('idle');
        for (let k = 0; k < 30; k++) p.anim.mixer.update(1 / 30);
      });
      // second band: the four karts with different pilots, front quarter and back quarter
      KARTS.forEach((k, i) => {
        const c = GP_CHARACTERS[i * 2];
        const r = models.makeRacer(c, k, ['#2F80ED', '#EB5757', '#27AE60', '#D99A00'][i], null);
        for (let n = 0; n < 40; n++) r.anim.mixer.update(1 / 30);
        r.flame.visible = false; r.shield.visible = false; r.marker.visible = false; r.sparks.forEach((s) => { s.visible = false; }); r.glider.visible = false;
        scene.add(r.root);
        cam.aspect = 400 / ch; cam.fov = 30; cam.updateProjectionMatrix();
        [[Math.PI - 0.7, 0], [0.75, 1]].forEach(([az, row2]) => {
          r.root.rotation.y = az; cam.position.set(0, 4.6, 10.5); cam.lookAt(0, 1.0, 0);
          renderer.setViewport(i * 400, row2 * ch, 400, ch); renderer.setScissor(i * 400, row2 * ch, 400, ch); renderer.render(scene, cam);
        });
        scene.remove(r.root); cam.fov = 26;
      });
    } };
    window.__sheet.roster();
    window.__podium = async () => {
      const { createPodium } = await import('/games/turbo-karts/karts-podium.js');
      const pod = createPodium(THREE, new Map(), [0, 1, 2].map((i) => ({ character: GP_CHARACTERS[[5, 2, 7][i]], color: ['#E8590C', '#EB5757', '#27AE60'][i] })));
      pod.canvas.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:430px;z-index:10000;background:linear-gradient(#EAF4FF,#fff)';
      document.body.append(pod.canvas);
      for (let i = 0; i < 90; i++) pod.update(0.04);
    };
  });
  await page.locator('#sheet').screenshot({ path: `${out}/pilots-roster.jpg`, type: 'jpeg', quality: 90 });
  console.log('wrote', `${out}/pilots-roster.jpg`);
  await page.evaluate(() => window.__podium());
  await page.waitForTimeout(500);
  await page.locator('.kart-podium-canvas').screenshot({ path: `${out}/pilots-podium.jpg`, type: 'jpeg', quality: 90 });
} finally { await browser.close(); server.kill(); }
