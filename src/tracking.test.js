import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DIGIT_CHART, createDigitDetector, createOneEuroFilter, createPinchDetector, cursorPoint, isLicking, pinchRatio, toScreen } from './tracking.js';

function hand({ scale = 1, gap = 0.5 } = {}) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  landmarks[0] = { x: 0.5, y: 0.5 + 0.2 * scale };
  landmarks[9] = { x: 0.5, y: 0.5 };
  landmarks[4] = { x: 0.5, y: 0.3 };
  landmarks[8] = { x: 0.5 + gap * 0.2 * scale, y: 0.3 };
  landmarks[5] = { x: 0.3, y: 0.4 };
  return landmarks;
}

test('pinchRatio does not change with distance from the camera', () => {
  const near = pinchRatio(hand({ scale: 1.5, gap: 0.2 }));
  const far = pinchRatio(hand({ scale: 0.5, gap: 0.2 }));
  assert.ok(Math.abs(near - far) < 1e-9);
});

test('pinchRatio corrects for a widescreen frame', () => {
  const landmarks = hand({ gap: 0.5 });
  assert.ok(Math.abs(pinchRatio(landmarks, 16 / 9) - (0.5 * 16) / 9) < 1e-9);
});

test('a one-frame tracking glitch does not click', () => {
  const detector = createPinchDetector();
  assert.equal(detector.update(0.1).justPinched, false);
  assert.equal(detector.update(0.9).pinching, false);
  assert.equal(detector.update(0.1).justPinched, false);
});

test('a held pinch clicks exactly once', () => {
  const detector = createPinchDetector();
  const clicks = [0.1, 0.1, 0.1, 0.1, 0.1].filter((ratio) => detector.update(ratio).justPinched);
  assert.equal(clicks.length, 1);
});

test('hovering between the thresholds neither releases nor clicks again', () => {
  const detector = createPinchDetector();
  detector.update(0.1);
  detector.update(0.1);
  for (const ratio of [0.35, 0.4, 0.35, 0.4]) {
    const { pinching, justPinched } = detector.update(ratio);
    assert.equal(pinching, true);
    assert.equal(justPinched, false);
  }
});

test('a pinch can fire again after a full release', () => {
  const detector = createPinchDetector();
  detector.update(0.1);
  assert.equal(detector.update(0.1).justPinched, true);
  assert.equal(detector.update(0.9).pinching, false);
  detector.update(0.1);
  assert.equal(detector.update(0.1).justPinched, true);
});

test('higher sensitivity triggers on a wider gap', () => {
  const low = createPinchDetector({ holdFrames: 1 });
  const high = createPinchDetector({ holdFrames: 1 });
  assert.equal(low.update(0.33, 20).pinching, false);
  assert.equal(high.update(0.33, 80).pinching, true);
});

test('isLicking needs a tongue or the matching mouth shape', () => {
  const shapes = (scores) => Object.entries(scores).map(([categoryName, score]) => ({ categoryName, score }));
  assert.equal(isLicking([]), false);
  assert.equal(isLicking(shapes({ tongueOut: 0.5 })), true);
  assert.equal(isLicking(shapes({ jawOpen: 0.6, mouthPucker: 0.2 })), true);
  assert.equal(isLicking(shapes({ jawOpen: 0.6 })), false);
  assert.equal(isLicking(shapes({ tongueOut: 0.1, mouthPucker: 0.5 })), false);
});

// A hand raising exactly the named fingers: T, I, M, R, P.
function fingers(raised) {
  const x = 0.5;
  const y = 0.5;
  const landmarks = Array.from({ length: 21 }, () => ({ x, y }));
  landmarks[0] = { x, y: y + 0.2 };
  landmarks[9] = { x, y };
  landmarks[17] = { x: x + 0.08, y: y + 0.02 };
  landmarks[3] = { x: x - 0.08, y: y + 0.1 };
  landmarks[4] = raised.includes('T') ? { x: x - 0.2, y: y + 0.05 } : { x: x - 0.02, y: y + 0.08 };
  [['I', 6, 8, -0.06], ['M', 10, 12, -0.02], ['R', 14, 16, 0.02], ['P', 18, 20, 0.06]].forEach(([name, joint, tip, offset]) => {
    landmarks[joint] = { x: x + offset, y: y - 0.08 };
    landmarks[tip] = { x: x + offset, y: raised.includes(name) ? y - 0.18 : y - 0.02 };
  });
  return landmarks;
}

