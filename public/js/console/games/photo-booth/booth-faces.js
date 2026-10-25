// Face tracking for Photo Booth: MediaPipe Face Landmarker (Google, Apache-2.0), running in this browser. Nothing leaves the
// laptop: the model file and the WebAssembly come from this server (/vendor/mediapipe and /assets/models), the pictures
// are never sent anywhere. Up to 4 faces. If anything fails (no model file, no WebAssembly, an old browser) createFaceTracker
// resolves to null and Photo Booth simply works without stickers (frames only).
const BASE = '/vendor/mediapipe';
const MODEL = '/assets/models/face_landmarker.task';

export async function createFaceTracker({ base = BASE, model = MODEL, faces = 4 } = {}) {
  try {
    const probe = await fetch(model, { method: 'HEAD' });
    if (!probe.ok) throw new Error(`no model file at ${model}`);
    const vision = await import(`${base}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
    const make = (delegate) => vision.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate }, runningMode: 'VIDEO', numFaces: faces });
    let landmarker;
    try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); } // (no GPU access: the CPU is fine for a few faces)
    let lastTime = -1;
    return {
      // The faces in this video frame: an array of landmark lists (each [{ x, y, z }] in 0..1)
      detect(video, nowMs) {
        if (video.readyState < 2) return [];
        const t = Math.max(nowMs, lastTime + 1); // (MediaPipe wants strictly rising times)
        lastTime = t;
        return landmarker.detectForVideo(video, t).faceLandmarks || [];
      },
      close() { landmarker.close(); },
    };
  } catch (err) {
    console.warn('Photo Booth: face tracking is off:', err.message || err);
    return null;
  }
}
