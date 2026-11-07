import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_URL = new URL('../wasm', import.meta.url).toString();
let detector;

self.onmessage = async (event) => {
  const { type } = event.data;
  if (type === 'init') {
    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      detector = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: error.message });
    }
    return;
  }

  if (type === 'frame' && detector) {
    const { bitmap, timestamp } = event.data;
    const result = detector.detectForVideo(bitmap, timestamp);
    bitmap.close();
    self.postMessage({ type: 'result', landmarks: result.landmarks?.[0] || null });
  }
};
