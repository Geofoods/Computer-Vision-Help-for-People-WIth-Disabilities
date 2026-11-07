// Landmarks the real hand model found in real photos (MediaPipe's public test images).
// These caught what synthetic hands didn't, so detection changes get checked against them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createDigitDetector, createMovementDetector, createPinchDetector, pinchRatio } from './tracking.js';

const hands = JSON.parse(readFileSync(new URL('./fixtures/real-hands.json', import.meta.url), 'utf8'));

function heldDigit(name) {
  const { landmarks, aspect } = hands[name];
  const detector = createDigitDetector();
  let armed = null;
  for (let frame = 0; frame < 8; frame += 1) ({ armed } = detector.update(landmarks, aspect));
  return armed;
}

const poseOf = (name) => createMovementDetector().update(hands[name].landmarks, { aspect: hands[name].aspect, now: 0 }).pose;

for (const [name, digit] of Object.entries({
  pointing: '1', pointingOther: '1', peace: '2', peaceOther: '2', openLeft: '5', openRight: '5', openAngled: '5',
})) {
  test(`a real ${name} hand reads as ${digit}`, () => assert.equal(heldDigit(name), digit));
}

for (const name of ['fist', 'thumbUp', 'thumbUpOther', 'thumbDown']) {
  test(`a real ${name} hand counts as closed, so it can type`, () => {
    const { landmarks, aspect } = hands[name];
    const open = hands.peace;
    const detector = createDigitDetector();
    for (let frame = 0; frame < 8; frame += 1) detector.update(open.landmarks, open.aspect);
    detector.update(landmarks, aspect);
    assert.equal(detector.update(landmarks, aspect).digit, '2');
  });
}

for (const name of ['pointing', 'pointingOther', 'peace', 'peaceOther']) {
  test(`a thumb resting on curled fingers in a real ${name} hand is not a thumb tap`, () => {
    assert.equal(poseOf(name), null);
  });
}

test('a real fist is recognised, even though its fingers are close enough to read as a pinch', () => {
  assert.equal(poseOf('fist'), 'fist');
  const { landmarks, aspect } = hands.fist;
  assert.ok(pinchRatio(landmarks, aspect) < 0.3);
});

test('real open hands are nowhere near a pinch', () => {
  const pinch = createPinchDetector({ holdFrames: 1 });
  for (const name of ['openLeft', 'openRight', 'pointing', 'peace']) {
    assert.equal(pinch.update(pinchRatio(hands[name].landmarks, hands[name].aspect)).pinching, false, name);
  }
});
