import assert from 'node:assert/strict';
import { test } from 'node:test';
import keys from '../electron/keys.cjs';
import { MOVEMENTS, PRESET_GROUPS, comboFromEvent, loadBindings, loadSoundsOn, loadTypingToggle, saveBindings, saveTypingPreferences } from './keybinds.js';
import { createMovementDetector } from './tracking.js';

const { comboToKeyCodes } = keys;

function memoryStorage(initial = {}) {
  const values = { ...initial };
  return { getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = value; } };
}

// An open hand: every fingertip well beyond its middle joint, thumb away from the fingers.
function openHand({ x = 0.5, y = 0.5 } = {}) {
  const landmarks = Array.from({ length: 21 }, () => ({ x, y }));
  landmarks[0] = { x, y: y + 0.2 };
  landmarks[9] = { x, y };
  landmarks[4] = { x: x - 0.25, y: y + 0.05 };
  [[6, 8, -0.06], [10, 12, -0.02], [14, 16, 0.02], [18, 20, 0.06]].forEach(([joint, tip, offset]) => {
    landmarks[joint] = { x: x + offset, y: y - 0.08 };
    landmarks[tip] = { x: x + offset, y: y - 0.18 };
  });
  return landmarks;
}

function fist() {
  const landmarks = openHand();
  [[6, 8], [10, 12], [14, 16], [18, 20]].forEach(([joint, tip]) => {
    landmarks[tip] = { x: landmarks[joint].x, y: landmarks[joint].y + 0.05 };
  });
  return landmarks;
}

function thumbTouching(tip) {
  const landmarks = openHand();
  landmarks[4] = { x: landmarks[tip].x, y: landmarks[tip].y };
  return landmarks;
}

// Feeds a list of frames 33ms apart and returns the movements that fired.
function run(detector, frames, start = 0) {
  return frames.flatMap((landmarks, frame) => {
    const { movement } = detector.update(landmarks, { now: start + frame * 33 });
    return movement ? [movement] : [];
  });
}

const repeat = (landmarks, count) => Array.from({ length: count }, () => landmarks);
const path = (fromX, toX, count, y = 0.5) => Array.from({ length: count }, (_, frame) => (
  openHand({ x: fromX + ((toX - fromX) * frame) / (count - 1), y })
));

test('a resting open hand fires nothing', () => {
  assert.deepEqual(run(createMovementDetector(), repeat(openHand(), 30)), []);
});

test('a slow move across the frame is not a swipe', () => {
  assert.deepEqual(run(createMovementDetector(), path(0.3, 0.7, 60)), []);
});

test('swipes are named by screen direction, not camera direction', () => {
  assert.deepEqual(run(createMovementDetector(), path(0.8, 0.2, 8)), ['swipeRight']);
  assert.deepEqual(run(createMovementDetector(), path(0.2, 0.8, 8)), ['swipeLeft']);
});

test('vertical swipes are recognised', () => {
  const frames = Array.from({ length: 8 }, (_, frame) => openHand({ x: 0.5, y: 0.2 + frame * 0.08 }));
  assert.deepEqual(run(createMovementDetector(), frames), ['swipeDown']);
  assert.deepEqual(run(createMovementDetector(), [...frames].reverse()), ['swipeUp']);
});

test('a diagonal sweep is not a swipe', () => {
  const frames = Array.from({ length: 8 }, (_, frame) => openHand({ x: 0.2 + frame * 0.08, y: 0.2 + frame * 0.08 }));
  assert.deepEqual(run(createMovementDetector(), frames), []);
});

test('bringing the hand back after a swipe does not fire the opposite swipe', () => {
  const frames = [...path(0.8, 0.2, 8), ...path(0.2, 0.8, 8)];
  assert.deepEqual(run(createMovementDetector(), frames), ['swipeRight']);
});

test('a held fist fires once, and again only after opening', () => {
  const detector = createMovementDetector({ cooldownMs: 0 });
  const frames = [...repeat(fist(), 20), ...repeat(openHand(), 3), ...repeat(fist(), 5)];
  assert.deepEqual(run(detector, frames), ['fist', 'fist']);
});

