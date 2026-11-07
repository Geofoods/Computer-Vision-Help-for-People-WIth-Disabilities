import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// Runs hand detection off the UI thread so the page stays responsive. This file is
// bundled to public/hand-worker.js (see scripts/build-worker.mjs), so both URLs resolve
// next to it to the copies in public/, and the app works offline.
const MODEL_URL = new URL('models/hand_landmarker.task', self.location.href).toString();
const WASM_URL = new URL('wasm', self.location.href).toString();
let detector;

// MediaPipe's loader can fail with a rejected promise nobody awaits, which would leave
// the page waiting forever. Report it instead.
self.addEventListener('unhandledrejection', (event) => {
  self.postMessage({ type: 'error', message: String(event.reason?.message ?? event.reason) });
});

async function createDetector() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  const create = (delegate) =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });
  try {
    return await create('GPU');
  } catch (gpuError) {
    console.warn('GPU hand tracking is unavailable, using the CPU instead.', gpuError);
    return create('CPU');
  }
}

self.onmessage = async (event) => {
  const { type } = event.data;
  if (type === 'init') {
    try {
      detector = await createDetector();
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: error.message });
    }
    return;
  }

  if (type === 'frame' && detector) {
    const { bitmap, timestamp } = event.data;
    let landmarks = null;
    try {
      landmarks = detector.detectForVideo(bitmap, timestamp).landmarks?.[0] ?? null;
    } catch (error) {
      console.error(error);
    } finally {
      bitmap.close();
    }
    // Always reply, even after a failure, so the page never waits forever on a frame.
    self.postMessage({ type: 'result', landmarks });
  }
};
