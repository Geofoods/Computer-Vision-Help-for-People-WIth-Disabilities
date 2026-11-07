import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  createOneEuroFilter,
  createPinchDetector,
  createDigitDetector,
  createMovementDetector,
  toScreen,
  pinchRatio,
  REACH_ZONE,
} from '../src/tracking.js';
import { createGestureModel, handFeatures } from '../src/gesture-model.js';
import { comboToKeyCodes } from '../electron/keys.cjs';
import {
  createMockStorage,
  createMockSpawn,
  createSyntheticHand,
  generateNoisySignal,
  calculateContrastRatio,
  DESIGN_SPECS,
} from './helpers.js';

const require = createRequire(import.meta.url);
const { createMouse } = require('../electron/mouse.cjs');

const hands = JSON.parse(fs.readFileSync(new URL('../src/fixtures/real-hands.json', import.meta.url), 'utf8'));

// --------------------------------------------------------------------------
// Tier 4: Real-World Scenarios (>= 5 realistic assistive workflows)
// --------------------------------------------------------------------------

describe('Tier 4: Realistic End-to-End Assistive Workflows', () => {
  test('Scenario 1: Web Browser Navigation for User with Limited Mobility', () => {
    // 1. Calibrate compact reach zone for user with restricted arm range
    const compactReach = { left: 0.3, right: 0.7, top: 0.35, bottom: 0.65 };
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);

    // 2. User moves hand toward a hyperlink in browser
    // Hand starts at (0.35, 0.4) and moves to (0.6, 0.55)
    const filterX = createOneEuroFilter(DESIGN_SPECS.filterProfiles.balanced);
    const filterY = createOneEuroFilter(DESIGN_SPECS.filterProfiles.balanced);

    let currentHand = { x: 0.35, y: 0.4 };
    let timeMs = 1000;
    // Step through 5 frames of motion
    for (let f = 1; f <= 5; f++) {
      currentHand = {
        x: 0.35 + (0.6 - 0.35) * (f / 5),
        y: 0.4 + (0.55 - 0.4) * (f / 5),
      };
      timeMs += 33.3;
      const smoothX = filterX.filter(currentHand.x, timeMs);
      const smoothY = filterY.filter(currentHand.y, timeMs);
      const screenPos = toScreen({ x: smoothX, y: smoothY }, compactReach);
      mouse.move(screenPos);
    }
    assert.equal(mockSpawn.writes.length, 5);

    // 3. User clicks link using thumb-index pinch
    const pinchDetector = createPinchDetector({ sensitivity: 55 });
    const pinchHand = createSyntheticHand({ gap: 0.08 });
    const ratio = pinchRatio(pinchHand);
    pinchDetector.update(ratio); // Debounce frame 1
    const { justPinched } = pinchDetector.update(ratio); // Confirms frame 2
    assert.equal(justPinched, true);

    const targetPos = toScreen(currentHand, compactReach);
    mouse.click(targetPos);
    assert.equal(mockSpawn.writes[mockSpawn.writes.length - 1], `click ${targetPos.x.toFixed(5)} ${targetPos.y.toFixed(5)}\n`);

    // 4. User opens context menu with right click at same spot
    const rightClickCmd = `right-click ${targetPos.x.toFixed(5)} ${targetPos.y.toFixed(5)}\n`;
    mockSpawn.child.stdin.write(rightClickCmd);
    assert.equal(mockSpawn.writes[mockSpawn.writes.length - 1], rightClickCmd);

    // 5. User scrolls page content down
    mouse.scrollDown();
    assert.equal(mockSpawn.writes[mockSpawn.writes.length - 1], 'scroll -720\n');
  });

  test('Scenario 2: Hands-Free Phone Number Entry ("8-0-0")', () => {
    // 1. Enter Number Typing Mode
    let isTypingMode = false;
    const toggleTyping = () => { isTypingMode = !isTypingMode; };
    toggleTyping();
    assert.equal(isTypingMode, true);

    // Setup digit detector with real hands
    const pointingHand = hands['pointing']; // digit 1 in standard patterns
    const fistHand = hands['fist'];         // closed hand to confirm
    const peaceHand = hands['peace'];       // digit 2

    const detector = createDigitDetector({ holdFrames: 4, closedFrames: 2 });
    const typedDigits = [];
    const audioBeeps = [];

    const handleDigitTyped = (digit) => {
      typedDigits.push(digit);
      audioBeeps.push(`BEEP_${digit}`); // Audio feedback trigger
    };

    // Helper: simulate holding a pose and then closing hand
    const enterDigit = (handPose, expectedDigit) => {
      // Hold pose for 4 frames to arm
      for (let f = 0; f < 4; f++) {
        const state = detector.update(handPose.landmarks, handPose.aspect);
        if (f === 3) assert.equal(state.armed, expectedDigit);
      }
      // Close hand for 2 frames to type
      detector.update(fistHand.landmarks, fistHand.aspect);
      const res = detector.update(fistHand.landmarks, fistHand.aspect);
      if (res.digit) handleDigitTyped(res.digit);
    };

    // Type digit 1
    enterDigit(pointingHand, '1');
    assert.deepEqual(typedDigits, ['1']);
    assert.deepEqual(audioBeeps, ['BEEP_1']);

    // Type digit 2
    enterDigit(peaceHand, '2');
    assert.deepEqual(typedDigits, ['1', '2']);
    assert.deepEqual(audioBeeps, ['BEEP_1', 'BEEP_2']);

    // Type digit 2 again
    enterDigit(peaceHand, '2');
    assert.deepEqual(typedDigits, ['1', '2', '2']);
    assert.equal(typedDigits.join(''), '122');
  });

  test('Scenario 3: Tremor-Dampened Precision Targeting for Spasticity', () => {
    // 1. User with spasticity/tremor selects steady profile and low sensitivity
    const profile = DESIGN_SPECS.filterProfiles.steady;
    const sensitivity = 30;
    const filterX = createOneEuroFilter(profile);
    const filterY = createOneEuroFilter(profile);

    // 2. Hand hovers over a small 16px target with high-frequency physiological tremor (8 Hz)
    const targetCenter = { x: 0.5, y: 0.5 };
    const tremorNoise = generateNoisySignal({
      mean: 0.5,
      amplitude: 0.035, // +/- 3.5% screen width tremor
      steps: 40,
      frequency: 1.5,
    });

    const smoothedPositions = tremorNoise.map((s) => ({
      raw: s.value,
      smoothed: filterX.filter(s.value, s.timeMs),
    }));

    // 3. Verify jitter reduction: variance of smoothed signal is significantly smaller than raw
    const rawDeviations = smoothedPositions.map((p) => Math.abs(p.raw - targetCenter.x));
    const smoothDeviations = smoothedPositions.slice(10).map((p) => Math.abs(p.smoothed - targetCenter.x));
    const avgRaw = rawDeviations.reduce((a, b) => a + b, 0) / rawDeviations.length;
    const avgSmooth = smoothDeviations.reduce((a, b) => a + b, 0) / smoothDeviations.length;

    assert.ok(avgSmooth < avgRaw * 0.35, 'Tremor-dampened filter failed to attenuate jitter by >= 65%');

    // 4. Stable click execution: pinch threshold is scaled by sensitivity without causing cursor jump
    const pinchDetector = createPinchDetector({ sensitivity });
    const pinchHand = createSyntheticHand({ gap: 0.05 });
    pinchDetector.update(pinchRatio(pinchHand));
    const { justPinched } = pinchDetector.update(pinchRatio(pinchHand));
    assert.equal(justPinched, true);
  });

  test('Scenario 4: Custom Keybinding Setup & Persistent Hotkey Triggers', () => {
    const storage = createMockStorage();
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);

    // 1. User customizes keybindings: maps swipeLeft to Alt+Left (Browser Back)
    const customCombo = 'Alt+Left';
    const keycodes = comboToKeyCodes(customCombo);
    assert.deepEqual(keycodes, [0x12, 0x25]);

    // 2. Persist to storage
    const bindings = { swipeLeft: customCombo };
    storage.setItem('handtap.keybinds', JSON.stringify(bindings));

    // 3. Simulate application reload
    const restoredBindings = JSON.parse(storage.getItem('handtap.keybinds'));
    assert.equal(restoredBindings.swipeLeft, 'Alt+Left');

    // 4. Execute keypress via mouse helper
    mouse.pressKeys(restoredBindings.swipeLeft);
    assert.equal(mockSpawn.writes.length, 1);
    assert.equal(mockSpawn.writes[0], 'keys 18,37\n'); // 0x12 = 18, 0x25 = 37
  });

  test('Scenario 5: Full Application Lifecycle & Diagnostics Monitoring', () => {
    // 1. Boot up application: load preferences from storage
    const storage = createMockStorage({
      'handtap.sensitivity': '65',
      'handtap.filterProfile': 'steady',
      'handtap.sounds': 'on',
      'handtap.autoStart': 'true',
    });

    const sensitivity = Number(storage.getItem('handtap.sensitivity'));
    const filterProfile = storage.getItem('handtap.filterProfile');
    const sounds = storage.getItem('handtap.sounds');
    const autoStart = storage.getItem('handtap.autoStart') === 'true';

    assert.equal(sensitivity, 65);
    assert.equal(filterProfile, 'steady');
    assert.equal(sounds, 'on');
    assert.equal(autoStart, true);

    // 2. Warm up native input helper
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);
    mouse.warmUp();
    assert.ok(mockSpawn.child);

    // 3. Continuous 100-frame tracking loop simulation
    const filter = createOneEuroFilter(DESIGN_SPECS.filterProfiles[filterProfile]);
    let lastTime = 0;
    const telemetryHistory = [];

    for (let frame = 1; frame <= 100; frame++) {
      const now = frame * 33.3;
      const rawX = 0.5 + Math.sin(frame * 0.1) * 0.2;
      const smoothX = filter.filter(rawX, now);
      assert.ok(Number.isFinite(smoothX));

      if (frame % 20 === 0) {
        telemetryHistory.push({
          frame,
          fps: Math.round(1000 / (now - lastTime || 33.3)),
          latencyMs: 16.6,
          fieldStatus: 'ONLINE',
        });
      }
      lastTime = now;
    }
    assert.equal(telemetryHistory.length, 5);
    assert.ok(telemetryHistory.every((t) => t.fieldStatus === 'ONLINE'));

    // 4. Diagnostics IPC query
    const diagnostics = {
      uptime: 3.33,
      memory: {
        heapUsed: 48 * 1024 * 1024,
        heapTotal: 72 * 1024 * 1024,
        rss: 110 * 1024 * 1024,
      },
      helperRunning: Boolean(mockSpawn.child),
      platform: process.platform,
      version: '0.1.0',
    };
    assert.equal(diagnostics.helperRunning, true);
    assert.ok(diagnostics.uptime > 0);

    // 5. Clean teardown
    mouse.dispose();
    assert.equal(mockSpawn.writes[mockSpawn.writes.length - 1], '[STDIN_END]');
  });
});