test('a fist held for too few frames does not fire', () => {
  assert.deepEqual(run(createMovementDetector(), [...repeat(fist(), 2), ...repeat(openHand(), 5)]), []);
});

test('thumb taps are told apart by the nearest fingertip', () => {
  assert.deepEqual(run(createMovementDetector(), repeat(thumbTouching(12), 5)), ['middleTap']);
  assert.deepEqual(run(createMovementDetector(), repeat(thumbTouching(16), 5)), ['ringTap']);
});

test('a thumb and index pinch is left to the click detector', () => {
  const detector = createMovementDetector();
  assert.deepEqual(run(detector, repeat(thumbTouching(8), 5)), []);
  assert.equal(detector.update(thumbTouching(8), { now: 500 }).pose, null);
});

test('the pose is reported before it fires, so a click can be held back', () => {
  const { movement, pose } = createMovementDetector().update(thumbTouching(12), { now: 0 });
  assert.equal(movement, null);
  assert.equal(pose, 'middleTap');
});

test('reset forgets a swipe in progress', () => {
  const detector = createMovementDetector();
  const frames = path(0.8, 0.2, 8);
  run(detector, frames.slice(0, 4));
  detector.reset();
  assert.deepEqual(run(detector, frames.slice(4), 132), []);
});

test('comboToKeyCodes puts modifiers first', () => {
  assert.deepEqual(comboToKeyCodes('Ctrl+Shift+T'), [0x11, 0x10, 0x54]);
  assert.deepEqual(comboToKeyCodes('Enter'), [0x0d]);
  assert.deepEqual(comboToKeyCodes('Alt+F4'), [0x12, 0x73]);
});

test('comboToKeyCodes rejects anything it does not recognise', () => {
  for (const combo of ['', 'Ctrl', 'Ctrl+Ctrl+A', 'A+B', 'Nope', 'constructor', '1,2\nclick 0 0', 7, null]) {
    assert.throws(() => comboToKeyCodes(combo), /./, String(combo));
  }
});

test('every preset is a combination the desktop side accepts', () => {
  for (const { presets } of PRESET_GROUPS) {
    for (const { combo } of presets) assert.doesNotThrow(() => comboToKeyCodes(combo), combo);
  }
});

test('comboFromEvent builds a shortcut in a fixed modifier order', () => {
  const event = { code: 'KeyT', key: 'T', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false };
  assert.equal(comboFromEvent(event), 'Ctrl+Shift+T');
});

test('comboFromEvent follows the keyboard layout for letters', () => {
  assert.equal(comboFromEvent({ code: 'KeyQ', key: 'a' }), 'A');
});

test('comboFromEvent ignores lone modifiers and unsupported keys', () => {
  assert.equal(comboFromEvent({ code: 'ControlLeft', key: 'Control', ctrlKey: true }), null);
  assert.equal(comboFromEvent({ code: 'F13', key: 'F13' }), null);
});

test('every key the recorder can produce is accepted by the desktop side', () => {
  const codes = [
    'KeyA', 'KeyZ', 'Digit0', 'Digit9', 'F1', 'F12', 'Enter', 'NumpadEnter', 'Escape', 'Tab', 'Space', 'Backspace',
    'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown',
    'Semicolon', 'Equal', 'Comma', 'Minus', 'Period', 'Slash', 'Backquote', 'BracketLeft', 'Backslash', 'BracketRight',
    'Quote', 'AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute', 'MediaPlayPause', 'MediaTrackNext', 'MediaTrackPrevious',
  ];
  for (const code of codes) {
    const combo = comboFromEvent({ code, key: '', ctrlKey: true, altKey: true, shiftKey: true, metaKey: true });
    assert.ok(combo, code);
    assert.equal(comboToKeyCodes(combo).length, 5, code);
  }
});

