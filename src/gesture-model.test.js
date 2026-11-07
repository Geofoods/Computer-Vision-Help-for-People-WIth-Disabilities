import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GESTURE_CLOSED, addSamples, createGestureModel, forgetLabel, handFeatures } from './gesture-model.js';
import { REACH_ZONE, computeReachZone, createDigitDetector, toScreen } from './tracking.js';
import { loadAutoStart, loadControlToggle, loadGestureSamples, loadReachZone, loadScrollSensitivity, saveGestureSamples, saveReachZone, saveScrollSensitivity } from './preferences.js';

const hands = JSON.parse(readFileSync(new URL('./fixtures/real-hands.json', import.meta.url), 'utf8'));

const hand = (name) => hands[name];
// The same hand on a later frame: slightly moved, and with a little tracking noise.
function jittered({ landmarks, aspect }, seed = 1) {
  let value = seed;
  const noise = () => {
    value = (value * 9301 + 49297) % 233280;
    return (value / 233280 - 0.5) * 0.006;
  };
  return { aspect, landmarks: landmarks.map(({ x, y }) => ({ x: x + 0.03 + noise(), y: y - 0.02 + noise() })) };
}
const examples = (entry, count = 20) => Array.from({ length: count }, (_, seed) => {
  const { landmarks, aspect } = jittered(entry, seed + 1);
  return handFeatures(landmarks, aspect);
});
const classify = (model, { landmarks, aspect }) => model.classify(landmarks, aspect);

function memoryStorage(initial = {}) {
  const values = { ...initial };
  return { getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = value; } };
}

test('features ignore where the hand is and how far away it is', () => {
  const { landmarks, aspect } = hand('peace');
  const moved = landmarks.map(({ x, y }) => ({ x: x + 0.1, y: y - 0.05 }));
  const smaller = landmarks.map(({ x, y }) => ({ x: x * 0.5, y: y * 0.5 }));
  const base = handFeatures(landmarks, aspect);
  handFeatures(moved, aspect).forEach((value, index) => assert.ok(Math.abs(value - base[index]) < 0.01));
  handFeatures(smaller, aspect).forEach((value, index) => assert.ok(Math.abs(value - base[index]) < 0.01));
});

test('features ignore how the hand is tilted', () => {
  const { landmarks } = hand('peace');
  const turn = Math.PI / 5;
  const tilted = landmarks.map(({ x, y }) => ({ x: x * Math.cos(turn) - y * Math.sin(turn), y: x * Math.sin(turn) + y * Math.cos(turn) }));
  const base = handFeatures(landmarks, 1);
  handFeatures(tilted, 1).forEach((value, index) => assert.ok(Math.abs(value - base[index]) < 0.01));
});

test('a model with nothing taught answers nothing', () => {
  assert.equal(classify(createGestureModel(), hand('peace')), null);
});

test('a taught real hand shape is recognised on later frames', () => {
  const model = createGestureModel({ 3: examples(hand('peace')), 7: examples(hand('thumbUp')) });
  assert.equal(classify(model, jittered(hand('peace'), 99)), '3');
  assert.equal(classify(model, jittered(hand('thumbUp'), 99)), '7');
});

test('a hand shape nobody taught is refused rather than guessed', () => {
  const model = createGestureModel({ 3: examples(hand('peace')) });
  for (const name of ['openLeft', 'thumbUp', 'openAngled']) assert.equal(classify(model, hand(name)), null, name);
});

test('a shape taught on one hand works on the other', () => {
  const model = createGestureModel({ 3: examples(hand('peace')) });
  const { landmarks, aspect } = hand('peace');
  assert.equal(classify(model, { aspect, landmarks: landmarks.map(({ x, y }) => ({ x: 1 - x, y })) }), '3');
});

test('a taught shape types through the detector, including a taught closing gesture', () => {
  // For a hand that can't make a fist: an open hand means 3, and a peace sign stands in for closing.
  const model = createGestureModel({ 3: examples(hand('openLeft')), [GESTURE_CLOSED]: examples(hand('peace')) });
  const detector = createDigitDetector();
  const feed = ({ landmarks, aspect }, frames) => Array.from({ length: frames }, () => detector.update(landmarks, aspect, model).digit).filter(Boolean);
  assert.deepEqual([...feed(hand('openLeft'), 8), ...feed(hand('peace'), 3)], ['3']);
});

test('a taught shape with curled fingers is its number, not a closed hand', () => {
  const model = createGestureModel({ 3: examples(hand('thumbUp')) });
  const detector = createDigitDetector();
  const feed = ({ landmarks, aspect }, frames) => Array.from({ length: frames }, () => detector.update(landmarks, aspect, model).digit).filter(Boolean);
  assert.deepEqual([...feed(hand('thumbUp'), 8), ...feed(hand('fist'), 3)], ['3']);
});

test('without a taught shape the standard patterns still work', () => {
  const model = createGestureModel({ 3: examples(hand('openLeft')) });
  const detector = createDigitDetector();
  const feed = ({ landmarks, aspect }, frames) => Array.from({ length: frames }, () => detector.update(landmarks, aspect, model).digit).filter(Boolean);
  assert.deepEqual([...feed(hand('pointing'), 8), ...feed(hand('fist'), 3)], ['1']);
});

