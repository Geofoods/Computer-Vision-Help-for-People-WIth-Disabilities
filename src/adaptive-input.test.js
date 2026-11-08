import test from 'node:test';
import assert from 'node:assert/strict';
import { createDwellClicker } from './dwell.js';
import { CUSTOM_MOVEMENTS, createCustomGestureDetector, isCustomLabel, splitSamples } from './custom-gestures.js';
import { MOVEMENTS, loadBindings } from './keybinds.js';

const memoryStorage = (values = {}) => ({ getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = value; } });

test('dwell clicks once after the cursor rests for the dwell time', () => {
  const dwell = createDwellClicker({ dwellMs: 1000, radius: 0.02 });
  assert.deepEqual(dwell.update({ x: 0.5, y: 0.5 }, 0), { progress: 0, click: false });
  assert.equal(dwell.update({ x: 0.505, y: 0.5 }, 500).progress, 0.5);
  assert.equal(dwell.update({ x: 0.5, y: 0.505 }, 999).click, false);
  assert.equal(dwell.update({ x: 0.5, y: 0.5 }, 1000).click, true);
  // Resting longer on the same spot does not click again.
  assert.equal(dwell.update({ x: 0.5, y: 0.5 }, 3000).click, false);
});

test('dwell needs the cursor to move away before it clicks again', () => {
  const dwell = createDwellClicker({ dwellMs: 1000, radius: 0.02 });
  dwell.update({ x: 0.2, y: 0.2 }, 0);
  assert.equal(dwell.update({ x: 0.2, y: 0.2 }, 1000).click, true);
  dwell.update({ x: 0.6, y: 0.6 }, 1100);
  assert.equal(dwell.update({ x: 0.6, y: 0.6 }, 2099).click, false);
  assert.equal(dwell.update({ x: 0.6, y: 0.6 }, 2100).click, true);
});

test('dwell restarts when the cursor drifts out of range, and does nothing when off', () => {
  const dwell = createDwellClicker({ dwellMs: 1000, radius: 0.02 });
  dwell.update({ x: 0.5, y: 0.5 }, 0);
  dwell.update({ x: 0.55, y: 0.5 }, 900); // moved: the hold starts over here
  assert.equal(dwell.update({ x: 0.55, y: 0.5 }, 1500).click, false);
  assert.equal(dwell.update({ x: 0.55, y: 0.5 }, 1900).click, true);
  const off = createDwellClicker({ dwellMs: 100 });
  off.update({ x: 0.5, y: 0.5 }, 0, false);
  assert.deepEqual(off.update({ x: 0.5, y: 0.5 }, 500, false), { progress: 0, click: false });
  assert.deepEqual(off.update(null, 600), { progress: 0, click: false });
});

test('a custom gesture fires once per hold, after the hold time', () => {
  const detector = createCustomGestureDetector({ holdMs: 600 });
  const held = { label: 'custom2', confidence: 0.8 };
  assert.equal(detector.update(held, 0), null);
  assert.equal(detector.update(held, 599), null);
  assert.equal(detector.update(held, 600), 'custom2');
  assert.equal(detector.update(held, 2000), null);
  detector.update(null, 2100);
  detector.update(held, 2200);
  assert.equal(detector.update(held, 2800), 'custom2');
});

test('custom gestures ignore weak matches and taught numbers', () => {
  const detector = createCustomGestureDetector({ holdMs: 100 });
  detector.update({ label: 'custom1', confidence: 0.1 }, 0);
  assert.equal(detector.update({ label: 'custom1', confidence: 0.1 }, 500), null);
  detector.update({ label: '3', confidence: 0.9 }, 600);
  assert.equal(detector.update({ label: '3', confidence: 0.9 }, 1200), null);
});

test('taught samples split so number typing never sees a shortcut gesture', () => {
  const sample = Array(40).fill(0);
  const { typing, custom } = splitSamples({ 3: [sample], closed: [sample], custom1: [sample] });
  assert.deepEqual(Object.keys(typing).sort(), ['3', 'closed']);
  assert.deepEqual(Object.keys(custom), ['custom1']);
  assert.ok(CUSTOM_MOVEMENTS.every(({ id }) => isCustomLabel(id) && !MOVEMENTS.some((m) => m.id === id)));
});

test('shortcuts bound to custom gestures are saved and loaded like any other', () => {
  const storage = memoryStorage({ 'handtap.keybinds': JSON.stringify({ custom1: 'Ctrl+C', custom3: '' , bogus: 'X' }) });
  const bindings = loadBindings(storage);
  assert.equal(bindings.custom1, 'Ctrl+C');
  assert.equal(bindings.custom3, '');
  assert.equal(bindings.custom2, undefined);
  assert.equal(bindings.bogus, undefined);
});
