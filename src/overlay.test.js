import assert from 'node:assert/strict';
import { test } from 'node:test';
import { overlayStatus } from './overlay.js';

test('the overlay shows the live gesture and the active mode', () => {
  assert.deepEqual(
    overlayStatus({ gesture: 'Hand ready', cameraOn: true, controlOn: true, typingOn: false }),
    { gesture: 'Hand ready', mode: 'Mouse control on', live: true },
  );
  assert.deepEqual(
    overlayStatus({ gesture: 'Typing numbers', cameraOn: true, controlOn: false, typingOn: true }),
    { gesture: 'Typing numbers', mode: 'Number typing on', live: true },
  );
});

test('mouse control is named before number typing when both are on', () => {
  assert.equal(overlayStatus({ gesture: 'Hand ready', cameraOn: true, controlOn: true, typingOn: true }).mode, 'Mouse control on');
});

test('the overlay falls back safely when the camera is off or the gesture is empty', () => {
  assert.deepEqual(
    overlayStatus({ gesture: '', cameraOn: false, controlOn: false, typingOn: false }),
    { gesture: 'Waiting for camera', mode: 'Camera off', live: false },
  );
  assert.equal(overlayStatus({ gesture: undefined, cameraOn: true }).gesture, 'Waiting for camera');
});

test('overlay text is clipped so a long value cannot stretch the corner window', () => {
  assert.equal(overlayStatus({ gesture: 'x'.repeat(200), cameraOn: true }).gesture.length, 80);
});