test('a match reports how confident it is, closer shapes scoring higher', () => {
  const model = createGestureModel({ 3: examples(hand('peace')) });
  const exact = model.match(hand('peace').landmarks, hand('peace').aspect);
  const shaky = model.match(jittered(hand('peace'), 99).landmarks, hand('peace').aspect);
  assert.equal(exact.label, '3');
  assert.ok(exact.confidence > 0.9, `exact ${exact.confidence}`);
  assert.ok(shaky.confidence > 0 && shaky.confidence <= exact.confidence, `shaky ${shaky.confidence}`);
  assert.equal(model.match(hand('openLeft').landmarks, hand('openLeft').aspect), null);
});

test('the detector reports what it sees and grows surer as a pattern is held', () => {
  const model = createGestureModel({ 3: examples(hand('openLeft')) });
  const detector = createDigitDetector();
  const { landmarks, aspect } = hand('openLeft');
  const first = detector.update(landmarks, aspect, model);
  assert.equal(first.seen, '3');
  assert.ok(first.certainty > 0 && first.certainty < 1);
  assert.ok(first.confidence > 0.9);
  for (let frame = 0; frame < 6; frame += 1) detector.update(landmarks, aspect, model);
  assert.equal(detector.update(landmarks, aspect, model).certainty, 1);
  const standard = createDigitDetector().update(hand('pointing').landmarks, hand('pointing').aspect, model);
  assert.equal(standard.confidence, null);
});

test('teaching again keeps the newest examples, and forgetting removes only that label', () => {
  let samples = {};
  for (let round = 0; round < 3; round += 1) samples = addSamples(samples, '1', examples(hand('peace')));
  assert.equal(samples['1'].length, 40);
  samples = addSamples(samples, '2', examples(hand('fist')));
  assert.deepEqual(Object.keys(forgetLabel(samples, '1')), ['2']);
});

test('a small comfortable movement becomes the whole screen', () => {
  const points = [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.5, y: 0.55 }];
  const zone = computeReachZone(points);
  assert.deepEqual(toScreen({ x: zone.left, y: zone.top }, zone), { x: 0, y: 0 });
  assert.deepEqual(toScreen({ x: zone.right, y: zone.bottom }, zone), { x: 1, y: 1 });
  // The furthest points reached land on the screen's edges, without needing a full stretch.
  assert.equal(toScreen({ x: 0.6, y: 0.5 }, zone).x, 1);
});

test('barely moving does not replace the reach zone', () => {
  assert.equal(computeReachZone([{ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.51 }]), null);
  assert.equal(computeReachZone([]), null);
  assert.equal(computeReachZone([{ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.51 }]), null);
});

test('saved reach zones and gestures load back, and bad ones are ignored', () => {
  const storage = memoryStorage();
  const zone = { left: 0.3, right: 0.6, top: 0.3, bottom: 0.6 };
  saveReachZone(storage, zone);
  assert.deepEqual(loadReachZone(storage), zone);
  assert.equal(loadReachZone(memoryStorage({ 'handtap.reachZone': '{"left":0.9,"right":0.1,"top":0,"bottom":1}' })), REACH_ZONE);
  assert.equal(loadReachZone(memoryStorage({ 'handtap.reachZone': '{oops' })), REACH_ZONE);

  const samples = { 1: examples(hand('peace'), 2) };
  saveGestureSamples(storage, samples);
  assert.deepEqual(loadGestureSamples(storage), samples);
  assert.deepEqual(loadGestureSamples(memoryStorage({ 'handtap.gestures': '{"1":[[1,2]],"2":"x"}' })), {});
  assert.equal(loadAutoStart(memoryStorage()), false);
  assert.equal(loadScrollSensitivity(memoryStorage()), 30);
  saveScrollSensitivity(storage, 65);
  assert.equal(loadScrollSensitivity(storage), 65);
  assert.equal(loadScrollSensitivity(memoryStorage({ 'handtap.scrollSensitivity': '5' })), 30);
});

test('mouse control takes a thumb tap nothing else is using', () => {
  assert.equal(loadControlToggle(memoryStorage(), 'ringTap', {}), 'middleTap');
  assert.equal(loadControlToggle(memoryStorage(), 'ringTap', { middleTap: 'Ctrl+C', ringTap: 'Ctrl+V' }), 'middleTap');
  assert.equal(loadControlToggle(memoryStorage(), 'middleTap', {}), 'ringTap');
  assert.equal(loadControlToggle(memoryStorage(), 'ringTap', { middleTap: 'Enter' }), '');
  assert.equal(loadControlToggle(memoryStorage({ 'handtap.controlToggle': '""' }), 'ringTap', {}), '');
  assert.equal(loadControlToggle(memoryStorage({ 'handtap.controlToggle': '"swipeUp"' }), 'ringTap', {}), 'swipeUp');
  assert.equal(loadControlToggle(memoryStorage({ 'handtap.controlToggle': '"ringTap"' }), 'ringTap', {}), 'middleTap');
});
