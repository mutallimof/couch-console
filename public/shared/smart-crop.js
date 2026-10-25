// Smart crop for pictures that must fill a box (object-fit: cover): the box never shows the middle of nowhere and never cuts a face.
//   smartCover(root)  -> every <img data-smart> inside root gets an object-position that keeps the faces (or, with no face found,
//                        the upper-middle of the picture, where heads usually are) in the box.
// Faces come from the same MediaPipe model Photo Booth uses, in this browser, one picture at a time. If it is not available,
// only the upper-middle rule applies. Results are remembered (per picture address) for the session.
const FOCUS = new Map();      // src -> { x, y } in 0..1
let detector = null, tried = false;
const queue = [];
let busy = false;

async function getDetector() {
  if (detector || tried) return detector;
  tried = true;
  try {
    const probe = await fetch('/assets/models/face_landmarker.task', { method: 'HEAD' });
    if (!probe.ok) return null;
    const vision = await import('/vendor/mediapipe/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
    detector = await vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/assets/models/face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 6 });
  } catch { detector = null; }
  return detector;
}

const put = (img, f) => { img.style.objectPosition = `${Math.round(f.x * 100)}% ${Math.round(f.y * 100)}%`; };
const rule = (img) => ({ x: 0.5, y: img.naturalHeight > img.naturalWidth * 1.1 ? 0.28 : 0.4 }); // portraits: heads are near the top

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const img = queue.shift();
    if (!img.isConnected || FOCUS.has(img.currentSrc || img.src)) { if (FOCUS.has(img.currentSrc || img.src)) put(img, FOCUS.get(img.currentSrc || img.src)); continue; }
    const key = img.currentSrc || img.src;
    let f = rule(img);
    const d = await getDetector();
    if (d) {
      try {
        const faces = d.detect(img).faceLandmarks || [];
        if (faces.length) {
          let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
          for (const lm of faces) for (const p of lm) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
          f = { x: (x0 + x1) / 2, y: y0 + (y1 - y0) * 0.45 }; // (eye level of the group)
        }
      } catch { /* keep the rule */ }
    }
    FOCUS.set(key, f);
    if (img.isConnected) put(img, f);
    await new Promise((r) => setTimeout(r, 30)); // (let the page breathe between pictures)
  }
  busy = false;
}

export function smartCover(root = document, { faces = true } = {}) {
  for (const img of root.querySelectorAll('img[data-smart]')) {
    if (img.dataset.smartDone) continue;
    img.dataset.smartDone = '1';
    const go = () => { put(img, FOCUS.get(img.currentSrc || img.src) || rule(img)); if (faces) { queue.push(img); pump(); } };
    if (img.complete && img.naturalWidth) go(); else img.addEventListener('load', go, { once: true });
  }
}
