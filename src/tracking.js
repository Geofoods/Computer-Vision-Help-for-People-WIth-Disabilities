// Pure hand-tracking logic, kept free of React and the DOM so it can be unit tested.
import { GESTURE_CLOSED } from './gesture-model.js';

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
// A thumb resting on a finger curled into the palm isn't a tap. On real photos curled
// fingers measure up to 0.75, so this leaves room for a finger bent to meet the thumb.
const TAP_FINGER_OPEN = 0.85;

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

/** How far a fingertip is from the wrist compared with its middle joint: under 1 means curled. */
function fingerExtension(landmarks, [joint, tip], aspect) {
  const wrist = landmarks[WRIST];
  return distance(landmarks[tip], wrist, aspect) / distance(landmarks[joint], wrist, aspect);
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
  const tapped = closest === middle ? 'middleTap' : 'ringTap';
  const finger = closest === middle ? FINGERS[1] : FINGERS[2];
  return fingerExtension(landmarks, finger, aspect) >= TAP_FINGER_OPEN ? tapped : null;
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
export function toScreen({ x, y }, zone = REACH_ZONE) {
  return {
    x: clamp01((x - zone.left) / (zone.right - zone.left)),
    y: clamp01((y - zone.top) / (zone.bottom - zone.top)),
  };
}

/**
 * The reach zone for the points a person's hand covered, or null if they barely moved.
 * The edges come in slightly, so the screen's corners don't take a full stretch to reach.
 */
export function computeReachZone(points, { minSpan = 0.08, margin = 0.1 } = {}) {
  if (points.length === 0) return null;
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (right - left < minSpan || bottom - top < minSpan) return null;
  const insetX = (right - left) * margin;
  const insetY = (bottom - top) * margin;
  return { left: left + insetX, right: right - insetX, top: top + insetY, bottom: bottom - insetY };
}

/** Whether face blendshapes show a tongue gesture. A mouth shape counts too, since tongueOut alone is unreliable. */
export function isLicking(blendshapes) {
  const score = (name) => blendshapes.find(({ categoryName }) => categoryName === name)?.score ?? 0;
  return score('tongueOut') > 0.2 || (score('jawOpen') > 0.35 && score('mouthPucker') > 0.08);
}

/**
 * Which way the person is tilting their own head once the eye line passes a safe angle.
 * The camera image isn't mirrored here, so their right eye (33) is on the image's left,
 * and tilting toward their right shoulder lowers it.
 */
export function headTilt(landmarks, threshold = 0.2) {
  const leftEye = landmarks?.[33];
  const rightEye = landmarks?.[263];
  if (!leftEye || !rightEye) return null;
  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  if (angle > threshold) return 'headTiltLeft';
  if (angle < -threshold) return 'headTiltRight';
  return null;
}

/** Returns the vertical head direction, normalized by eye distance. */
export function headPitch(landmarks, threshold = 0.35) {
  const leftEye = landmarks?.[33];
  const rightEye = landmarks?.[263];
  const nose = landmarks?.[1];
  if (!leftEye || !rightEye || !nose) return null;
  const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (!eyeDistance) return null;
  const offset = (nose.y - (leftEye.y + rightEye.y) / 2) / eyeDistance;
  if (offset < -threshold) return 'headTiltUp';
  if (offset > threshold) return 'headTiltDown';
  return null;
}

function blendshapeScore(blendshapes, name) {
  return blendshapes?.find(({ categoryName }) => categoryName === name)?.score ?? 0;
}

export function faceGestures(blendshapes) {
  const leftBlink = blendshapeScore(blendshapes, 'eyeBlinkLeft');
  const rightBlink = blendshapeScore(blendshapes, 'eyeBlinkRight');
  return {
    blink: leftBlink > 0.55 && rightBlink > 0.55,
    winkLeft: leftBlink > 0.6 && rightBlink < 0.35,
    winkRight: rightBlink > 0.6 && leftBlink < 0.35,
    kiss: blendshapeScore(blendshapes, 'mouthPucker') > 0.55,
    cheekPuff: blendshapeScore(blendshapes, 'cheekPuff') > 0.45,
    mouthOpen: blendshapeScore(blendshapes, 'jawOpen') > 0.6,
  };
}

export function createFaceGestureDetector() {
  const previous = {};
  return {
    update(blendshapes) {
      const active = faceGestures(blendshapes);
      const fired = Object.entries(active)
        .filter(([id, isActive]) => isActive && !previous[id])
        .map(([id]) => id);
      Object.assign(previous, active);
      return fired;
    },
    reset() {
      for (const id of Object.keys(previous)) previous[id] = false;
    },
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
 * Fires once when something stays true for `holdMs`, and not again until it stops. Used
 * where a brief match could happen by chance, such as fingers passing while they close.
 */
export const HOLD_MS = 500;

export function createHoldDetector({ holdMs = HOLD_MS } = {}) {
  let since = null;
  let fired = false;

  return {
    update(active, now) {
      if (!active) {
        since = null;
        fired = false;
        return false;
      }
      since ??= now;
      if (fired || now - since < holdMs) return false;
      fired = true;
      return true;
    },
    /** True while a hold is under way and hasn't fired yet, so it can be shown filling up. */
    isHolding() {
      return since !== null && !fired;
    },
    reset() {
      since = null;
      fired = false;
    },
  };
}

// Each digit's raised fingers: T(humb), I(ndex), M(iddle), R(ing), P(inky).
export const DIGIT_CHART = [
  { digit: '1', fingers: 'I', label: 'Index' },
  { digit: '2', fingers: 'IM', label: 'Index, middle' },
  { digit: '3', fingers: 'IMR', label: 'Index, middle, ring' },
  { digit: '4', fingers: 'IMRP', label: 'All four fingers, thumb tucked' },
  { digit: '5', fingers: 'TIMRP', label: 'Open hand' },
  { digit: '6', fingers: 'TI', label: 'Thumb, index' },
  { digit: '7', fingers: 'TIM', label: 'Thumb, index, middle' },
  { digit: '8', fingers: 'TIMR', label: 'Thumb, index, middle, ring' },
  { digit: '9', fingers: 'TP', label: 'Thumb, pinky' },
  { digit: '0', fingers: 'P', label: 'Pinky' },
];
const DIGIT_BY_FINGERS = Object.fromEntries(DIGIT_CHART.map(({ digit, fingers }) => [fingers, digit]));
const PINKY_KNUCKLE = 17;
const THUMB_JOINT = 3;
// Between these, a finger is half bent and the frame says nothing about it.
const FINGER_RAISED = 1.1;
// Measured on real photos: tucked or resting thumbs reach 1.01 and raised ones start at 1.07.
const THUMB_RAISED = 1.04;

/** 'closed' for four curled fingers, a string like 'IM' for a clear pattern, or null mid-movement. */
function readFingers(landmarks, aspect) {
  const wrist = landmarks[WRIST];
  const ratios = FINGERS.map(([joint, tip]) => distance(landmarks[tip], wrist, aspect) / distance(landmarks[joint], wrist, aspect));
  if (ratios.every((ratio) => ratio < 1)) return 'closed';
  if (ratios.some((ratio) => ratio >= 1 && ratio < FINGER_RAISED)) return null;
  const pinkyBase = landmarks[PINKY_KNUCKLE];
  const thumbRaised = distance(landmarks[THUMB_TIP], pinkyBase, aspect) > distance(landmarks[THUMB_JOINT], pinkyBase, aspect) * THUMB_RAISED;
  return (thumbRaised ? 'T' : '') + ['I', 'M', 'R', 'P'].filter((_, finger) => ratios[finger] >= FINGER_RAISED).join('');
}

/**
 * Finger typing: a pattern held for `holdFrames` becomes the armed digit, and closing
 * the hand types it. The hold keeps the patterns passed through while fingers curl at
 * different speeds from replacing the digit the person meant.
 */
export function createDigitDetector({ holdFrames = 6, closedFrames = 2 } = {}) {
  let armed = null;
  let candidate = null;
  let candidateCount = 0;
  let closedCount = 0;

  return {
    // `model` holds gestures the person taught, which take priority over the standard patterns.
    update(landmarks, aspect = 1, model = null) {
      const taught = model?.classify(landmarks, aspect) ?? null;
      // A taught shape is judged only by what it was taught as, whatever its fingers look like.
      const reading = taught === GESTURE_CLOSED ? 'closed' : taught ? null : readFingers(landmarks, aspect);
      if (reading === 'closed') {
        candidate = null;
        candidateCount = 0;
        closedCount += 1;
        if (closedCount < closedFrames) return { digit: null, armed };
        const digit = armed;
        armed = null;
        return { digit, armed };
      }
      closedCount = 0;
      const seen = taught ?? DIGIT_BY_FINGERS[reading] ?? null;
      candidateCount = seen !== null && seen === candidate ? candidateCount + 1 : 1;
      candidate = seen;
      if (seen !== null && candidateCount >= holdFrames) armed = seen;
      return { digit: null, armed };
    },
    reset() {
      armed = null;
      candidate = null;
      candidateCount = 0;
      closedCount = 0;
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