// Feeds each [pattern, frames] pair and returns everything typed.
function typeWith(detector, ...steps) {
  return steps.flatMap(([pattern, frames]) => Array.from({ length: frames }, () => detector.update(fingers(pattern)).digit)).filter((digit) => digit !== null);
}

test('every digit types from its pattern when the hand closes', () => {
  for (const { digit, fingers: pattern } of DIGIT_CHART) {
    assert.deepEqual(typeWith(createDigitDetector(), [pattern, 8], ['', 3]), [digit], pattern);
  }
});

test('a digit types once however long the hand stays closed', () => {
  assert.deepEqual(typeWith(createDigitDetector(), ['IM', 8], ['', 30]), ['2']);
});

test('the same digit can be typed twice by raising the fingers again', () => {
  assert.deepEqual(typeWith(createDigitDetector(), ['IM', 8], ['', 3], ['IM', 8], ['', 3]), ['2', '2']);
});

test('closing a hand that held nothing long enough types nothing', () => {
  assert.deepEqual(typeWith(createDigitDetector(), ['IM', 3], ['', 5]), []);
});

test('fingers passing through other patterns on the way down keep the held digit', () => {
  assert.deepEqual(typeWith(createDigitDetector(), ['IMR', 8], ['IM', 2], ['I', 2], ['', 3]), ['3']);
});

test('changing to another held pattern replaces the digit', () => {
  assert.deepEqual(typeWith(createDigitDetector(), ['IM', 8], ['IMR', 8], ['', 3]), ['3']);
});

test('a one-frame closed reading does not type', () => {
  assert.deepEqual(typeWith(createDigitDetector(), ['IM', 8], ['', 1], ['IM', 1]), []);
});

test('reset forgets the held digit', () => {
  const detector = createDigitDetector();
  typeWith(detector, ['IM', 8]);
  detector.reset();
  assert.deepEqual(typeWith(detector, ['', 3]), []);
});

test('cursorPoint is mirrored', () => {
  assert.deepEqual(cursorPoint(hand()), { x: 0.7, y: 0.4 });
});

test('toScreen maps the reach zone onto the full screen and clamps outside it', () => {
  assert.deepEqual(toScreen({ x: 0.2, y: 0.2 }), { x: 0, y: 0 });
  assert.deepEqual(toScreen({ x: 0.8, y: 0.8 }), { x: 1, y: 1 });
  assert.deepEqual(toScreen({ x: 0, y: 1 }), { x: 0, y: 1 });
  assert.ok(Math.abs(toScreen({ x: 0.5, y: 0.5 }).x - 0.5) < 1e-9);
});

test('the filter reduces jitter while the hand is still', () => {
  const filter = createOneEuroFilter();
  let raw = 0;
  let smoothed = 0;
  let previous = filter.filter(0.5, 0);
  for (let frame = 1; frame <= 60; frame += 1) {
    const value = 0.5 + (frame % 2 ? 0.01 : -0.01);
    const output = filter.filter(value, frame * 33);
    raw += 0.02;
    smoothed += Math.abs(output - previous);
    previous = output;
  }
  assert.ok(smoothed < raw / 2, `smoothed ${smoothed} vs raw ${raw}`);
});

test('the filter catches up with a fast move', () => {
  const filter = createOneEuroFilter();
  let output = filter.filter(0, 0);
  for (let frame = 1; frame <= 15; frame += 1) output = filter.filter(0.8, frame * 33);
  assert.ok(output > 0.7, `output ${output}`);
});
