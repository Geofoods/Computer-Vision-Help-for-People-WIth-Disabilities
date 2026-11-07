import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  FILTER_PROFILES,
  createOneEuroFilter,
  createHoldDetector,
  createDigitDetector,
} from '../src/tracking.js';
import {
  loadSensitivity,
  saveSensitivity,
  loadFilterProfile,
  saveFilterProfile,
  loadTheme,
  saveTheme,
  loadShape,
  saveShape,
  loadOverlayEnabled,
  saveOverlayEnabled,
} from '../src/preferences.js';
import { PRESET_GROUPS } from '../src/keybinds.js';
import { pickNearest } from '../src/hooks/useFluidHover.js';

const require = createRequire(import.meta.url);
const { createMouse } = require('../electron/mouse.cjs');
const { comboToKeyCodes, ACTIONS } = require('../electron/keys.cjs');
const hands = JSON.parse(
  fs.readFileSync(new URL('../src/fixtures/real-hands.json', import.meta.url), 'utf8'),
);
const mainJsxContent = fs.readFileSync(path.resolve('src/main.jsx'), 'utf8');
const workerContent = fs.readFileSync(path.resolve('src/hand-worker.js'), 'utf8');

function createMockSpawn() {
  const writes = [];
  let stdinOn = {};
  const mockChild = {
    stdin: {
      write: (cmd) => writes.push(cmd),
      end: () => {},
      on: (ev, handler) => {
        stdinOn[ev] = handler;
      },
    },
    on: () => {},
  };
  const spawnFn = () => mockChild;
  spawnFn.writes = writes;
  return spawnFn;
}

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
}

