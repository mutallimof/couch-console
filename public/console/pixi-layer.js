// A PixiJS finishing layer for the 2D (canvas) games (Phase 55). The game keeps drawing on its own canvas; this layer
// shows that canvas through Pixi with a touch more color (pixi-filters), and glowing particle bursts on top.
// If Pixi can't start (no WebGL, library missing) it returns null and the game just keeps using its own canvas.
//   const px = await createPixiLayer(canvas);   px?.burst(x, y, '#FF5C8A', 24);   px?.destroy();
// Pointer positions stay in screen pixels: the Pixi canvas covers the game canvas exactly.
export async function createPixiLayer(source, { glow = true } = {}) {
  if (new URLSearchParams(location.search).get('pixi') === 'off') return null; // (to compare with the plain canvas)
  let PIXI, F;
  try { [PIXI, F] = await Promise.all([import('pixi.js'), import('pixi-filters')]); } catch (err) { console.warn('No PixiJS:', err.message); return null; }
  try {
    const app = new PIXI.Application();
    const w = source.clientWidth || 1280, h = source.clientHeight || 720, dpr = Math.min(2, window.devicePixelRatio || 1);
    await app.init({ width: w, height: h, resolution: dpr, autoDensity: true, backgroundAlpha: 0, antialias: false, preference: 'webgl' });
    const canvas = app.canvas;
    canvas.className = 'game-canvas pixi-canvas';
    canvas.style.pointerEvents = 'none';
    source.after(canvas);
    source.style.opacity = '0'; // (still laid out and drawn: the game reads its size)

    const world = new PIXI.Container();
    app.stage.addChild(world);
    const texture = PIXI.Texture.from(source);
    const screen = new PIXI.Sprite(texture);
    world.addChild(screen);
    const fit = () => { const W = source.clientWidth, H = source.clientHeight; if (!W || !H) return; app.renderer.resize(W, H); screen.width = W; screen.height = H; };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(source);

    // Particles: soft additive dots from one shared little texture
    const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, '#fff'); g.addColorStop(0.45, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); return PIXI.Texture.from(c); })();
    const parts = [];
    const layer = new PIXI.Container();
    world.addChild(layer);

    // The game picture gets a touch more color
    screen.filters = [new F.AdjustmentFilter({ saturation: 1.1, contrast: 1.03 })];
    // (the sparks are big soft additive dots, so they glow without a bloom filter: a filter on this layer drew a pale box)

    app.ticker.add((tk) => {
      texture.source.update(); // the game's newest picture
      const dt = Math.min(0.05, tk.deltaMS / 1000);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { layer.removeChild(p.s); p.s.destroy(); parts.splice(i, 1); continue; }
        p.vy += 520 * dt;
        p.s.x += p.vx * dt; p.s.y += p.vy * dt;
        const k = p.life / p.total;
        p.s.alpha = Math.min(1, k * 1.6); p.s.scale.set(p.size * (0.4 + k * 0.6) / 32);
      }
    });

    return {
      burst(x, y, color = '#ffffff', count = 18, power = 1) {
        for (let i = 0; i < count && parts.length < 600; i++) {
          const a = Math.random() * Math.PI * 2, sp = (120 + Math.random() * 380) * power;
          const s = new PIXI.Sprite(dot);
          s.anchor.set(0.5); s.tint = color; s.blendMode = 'add'; s.position.set(x, y);
          layer.addChild(s);
          const life = 0.45 + Math.random() * 0.5;
          parts.push({ s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life, total: life, size: 10 + Math.random() * 26 });
        }
      },
      destroy() {
        ro.disconnect();
        source.style.opacity = '';
        app.destroy(true, { children: true, texture: true });
      },
    };
  } catch (err) {
    console.warn('PixiJS layer failed, using the plain canvas:', err.message);
    source.style.opacity = '';
    return null;
  }
}