test('number typing starts on a thumb tap that no shortcut is using', () => {
  const withBindings = (bindings) => memoryStorage({ 'handtap.keybinds': JSON.stringify(bindings) });
  assert.equal(loadTypingToggle(memoryStorage()), 'ringTap');
  assert.equal(loadTypingToggle(withBindings({ ringTap: 'Ctrl+C' })), 'middleTap');
  assert.equal(loadTypingToggle(withBindings({ ringTap: 'Ctrl+C', middleTap: 'Enter' })), '');
});

test('a toggle set the old way carries over, and stops being a shortcut', () => {
  const storage = memoryStorage({ 'handtap.keybinds': JSON.stringify({ swipeUp: 'NumberTyping', fist: 'Enter' }) });
  assert.equal(loadTypingToggle(storage), 'swipeUp');
  assert.deepEqual(loadBindings(storage), { indexTap: 'Left Click', tongueLick: 'Scroll Down', fist: 'Enter' });
});

test('number typing preferences survive a save and load, including turning the toggle off', () => {
  const storage = memoryStorage();
  saveTypingPreferences(storage, '', false);
  assert.equal(loadTypingToggle(storage), '');
  assert.equal(loadSoundsOn(storage), false);
  saveTypingPreferences(storage, 'swipeLeft', true);
  assert.equal(loadTypingToggle(storage), 'swipeLeft');
  assert.equal(loadSoundsOn(storage), true);
});

test('a fist cannot toggle number typing, and bad or failing storage has a safe answer', () => {
  assert.equal(loadTypingToggle(memoryStorage({ 'handtap.typingToggle': 'fist' })), 'ringTap');
  const blocked = { getItem() { throw new Error('blocked'); } };
  assert.equal(loadTypingToggle(blocked), 'ringTap');
  assert.equal(loadSoundsOn(blocked), true);
});

test('bindings survive a save and load', () => {
  const storage = memoryStorage();
  saveBindings(storage, { fist: 'Ctrl+C' });
  assert.deepEqual(loadBindings(storage), {
    indexTap: 'Left Click',
    tongueLick: 'Scroll Down',
    headTiltLeft: 'Alt+Left',
    headTiltRight: 'Alt+Right',
    swipeLeft: 'Left',
    swipeRight: 'Right',
    swipeUp: 'Up',
    swipeDown: 'Down',
    fist: 'Ctrl+C',
    middleTap: 'Ctrl+C',
    ringTap: 'Ctrl+V',
  });
});

test('loadBindings ignores unknown movements, bad values, and corrupt or failing storage', () => {
  const saved = JSON.stringify({ fist: 'Enter', ringTap: 7, teleport: 'Ctrl+C' });
  assert.deepEqual(loadBindings(memoryStorage({ 'handtap.keybinds': saved })), {
    indexTap: 'Left Click',
    tongueLick: 'Scroll Down',
    headTiltLeft: 'Alt+Left',
    headTiltRight: 'Alt+Right',
    swipeLeft: 'Left',
    swipeRight: 'Right',
    swipeUp: 'Up',
    swipeDown: 'Down',
    fist: 'Enter',
    middleTap: 'Ctrl+C',
    ringTap: 'Ctrl+V',
  });
  assert.deepEqual(loadBindings(memoryStorage({ 'handtap.keybinds': '{oops' })), {
    indexTap: 'Left Click',
    tongueLick: 'Scroll Down',
    headTiltLeft: 'Alt+Left',
    headTiltRight: 'Alt+Right',
    swipeLeft: 'Left',
    swipeRight: 'Right',
    swipeUp: 'Up',
    swipeDown: 'Down',
    fist: 'Esc',
    middleTap: 'Ctrl+C',
    ringTap: 'Ctrl+V',
  });
  assert.deepEqual(loadBindings({ getItem() { throw new Error('blocked'); } }), {
    indexTap: 'Left Click',
    tongueLick: 'Scroll Down',
    headTiltLeft: 'Alt+Left',
    headTiltRight: 'Alt+Right',
    swipeLeft: 'Left',
    swipeRight: 'Right',
    swipeUp: 'Up',
    swipeDown: 'Down',
    fist: 'Esc',
    middleTap: 'Ctrl+C',
    ringTap: 'Ctrl+V',
  });
  assert.equal(MOVEMENTS.length, 11);
});