test('Milestone 3+: Backend Refinements, Drag Lock, Hold Progress & Real Telemetry', async (t) => {
  await t.test('1. createMouse native rightClick, doubleClick, scrollUp, and scroll delta', () => {
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);

    assert.equal(mouse.isHelperRunning(), false);

    mouse.rightClick({ x: 0.123456, y: 0.654321 });
    assert.equal(mockSpawn.writes.length, 1);
    assert.equal(mockSpawn.writes[0], 'right-click 0.12346 0.65432\n');
    assert.equal(mouse.isHelperRunning(), true);

    mouse.doubleClick({ x: 0.5, y: 0.5 });
    assert.equal(mockSpawn.writes.length, 2);
    assert.equal(mockSpawn.writes[1], 'double-click 0.50000 0.50000\n');

    mouse.scrollUp();
    assert.equal(mockSpawn.writes.length, 3);
    assert.equal(mockSpawn.writes[2], 'scroll 1200\n');

    mouse.scroll(-600);
    assert.equal(mockSpawn.writes.length, 4);
    assert.equal(mockSpawn.writes[3], 'scroll -600\n');

    mouse.dispose();
    assert.equal(mouse.isHelperRunning(), false);
  });

  await t.test('2. Toggle Drag (mouse-down / mouse-up) state machine and safety auto-release on dispose', () => {
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);

    assert.equal(mouse.isDragging(), false);
    const first = mouse.toggleDrag({ x: 0.25, y: 0.75 });
    assert.equal(first, true);
    assert.equal(mouse.isDragging(), true);
    assert.equal(mockSpawn.writes[0], 'mouse-down 0.25000 0.75000\n');

    const second = mouse.toggleDrag({ x: 0.4, y: 0.6 });
    assert.equal(second, false);
    assert.equal(mouse.isDragging(), false);
    assert.equal(mockSpawn.writes[1], 'mouse-up 0.40000 0.60000\n');

    // Lock drag again and verify dispose() writes 'release\n' so button never sticks down
    mouse.toggleDrag({ x: 0.5, y: 0.5 });
    assert.equal(mouse.isDragging(), true);
    mouse.dispose();
    assert.equal(mouse.isDragging(), false);
    assert.equal(mockSpawn.writes[mockSpawn.writes.length - 1], 'release\n');
  });

  await t.test('3. keys.cjs ACTIONS whitelist and main.jsx complete action routing', () => {
    for (const action of [
      'Left Click',
      'Right Click',
      'Double Click',
      'Toggle Drag',
      'Scroll Down',
      'Scroll Up',
    ]) {
      assert.ok(ACTIONS.has(action), `${action} must be in ACTIONS`);
      assert.deepEqual(comboToKeyCodes(action), []);
    }

    // Verify main.jsx routes every native mouse/scroll action instead of falling through to pressKeys
    assert.match(mainJsxContent, /desktop\.rightClickAt\(/);
    assert.match(mainJsxContent, /desktop\.doubleClickAt\(/);
    assert.match(mainJsxContent, /desktop\.toggleDragAt\(/);
    assert.match(mainJsxContent, /desktop\.scrollUp\(/);
    assert.match(mainJsxContent, /desktop\.scrollDown\(/);
  });

  await t.test('4. createHoldDetector.progress() & createDigitDetector.progress() VisionOS ring telemetry', () => {
    const hold = createHoldDetector({ holdMs: 500 });
    assert.equal(hold.progress(1000), 0);

    assert.equal(hold.update(true, 1000), false);
    assert.ok(Math.abs(hold.progress(1250) - 0.5) < 1e-6);
    assert.ok(Math.abs(hold.progress(1400) - 0.8) < 1e-6);

    // Once fired at 1500ms, progress returns to 0 until released
    assert.equal(hold.update(true, 1500), true);
    assert.equal(hold.progress(1600), 0);

    // Digit detector progress ramps toward 1.0 before arming
    const digit = createDigitDetector({ holdFrames: 4, closedFrames: 2 });
    const pointing = hands.pointing;
    digit.update(pointing.landmarks, pointing.aspect);
    assert.deepEqual(digit.progress(), { candidate: '1', ratio: 0.25, armed: null });
    digit.update(pointing.landmarks, pointing.aspect);
    assert.deepEqual(digit.progress(), { candidate: '1', ratio: 0.5, armed: null });
  });

  await t.test('5. preferences.js sensitivity, filter, theme, shape & overlay persistence', () => {
    const storage = createMockStorage();

    assert.equal(loadSensitivity(storage), 50);
    assert.equal(loadFilterProfile(storage), 'balanced');
    assert.equal(loadTheme(storage), 'dark');
    assert.equal(loadShape(storage), 'rounded');
    assert.equal(loadOverlayEnabled(storage), true);

    saveSensitivity(storage, 72);
    assert.equal(loadSensitivity(storage), 72);

    saveFilterProfile(storage, 'steady');
    assert.equal(loadFilterProfile(storage), 'steady');

    saveTheme(storage, 'light');
    assert.equal(loadTheme(storage), 'light');

    saveShape(storage, 'pill');
    assert.equal(loadShape(storage), 'pill');

    saveOverlayEnabled(storage, false);
    assert.equal(loadOverlayEnabled(storage), false);

    // Invalid inputs safely fall back
    saveShape(storage, 'octagon');
    assert.equal(loadShape(storage), 'pill');
    saveSensitivity(storage, 150);
    assert.equal(loadSensitivity(storage), 50);
  });

  await t.test('6. Fluid Functionalism pickNearest 1D and 2D proximity hover solver', () => {
    const entries = [
      ['a', { left: 0, right: 100, top: 0, bottom: 50 }],
      ['b', { left: 110, right: 210, top: 0, bottom: 50 }],
      ['c', { left: 0, right: 100, top: 60, bottom: 110 }],
    ];

    assert.equal(pickNearest(entries, 50, 25, 'xy'), 'a');
    assert.equal(pickNearest(entries, 107, 25, 'xy'), 'b'); // Closer to b across gap
    assert.equal(pickNearest(entries, 40, 58, 'xy'), 'c'); // Closer to c vertically
    assert.equal(pickNearest(entries, 999, 95, 'y'), 'c'); // 1D y-axis ignores x
  });

  await t.test('7. hand-worker.js measures real inferenceMs and active GPU/CPU delegate', () => {
    assert.match(workerContent, /inferenceMs/);
    assert.match(workerContent, /delegate:\s*activeDelegate/);
    assert.doesNotMatch(mainJsxContent, /latencyMs=\{cameraOn\s*\?\s*14\.2/);
  });

  await t.test('8. keybinds.js preset groups include Right click, Double click, Toggle Drag, Scroll up', () => {
    const editingPresets = PRESET_GROUPS[0].presets.map((p) => p.combo);
    assert.ok(editingPresets.includes('Right Click'));
    assert.ok(editingPresets.includes('Double Click'));
    assert.ok(editingPresets.includes('Toggle Drag'));
    assert.ok(editingPresets.includes('Scroll Up'));

    for (const preset of PRESET_GROUPS[0].presets) {
      assert.doesNotThrow(() => comboToKeyCodes(preset.combo));
    }
  });
});
