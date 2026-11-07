// A small model trained on the user's own hand, entirely on this device. MediaPipe finds
// the hand; this learns what each gesture looks like for the person using it, so someone
// who can't make a standard pattern can use one their hand is able to make.
//
// It's k-nearest-neighbours because it can learn from under a second of examples, needs
// no training step, and its distance gives a natural way to say "that's none of these".

const WRIST = 0;
const MIDDLE_KNUCKLE = 9;
const NEIGHBOURS = 3;
// How far, in palm lengths, any one point of a hand can be from an example and still match.
// On real photos, the same gesture on different people's hands measures up to 0.62, and
// different gestures from 0.68. One person's own hand varies less than that.
const MATCH_DISTANCE = 0.6;

export const GESTURE_CLOSED = 'closed';
export const SAMPLES_PER_TEACH = 20;
const MAX_SAMPLES_PER_LABEL = 40;

/**
 * Landmarks as a pose, regardless of where the hand is in the frame, how far it is from
 * the camera, or how it is tilted: centred on the wrist, scaled by the palm, and turned
 * so the palm points up.
 */
export function handFeatures(landmarks, aspect = 1) {
  const wrist = landmarks[WRIST];
  const dx = (landmarks[MIDDLE_KNUCKLE].x - wrist.x) * aspect;
  const dy = landmarks[MIDDLE_KNUCKLE].y - wrist.y;
  const palm = Math.hypot(dx, dy);
  if (palm === 0) return null;
  const ux = dx / palm;
  const uy = dy / palm;
  const features = [];
  for (let index = 1; index < landmarks.length; index += 1) {
    const x = (landmarks[index].x - wrist.x) * aspect;
    const y = landmarks[index].y - wrist.y;
    features.push(
      Math.round(((-uy * x + ux * y) / palm) * 1000) / 1000,
      Math.round(((-ux * x - uy * y) / palm) * 1000) / 1000,
    );
  }
  return features;
}

// The worst single point rather than an average, because one finger can be the whole
// difference between gestures. Averaged, a fist and a thumbs up look like the same pose.
function poseDistance(a, b, xSign) {
  let worst = 0;
  for (let index = 0; index < a.length; index += 2) {
    worst = Math.max(worst, Math.hypot(a[index] * xSign - b[index], a[index + 1] - b[index + 1]));
  }
  return worst;
}

/** `samples` maps a label to its examples. `classify` returns the best label, or null if nothing is close. */
export function createGestureModel(samples = {}) {
  const examples = Object.entries(samples).flatMap(([label, list]) => list.map((features) => ({ label, features })));

  return {
    classify(landmarks, aspect = 1) {
      if (examples.length === 0) return null;
      const features = handFeatures(landmarks, aspect);
      if (!features) return null;
      // Checking the mirror image too means a gesture taught on one hand works on the other.
      const nearest = examples
        .map(({ label, features: example }) => ({
          label,
          distance: Math.min(poseDistance(features, example, 1), poseDistance(features, example, -1)),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, NEIGHBOURS);
      if (nearest[0].distance > MATCH_DISTANCE) return null;
      const votes = {};
      nearest.forEach(({ label }) => { votes[label] = (votes[label] ?? 0) + 1; });
      return Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
    },
  };
}

/** Teaching a gesture again adds to it, keeping the most recent examples. */
export function addSamples(samples, label, features) {
  return { ...samples, [label]: [...(samples[label] ?? []), ...features].slice(-MAX_SAMPLES_PER_LABEL) };
}

export function forgetLabel(samples, label) {
  const { [label]: _forgotten, ...rest } = samples;
  return rest;
}
