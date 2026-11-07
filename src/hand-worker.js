import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// Runs hand and face detection off the UI thread so the page stays responsive. This file is
// bundled to public/hand-worker.js (see scripts/build-worker.mjs), so both URLs resolve
// next to it to the copies in public/, and the app works offline.
const MODEL_URL = new URL('models/hand_landmarker.task', self.location.href).toString();
const FACE_MODEL_URL = new URL('models/face_landmarker.task', self.location.href).toString();
const WASM_URL = new URL('wasm', self.location.href).toString();
// The face only drives tongue gestures, which last far longer than a frame, so checking
// less often leaves more of each frame's time for the hand that moves the cursor.
const FACE_FRAME_INTERVAL = 3;
let detector;
let faceDetector;
let frameCount = 0;

// MediaPipe's loader can fail with a rejected promise nobody awaits, which would leave
// the page waiting forever. Report it instead.
self.addEventListener('unhandledrejection', (event) => {
  self.postMessage({ type: 'error', message: String(event.reason?.message ?? event.reason) });
});

const vision = () => FilesetResolver.forVisionTasks(WASM_URL);

async function createFaceDetector() {
  const fileset = await vision();
  const create = (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
      runningMode: 'VIDEO',
      outputFaceBlendshapes: true,
      numFaces: 1,
    });
  try {
    return await create('GPU');
  } catch (gpuError) {
    console.warn('GPU face tracking is unavailable, using the CPU instead.', gpuError);
    return create('CPU');
  }
}

async function createDetector() {
  const fileset = await vision();
  const create = (delegate) =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
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
      return;
    }
    // Loaded after the hand is ready, so a face model problem can't cost anyone the cursor.
    try {
      faceDetector = await createFaceDetector();
    } catch (error) {
      console.error(error);
      self.postMessage({ type: 'face-unavailable' });
    }
    return;
  }

  if (type === 'frame' && detector) {
    const { bitmap, timestamp } = event.data;
    let landmarks = null;
    let hands = [];
    let face;
    try {
      const result = detector.detectForVideo(bitmap, timestamp);
      hands = (result.landmarks ?? []).map((hand, index) => ({
        landmarks: hand,
        handedness: result.handednesses?.[index]?.[0]?.categoryName ?? null,
      }));
      landmarks = hands[0]?.landmarks ?? null;
      frameCount += 1;
      if (faceDetector && frameCount % FACE_FRAME_INTERVAL === 0) {
        const result = faceDetector.detectForVideo(bitmap, timestamp);
        face = {
          landmarks: result.faceLandmarks?.[0] ?? null,
          blendshapes: result.faceBlendshapes?.[0]?.categories ?? [],
        };
      }
    } catch (error) {
      console.error(error);
    } finally {
      bitmap.close();
    }
    // Always reply, even after a failure, so the page never waits forever on a frame.
    self.postMessage({ type: 'result', landmarks, hands, face });
  }
};
