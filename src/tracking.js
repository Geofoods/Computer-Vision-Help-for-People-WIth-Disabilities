// Pure hand-tracking logic, kept free of React and the DOM so it can be unit tested.

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_KNUCKLE = 5;
const INDEX_TIP = 8;
const MIDDLE_KNUCKLE = 9;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
// [middle joint, fingertip] of each finger, used to tell whether it is curled.
const FINGERS = [[6, 8], [10, 12], [14, 16], [18, 20]];
const TAP_TIPS = { middleTap: MIDDLE_TIP, ringTap: RING_TIP };
const RELEASE_MARGIN = 0.15;

// Part of the camera frame that maps to the whole screen. A hand can't comfortably
// reach the edge of the frame, so without this the screen corners would be unreachable.
export const REACH_ZONE = { left: 0.2, right: 0.8, top: 0.2, bottom: 0.8 };

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const distance = (a, b, aspect) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
const pressThreshold = (sensitivity) => 0.3 + (sensitivity - 50) * 0.003;

function thumbGap(landmarks, tip, aspect) {
  const palm = distance(landmarks[WRIST], landmarks[MIDDLE_KNUCKLE], aspect);
  if (palm === 0) return Infinity;
  return distance(landmarks[THUMB_TIP], landmarks[tip], aspect) / palm;
}

/**
 * Thumb-to-index gap as a fraction of palm length. Dividing by the palm makes the
 * result independent of how far the hand is from the camera, and `aspect` corrects
 * for landmark x and y being normalised to different frame dimensions.
 */
export function pinchRatio(landmarks, aspect = 1) {
  return thumbGap(landmarks, INDEX_TIP, aspect);
}

/** A finger is curled when its tip is closer to the wrist than its middle joint. */
function isFist(landmarks, aspect) {
  const wrist = landmarks[WRIST];
  return FINGERS.every(([joint, tip]) => distance(landmarks[tip], wrist, aspect) < distance(landmarks[joint], wrist, aspect));
}

function detectPose(landmarks, aspect, press) {
  if (isFist(landmarks, aspect)) return 'fist';
  const index = thumbGap(landmarks, INDEX_TIP, aspect);
  const middle = thumbGap(landmarks, MIDDLE_TIP, aspect);
  const ring = thumbGap(landmarks, RING_TIP, aspect);
  const closest = Math.min(index, middle, ring);
  if (closest >= press || closest === index) return null;
  return closest === middle ? 'middleTap' : 'ringTap';
}

/**
 * Recognises the bindable movements. `movement` is set on the one frame a movement
 * fires. `pose` is the hand shape being made right now, even before it fires, so the
 * caller can keep a thumb tap or a fist from also counting as an index pinch.
 */
export function createMovementDetector({ holdFrames = 3, cooldownMs = 800, swipeWindowMs = 350, swipeDistance = 1.5 } = {}) {
  let trail = [];
  let held = null;
  let candidate = null;
  let candidateFrames = 0;
  let cooldownUntil = -Infinity;

  const fire = (movement, now) => {
    if (now < cooldownUntil) return null;
    cooldownUntil = now + cooldownMs;
    return movement;
  };

  function updatePose(pose, landmarks, aspect, press, now) {
    if (held) {
      const stillHeld = held === 'fist' ? pose === 'fist' : thumbGap(landmarks, TAP_TIPS[held], aspect) < press + RELEASE_MARGIN;
      if (stillHeld) return null;
      held = null;
    }
    candidateFrames = pose && pose === candidate ? candidateFrames + 1 : 1;
    candidate = pose;
    if (!pose || candidateFrames < holdFrames) return null;
    held = pose;
    candidate = null;
    return fire(pose, now);
  }

  function updateSwipe(landmarks, aspect, now) {
    const wrist = landmarks[WRIST];
    const knuckle = landmarks[MIDDLE_KNUCKLE];
    // Mirrored like the cursor, so a swipe right moves toward the right of the screen.
    const sample = {
      x: (1 - (wrist.x + knuckle.x) / 2) * aspect,
      y: (wrist.y + knuckle.y) / 2,
      palm: distance(wrist, knuckle, aspect),
      now,
    };
    trail = trail.filter((point) => now - point.now <= swipeWindowMs);
    trail.push(sample);
    if (trail.length < 3) return null;

    const start = trail[0];
    const dx = sample.x - start.x;
    const dy = sample.y - start.y;
    const across = Math.abs(dx);
    const along = Math.abs(dy);
    // The larger palm is used because a hand tilting mid-swipe looks foreshortened.
    if (Math.max(across, along) / Math.max(sample.palm, start.palm) < swipeDistance) return null;
    if (Math.max(across, along) < 2 * Math.min(across, along)) return null;
    if (across > along) return dx > 0 ? 'swipeRight' : 'swipeLeft';
    return dy > 0 ? 'swipeDown' : 'swipeUp';
  }

  return {
    update(landmarks, { aspect = 1, now, sensitivity = 50 }) {
      const press = pressThreshold(sensitivity);
      const pose = detectPose(landmarks, aspect, press);
      let movement = updatePose(pose, landmarks, aspect, press, now);
      const activePose = held ?? pose;
      // The trail restarts after a cooldown, so bringing the hand back from a swipe
      // doesn't read as a swipe the other way.
      if (activePose || now < cooldownUntil) {
        trail = [];
      } else {
        const swipe = updateSwipe(landmarks, aspect, now);
        if (swipe) {
          movement = fire(swipe, now);
          trail = [];
        }
      }
      return { movement, pose: activePose };
    },
    reset() {
      trail = [];
      held = null;
      candidate = null;
      candidateFrames = 0;
    },
  };
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
      const press = pressThreshold(sensitivity);
      const release = press + RELEASE_MARGIN;
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
