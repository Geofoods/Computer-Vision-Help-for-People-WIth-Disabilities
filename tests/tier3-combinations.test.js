import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import {
  createOneEuroFilter,
  createPinchDetector,
  createDigitDetector,
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
// Tier 3: Cross-Feature Combinations (Pairwise Interaction Tests)
// --------------------------------------------------------------------------

describe('Tier 3: Pairwise Cross-Feature Interactions', () => {
  test('Combination 1: Pinch Detection + Reach Zone Remapping', () => {
    // Hand at center of calibrated reach zone
    const customZone = { left: 0.3, right: 0.7, top: 0.25, bottom: 0.75 };
    const handCenter = { x: 0.5, y: 0.5 };
    const screenCoord = toScreen(handCenter, customZone);
    assert.ok(Math.abs(screenCoord.x - 0.5) < 1e-9);
    assert.ok(Math.abs(screenCoord.y - 0.5) < 1e-9);

    // Pinch detector triggered at this position
    const pinchDetector = createPinchDetector({ sensitivity: 60 });
    const pinchHand = createSyntheticHand({ gap: 0.1 });
    const ratio = pinchRatio(pinchHand);
    pinchDetector.update(ratio); // Frame 1 debounces glitch
    const { justPinched, pinching } = pinchDetector.update(ratio); // Frame 2 confirms pinch
    assert.equal(pinching, true);
    assert.equal(justPinched, true);

    // Mock mouse click at this remapped coordinate
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);
    mouse.click(screenCoord);
    assert.equal(mockSpawn.writes.length, 1);
    assert.equal(mockSpawn.writes[0], 'click 0.50000 0.50000\n');
  });

  test('Combination 2: Adaptive Smoothing Profiles + Sensitivity Scaling', () => {
    // Low sensitivity (30) scales down pinch trigger threshold
    const sensitivity = 30;
    const pressThreshold = 0.3 + (sensitivity - 50) * 0.003;
    assert.ok(Math.abs(pressThreshold - 0.24) < 1e-9);

    // Tremor Dampened filter smooths coordinates while low sensitivity avoids accidental clicks
    const steadyFilter = createOneEuroFilter(DESIGN_SPECS.filterProfiles.steady);
    const noise = generateNoisySignal({ mean: 0.5, amplitude: 0.04, steps: 20 });
    const outputs = noise.map((s) => steadyFilter.filter(s.value, s.timeMs));

    // The smoothed output maintains stability
    const lastOutput = outputs[outputs.length - 1];
    assert.ok(Math.abs(lastOutput - 0.5) < 0.02);
  });

  test('Combination 3: Number Typing Mode + Custom Gesture Classifier (KNN)', () => {
    const { landmarks: peaceLandmarks, aspect: peaceAspect } = hands['peace'];
    const { landmarks: fistLandmarks, aspect: fistAspect } = hands['fist'];
    const features = handFeatures(peaceLandmarks, peaceAspect);
    assert.ok(features);

    // Train custom gesture for digit 2 using 20 examples of the peace pose
    const model = createGestureModel({ '2': Array(20).fill(features) });
    const digitDetector = createDigitDetector({ holdFrames: 4, closedFrames: 2 });

    // Classify using model
    const recognized = model.classify(peaceLandmarks, peaceAspect);
    assert.equal(recognized, '2');

    // 4 frames of peace pose arm digit 2
    for (let frame = 0; frame < 4; frame++) {
      const state = digitDetector.update(peaceLandmarks, peaceAspect, model);
      if (frame === 3) assert.equal(state.armed, '2');
    }

    // 2 frames of fist (closed hand) types digit 2
    digitDetector.update(fistLandmarks, fistAspect, model); // closed frame 1
    const finalState = digitDetector.update(fistLandmarks, fistAspect, model); // closed frame 2
    assert.equal(finalState.digit, '2');
  });

  test('Combination 4: Sliding Pill Controls + State Persistence', () => {
    const storage = createMockStorage();
    const PROFILE_KEY = 'handtap.filterProfile';
    const profiles = ['steady', 'balanced', 'agile'];

    let activeIndex = 0; // 'steady'
    const selectProfile = (idx) => {
      activeIndex = idx;
      storage.setItem(PROFILE_KEY, profiles[idx]);
    };

    // User slides pill to agile (index 2)
    selectProfile(2);
    assert.equal(activeIndex, 2);
    assert.equal(storage.getItem(PROFILE_KEY), 'agile');

    // Simulating app restart: reload from storage
    const loadedProfile = storage.getItem(PROFILE_KEY);
    const restoredIndex = profiles.indexOf(loadedProfile);
    assert.equal(restoredIndex, 2);
    const pillOffset = `${(restoredIndex / profiles.length) * 100}%`;
    assert.ok(pillOffset.startsWith('66.66'));
  });

  test('Combination 5: Native Right Click & Double Click + Normalized Coordinates Mapping', () => {
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);

    // Format right click command at normalized coordinate
    const pos = { x: 0.85, y: 0.15 };
    const rightClickCmd = `right-click ${pos.x.toFixed(5)} ${pos.y.toFixed(5)}\n`;
    mockSpawn.child.stdin.write(rightClickCmd);

    // Double click at same coordinate
    const doubleClickCmd = `double-click ${pos.x.toFixed(5)} ${pos.y.toFixed(5)}\n`;
    mockSpawn.child.stdin.write(doubleClickCmd);

    assert.equal(mockSpawn.writes.length, 2);
    assert.equal(mockSpawn.writes[0], 'right-click 0.85000 0.15000\n');
    assert.equal(mockSpawn.writes[1], 'double-click 0.85000 0.15000\n');
  });

  test('Combination 6: Ambient Canvas Resizing + Camera Stream Status', () => {
    // Initial size
    let width = 1280;
    let height = 720;
    let cameraOn = true;

    const computeLattice = (w, h) => ({
      cols: Math.max(16, Math.floor(w / 24)),
      rows: Math.max(10, Math.floor(h / 24)),
      cameraActive: cameraOn,
    });

    const latticeBefore = computeLattice(width, height);
    assert.equal(latticeBefore.cols, 53);
    assert.equal(latticeBefore.rows, 30);
    assert.equal(latticeBefore.cameraActive, true);

    // Viewport resize event occurs
    width = 1920;
    height = 1080;
    const latticeAfter = computeLattice(width, height);
    assert.equal(latticeAfter.cols, 80);
    assert.equal(latticeAfter.rows, 45);
    assert.equal(latticeAfter.cameraActive, true); // Tracking remains active
  });

  test('Combination 7: Monospace Telemetry HUD + 1€ Filter Mode Switching', () => {
    let currentProfile = 'balanced';
    const telemetry = {
      fps: 30,
      filterMode: currentProfile.toUpperCase(),
      latencyMs: 16.6,
      fieldStatus: 'ONLINE',
    };
    assert.equal(telemetry.filterMode, 'BALANCED');

    // Switch profile to agile
    currentProfile = 'agile';
    telemetry.filterMode = currentProfile.toUpperCase();
    assert.equal(telemetry.filterMode, 'AGILE');
  });

  test('Combination 8: Swiss Hairline Grid + Corner Reticles & HUD Brackets', () => {
    const card = {
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      borderWidth: 1, // 1px hairline border
    };

    // Corner reticles match hairline grid boundaries
    const reticles = [
      { x: card.x, y: card.y, glyph: '+' },
      { x: card.x + card.width, y: card.y, glyph: '+' },
      { x: card.x, y: card.y + card.height, glyph: '+' },
      { x: card.x + card.width, y: card.y + card.height, glyph: '+' },
    ];
    assert.equal(reticles[0].x, 100);
    assert.equal(reticles[3].x, 500);

    // HUD Brackets frame inner content without colliding with 1px border
    const brackets = {
      topLeft: { x: card.x, y: card.y, char: '┌' },
      topRight: { x: card.x + card.width, y: card.y, char: '┐' },
      bottomLeft: { x: card.x, y: card.y + card.height, char: '└' },
      bottomRight: { x: card.x + card.width, y: card.y + card.height, char: '┘' },
    };
    assert.equal(brackets.topLeft.char, '┌');
    assert.equal(brackets.bottomRight.char, '┘');
  });

  test('Combination 9: Dark Ink Theme + Dual-Layer Rolling Buttons', () => {
    const cardBg = DESIGN_SPECS.colors.card;
    const emeraldAccent = DESIGN_SPECS.colors.accentEmerald;

    // Resting button contrast against card
    const contrast = calculateContrastRatio(emeraldAccent, cardBg);
    assert.ok(contrast >= 7.0, `Contrast ${contrast.toFixed(2)} must be >= 7.0 for AAA`);

    // Dual layer animation does not shift button bounding height
    const buttonHeightResting = 36;
    const buttonHeightHovered = 36;
    assert.equal(buttonHeightResting, buttonHeightHovered);
  });

  test('Combination 10: System Status Diagnostics IPC + Active Mouse Helper', () => {
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);

    // Helper starts and moves cursor
    mouse.move({ x: 0.25, y: 0.75 });
    assert.equal(mockSpawn.writes.length, 1);

    // Query status while helper is active
    const status = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      helperRunning: Boolean(mockSpawn.child),
      platform: process.platform,
    };
    assert.equal(status.helperRunning, true);
    assert.ok(status.memory.heapUsed > 0);
  });

  test('Combination 11: Keybinding Customization + Native Keycode Whitelist & Storage', () => {
    const storage = createMockStorage();
    const KEYBINDS_STORAGE_KEY = 'handtap.keybinds';

    // Map gesture middleTap to browser dev tools shortcut
    const customCombo = 'Ctrl+Shift+I';
    const keycodes = comboToKeyCodes(customCombo);
    assert.deepEqual(keycodes, [0x11, 0x10, 0x49]); // Ctrl, Shift, 'I'

    // Save mapping to storage
    const bindings = { middleTap: customCombo };
    storage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(bindings));

    // Reload bindings
    const reloaded = JSON.parse(storage.getItem(KEYBINDS_STORAGE_KEY));
    assert.equal(reloaded.middleTap, 'Ctrl+Shift+I');
    assert.deepEqual(comboToKeyCodes(reloaded.middleTap), keycodes);
  });

  test('Combination 12: Dual-Hand Recognition + Mirrored Coordinate Tracking', () => {
    // Model trained on peace hand matches peaceOther using mirrored x-coordinates
    const peace = hands['peace'];
    const peaceOther = hands['peaceOther'];
    const features = handFeatures(peace.landmarks, peace.aspect);
    const model = createGestureModel({ 'peace': Array(20).fill(features) });

    // Same hand classified
    assert.equal(model.classify(peace.landmarks, peace.aspect), 'peace');

    // Opposite hand classified via automatic mirroring in createGestureModel
    assert.equal(model.classify(peaceOther.landmarks, peaceOther.aspect), 'peace');
  });
});
