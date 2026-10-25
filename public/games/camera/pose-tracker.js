// Body tracking for Mirror Match and Party Workout: MediaPipe Pose Landmarker (Google, Apache-2.0), running in this browser. Nothing
// leaves the laptop: the model file and the WebAssembly come from this server (/vendor/mediapipe and /assets/models), and no picture is
// ever sent or saved. Up to 4 people. If anything fails (no model file, no WebAssembly, an old browser) createPoseTracker resolves to
// null and the game says so in plain words.
const BASE = '/vendor/mediapipe';
const MODEL = '/assets/models/pose_landmarker_lite.task';

export async function createPoseTracker({ base = BASE, model = MODEL, people = 4 } = {}) {
  try {
    const probe = await fetch(model, { method: 'HEAD' });
    if (!probe.ok) throw new Error(`no model file at ${model}`);
    const vision = await import(`${base}/vision_bundle.mjs`);
    const files = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
    const make = (delegate) => vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate }, runningMode: 'VIDEO', numPoses: people });
    let landmarker;
    try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); } // (no GPU access: the CPU is fine for a few people)
    let lastTime = -1;
    return {
      // The people in this video frame: an array of landmark lists (33 each: { x, y, z, visibility } in 0..1)
      detect(video, nowMs) {
        if (video.readyState < 2) return [];
        const t = Math.max(nowMs, lastTime + 1); // (MediaPipe wants strictly rising times)
        lastTime = t;
        return landmarker.detectForVideo(video, t).landmarks || [];
      },
      close() { landmarker.close(); },
    };
  } catch (err) {
    console.warn('Camera games: body tracking is off:', err.message || err);
    return null;
  }
}
