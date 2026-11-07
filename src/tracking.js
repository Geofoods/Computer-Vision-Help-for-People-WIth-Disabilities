// Pure hand-tracking logic, kept free of React and the DOM so it can be unit tested.

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 5;
const INDEX_TIP = 8;
const MIDDLE_KNUCKLE = 9;

// Part of the camera frame that maps to the whole screen. A hand can't comfortably
// reach the edge of the frame, so without this the screen corners would be unreachable.
export const REACH_ZONE = { left: 0.2, right: 0.8, top: 0.2, bottom: 0.8 };

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Thumb-to-index gap as a fraction of palm length. Dividing by the palm makes the
 * result independent of how far the hand is from the camera, and `aspect` corrects
 * for landmark x and y being normalised to different frame dimensions.
 */
export function pinchRatio(landmarks, aspect = 1) {
  const distance = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const palm = distance(landmarks[WRIST], landmarks[MIDDLE_KNUCKLE]);
  if (palm === 0) return Infinity;
  return distance(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / palm;
}

/**
 * The point that drives the cursor, mirrored so moving right goes right. The index
 * knuckle barely moves during a pinch, unlike the fingertip, so the cursor stays on
 * target at the moment of the click.
 */
export function cursorPoint(landmarks) {
  const knuckle = landmarks[INDEX_KNUCKLE];
  return { x: 1 - knuckle.x, y: knuckle.y };
}

/** Maps a mirrored camera point to a 0-1 screen position through the reach zone. */
export function toScreen({ x, y }) {
  return {
    x: clamp01((x - REACH_ZONE.left) / (REACH_ZONE.right - REACH_ZONE.left)),
    y: clamp01((y - REACH_ZONE.top) / (REACH_ZONE.bottom - REACH_ZONE.top)),
  };
}

/**
 * Pinch state machine. The release threshold sits above the press threshold so a
 * hand hovering near the boundary can't fire repeated clicks, and a press must last
 * `holdFrames` frames so a single-frame tracking glitch doesn't click anything.
 */
export function createPinchDetector({ holdFrames = 2 } = {}) {
  let pinching = false;
  let heldFrames = 0;

  return {
    update(ratio, sensitivity = 50) {
      const press = 0.3 + (sensitivity - 50) * 0.003;
      const release = press + 0.15;
      let justPinched = false;

      if (pinching) {
        if (ratio > release) {
          pinching = false;
          heldFrames = 0;
        }
      } else if (ratio < press) {
        heldFrames += 1;
        if (heldFrames >= holdFrames) {
          pinching = true;
          justPinched = true;
        }
      } else {
        heldFrames = 0;
      }

      return { pinching, justPinched };
    },
    reset() {
      pinching = false;
      heldFrames = 0;
    },
  };
}

/**
 * One Euro filter: smooths heavily when the hand is nearly still, which removes
 * jitter, and lightly when it moves fast, which avoids lag.
 */
export function createOneEuroFilter({ minCutoff = 1.2, beta = 0.05, derivativeCutoff = 1 } = {}) {
  const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  let previous = null;

  return {
    filter(value, timeMs) {
      if (!previous || timeMs <= previous.timeMs) {
        previous = { value, derivative: 0, timeMs };
        return value;
      }
      const dt = (timeMs - previous.timeMs) / 1000;
      const rawDerivative = (value - previous.value) / dt;
      const derivativeAlpha = alpha(derivativeCutoff, dt);
      const derivative = derivativeAlpha * rawDerivative + (1 - derivativeAlpha) * previous.derivative;
      const valueAlpha = alpha(minCutoff + beta * Math.abs(derivative), dt);
      const smoothed = valueAlpha * value + (1 - valueAlpha) * previous.value;
      previous = { value: smoothed, derivative, timeMs };
      return smoothed;
    },
    reset() {
      previous = null;
    },
  };
}
