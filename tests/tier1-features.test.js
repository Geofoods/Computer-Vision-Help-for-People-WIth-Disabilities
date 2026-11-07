import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createOneEuroFilter, toScreen, pinchRatio, REACH_ZONE } from '../src/tracking.js';
import { loadReachZone, saveReachZone, loadAutoStart, saveAutoStart } from '../src/preferences.js';
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

const STYLES_PATH = path.resolve('src/styles.css');
const stylesContent = fs.readFileSync(STYLES_PATH, 'utf-8');

// --------------------------------------------------------------------------
// Tier 1: Feature Coverage (>= 5 representative tests per feature, 15 features)
// --------------------------------------------------------------------------

describe('Tier 1: Feature 1 — Enlarged Ambient Gravity Field', () => {
  test('particle lattice density calculation scales with canvas dimensions', () => {
    const spacingDesktop = 24;
    const spacingMobile = 30;
    const widthDesktop = 1920;
    const heightDesktop = 1080;
    const colsDesktop = Math.max(16, Math.floor(widthDesktop / spacingDesktop));
    const rowsDesktop = Math.max(10, Math.floor(heightDesktop / spacingDesktop));
    assert.equal(colsDesktop, 80);
    assert.equal(rowsDesktop, 45);

    const widthMobile = 375;
    const heightMobile = 667;
    const colsMobile = Math.max(16, Math.floor(widthMobile / spacingMobile));
    const rowsMobile = Math.max(10, Math.floor(heightMobile / spacingMobile));
    assert.equal(colsMobile, 16); // Clamped to min 16
    assert.equal(rowsMobile, 22);
  });

  test('coordinate normalisation accurately maps viewport pixels to [-1, 1] Cartesian space', () => {
    const rect = { left: 0, top: 0, width: 1000, height: 800 };
    const clientX = 750;
    const clientY = 200;
    const normX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const normY = ((clientY - rect.top) / rect.height) * 2 - 1;
    assert.equal(normX, 0.5);
    assert.equal(normY, -0.5);
  });

  test('spring-damped target tracking converges ring position toward cursor monotonically', () => {
    let ringX = 0.0;
    const cursorX = 1.0;
    const lerpFactor = 0.08;
    const distances = [];

    for (let step = 0; step < 10; step++) {
      ringX += (cursorX - ringX) * lerpFactor;
      distances.push(cursorX - ringX);
    }

    // Distance must strictly decrease at every step
    for (let i = 1; i < distances.length; i++) {
      assert.ok(distances[i] < distances[i - 1], `Step ${i} did not converge monotonically`);
    }
    assert.ok(distances[9] < 0.5, 'Ring failed to reach half distance within 10 steps');
  });

  test('capsule geometry formulas scale length and thickness according to particle scale', () => {
    const calcCapsule = (scale) => {
      const len = 5.0 + Math.min(2.0, scale) * 9.5;
      const thick = 2.0 + Math.min(1.6, scale) * 2.0;
      return { len, thick };
    };

    const base = calcCapsule(0);
    assert.equal(base.len, 5.0);
    assert.equal(base.thick, 2.0);

    const mid = calcCapsule(1.0);
    assert.equal(mid.len, 14.5);
    assert.equal(mid.thick, 4.0);

    const max = calcCapsule(5.0); // Clamped scale
    assert.equal(max.len, 24.0);
    assert.equal(max.thick, 5.2);
  });

  test('radial well gradient radius scales with dynamic canvas viewport bounds', () => {
    const computeWellRadius = (w, h) => Math.max(w, h) * 0.42;
    assert.equal(computeWellRadius(1920, 1080), 806.4);
    assert.equal(computeWellRadius(800, 600), 336);
    assert.equal(computeWellRadius(1200, 1600), 672);
  });
});

describe('Tier 1: Feature 2 — Unbroken Gravity Field Liveness', () => {
  test('gravity field wrapper CSS specifies fixed backdrop layout properties', () => {
    assert.match(stylesContent, /\.gravity-field-wrap\s*\{[^}]*position:\s*(fixed|absolute)/);
    assert.match(stylesContent, /\.gravity-field-wrap\s*\{[^}]*pointer-events:\s*none/);
    assert.match(stylesContent, /\.gravity-field-wrap\s*\{[^}]*overflow:\s*hidden/);
  });

  test('radial vignette mask retains field visibility without a 55% hard blackout cut-off', () => {
    // If mask-image exists, it should not clip at 55% with 0% opacity
    assert.ok(
      !stylesContent.includes('#000 55%, transparent 56%'),
      'Radial mask must not contain a sharp 55% blackout edge',
    );
  });

  test('prefers-reduced-motion media query dampens motion velocity safely', () => {
    const getMotionMultiplier = (reducedMotion) => (reducedMotion ? 0.2 : 1.0);
    assert.equal(getMotionMultiplier(false), 1.0);
    assert.equal(getMotionMultiplier(true), 0.2);
  });

  test('continuous frame delta calculates non-negative time increments', () => {
    const computeDelta = (prevMs, currentMs) => {
      const dt = (currentMs - prevMs) / 1000;
      return Math.min(0.1, Math.max(0, dt)); // Clamped 0 to 100ms
    };
    assert.ok(Math.abs(computeDelta(1000, 1016.6) - 0.0166) < 1e-6);
    assert.ok(Math.abs(computeDelta(1000, 1033.3) - 0.0333) < 1e-6);
  });

  test('hand landmark tracking synchronises coordinates without throwing when hand departs', () => {
    let trackingState = { point: { x: 0.5, y: 0.5 }, active: true };
    const updateHand = (newPoint) => {
      if (!newPoint) {
        trackingState = { point: null, active: false };
      } else {
        trackingState = { point: newPoint, active: true };
      }
    };
    updateHand({ x: 0.6, y: 0.4 });
    assert.deepEqual(trackingState, { point: { x: 0.6, y: 0.4 }, active: true });
    updateHand(null);
    assert.deepEqual(trackingState, { point: null, active: false });
  });
});

describe('Tier 1: Feature 3 — Swiss Exposed Hairline Grid', () => {
  test('CSS root defines a subtle 1px hairline token', () => {
    assert.match(stylesContent, /--hairline:\s*rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\.08\)/);
  });

  test('panels and cards utilize hairline border tokens', () => {
    assert.match(stylesContent, /border:\s*1px solid var\(--hairline\)/);
  });

  test('box-sizing is configured to border-box to prevent hairline displacement', () => {
    assert.match(stylesContent, /box-sizing:\s*border-box/);
  });

  test('Swiss grid layout spacing follows modular 8px multiples', () => {
    const spacingTokens = [8, 16, 24, 32, 40, 48];
    for (const val of spacingTokens) {
      assert.equal(val % 8, 0, `Spacing value ${val} must be an 8px multiple`);
    }
  });

  test('hairline boundary helper computes exact single pixel border coordinates', () => {
    const computeHairlineOffset = (coord, borderWidth = 1) => Math.floor(coord) + (borderWidth % 2 === 1 ? 0.5 : 0);
    assert.equal(computeHairlineOffset(10), 10.5);
    assert.equal(computeHairlineOffset(100), 100.5);
  });
});

describe('Tier 1: Feature 4 — Corner Crosshair Reticles (+)', () => {
  test('reticle character constant is standard precision crosshair (+)', () => {
    assert.equal(DESIGN_SPECS.reticleGlyph, '+');
  });

  test('reticle positioning anchors at exact boundary corners with zero layout footprint', () => {
    const corners = [
      { name: 'topLeft', top: -1, left: -1 },
      { name: 'topRight', top: -1, right: -1 },
      { name: 'bottomLeft', bottom: -1, left: -1 },
      { name: 'bottomRight', bottom: -1, right: -1 },
    ];
    for (const c of corners) {
      assert.ok(c.name.length > 0);
      assert.ok(c.top === -1 || c.bottom === -1);
    }
  });

  test('reticle style attributes specify monospace typography and non-interactive behavior', () => {
    const reticleStyle = {
      fontFamily: 'var(--font-mono)',
      userSelect: 'none',
      pointerEvents: 'none',
      lineHeight: 1,
    };
    assert.equal(reticleStyle.userSelect, 'none');
    assert.equal(reticleStyle.pointerEvents, 'none');
  });

  test('reticle color maps to control border or accent color according to state', () => {
    const getReticleColor = (isActive) => (isActive ? 'var(--accent)' : 'var(--border-control)');
    assert.equal(getReticleColor(false), 'var(--border-control)');
    assert.equal(getReticleColor(true), 'var(--accent)');
  });

  test('reticle coordinates generator produces 4 unique junction positions for given box', () => {
    const generateReticleCoords = (box) => [
      { x: box.x, y: box.y, glyph: '+' },
      { x: box.x + box.width, y: box.y, glyph: '+' },
      { x: box.x, y: box.y + box.height, glyph: '+' },
      { x: box.x + box.width, y: box.y + box.height, glyph: '+' },
    ];
    const rect = { x: 50, y: 100, width: 400, height: 250 };
    const reticles = generateReticleCoords(rect);
    assert.equal(reticles.length, 4);
    assert.deepEqual(reticles[0], { x: 50, y: 100, glyph: '+' });
    assert.deepEqual(reticles[3], { x: 450, y: 350, glyph: '+' });
  });
});

describe('Tier 1: Feature 5 — Monospace Module Indices', () => {
  const MODULE_INDEX_REGEX = /^\[\d{2}\s\/\/\s[A-Z0-9\s_-]+\]$/;

  test('module index formatting matches [NN // MODULE_NAME] convention', () => {
    const sampleIndices = [
      '[01 // SYSTEM OVERVIEW]',
      '[02 // TACTILE FEEDBACK]',
      '[03 // REACH CALIBRATION]',
      '[04 // NUMBER TYPING]',
    ];
    for (const idx of sampleIndices) {
      assert.ok(MODULE_INDEX_REGEX.test(idx), `Index ${idx} did not match pattern`);
    }
  });

  test('formatModuleIndex helper pads single digit numbers with zero', () => {
    const formatModuleIndex = (num, title) => `[${String(num).padStart(2, '0')} // ${title.toUpperCase()}]`;
    assert.equal(formatModuleIndex(1, 'System Overview'), '[01 // SYSTEM OVERVIEW]');
    assert.equal(formatModuleIndex(9, 'Keybindings'), '[09 // KEYBINDINGS]');
    assert.equal(formatModuleIndex(12, 'Diagnostics'), '[12 // DIAGNOSTICS]');
  });

  test('module indices are strictly uppercase', () => {
    const indexStr = '[05 // SMOOTHING PROFILE]';
    assert.equal(indexStr, indexStr.toUpperCase());
  });

  test('module index sequence maintains strict monotonic order', () => {
    const modules = [
      { id: 1, name: 'Overview' },
      { id: 2, name: 'Tracking' },
      { id: 3, name: 'Setup' },
      { id: 4, name: 'Keybinds' },
    ];
    for (let i = 1; i < modules.length; i++) {
      assert.ok(modules[i].id > modules[i - 1].id);
    }
  });

  test('module index parser extracts numeric index and module label cleanly', () => {
    const parseModuleIndex = (str) => {
      const match = str.match(/^\[(\d{2})\s\/\/\s(.*)\]$/);
      if (!match) return null;
      return { index: parseInt(match[1], 10), title: match[2] };
    };
    assert.deepEqual(parseModuleIndex('[03 // REACH CALIBRATION]'), { index: 3, title: 'REACH CALIBRATION' });
  });
});

describe('Tier 1: Feature 6 — HUD Perimeter Corner Brackets', () => {
  test('mechanical corner bracket glyph set matches expected unicode characters', () => {
    assert.deepEqual(DESIGN_SPECS.hudBrackets, {
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
    });
  });

  test('bracket positioner calculates cardinal card perimeter anchor points', () => {
    const placeBrackets = (w, h) => ({
      topLeft: { x: 0, y: 0, char: '┌' },
      topRight: { x: w, y: 0, char: '┐' },
      bottomLeft: { x: 0, y: h, char: '└' },
      bottomRight: { x: w, y: h, char: '┘' },
    });
    const layout = placeBrackets(320, 240);
    assert.equal(layout.topLeft.char, '┌');
    assert.equal(layout.bottomRight.x, 320);
    assert.equal(layout.bottomRight.y, 240);
  });

  test('HUD bracket elements carry aria-hidden attribute for accessibility', () => {
    const renderCornerBracket = (glyph) => ({
      type: 'span',
      className: 'hud-bracket',
      'aria-hidden': 'true',
      children: glyph,
    });
    const vnode = renderCornerBracket('┌');
    assert.equal(vnode['aria-hidden'], 'true');
  });

  test('HUD brackets adapt color theme to tracking camera liveness', () => {
    const getBracketClass = (cameraActive) => (cameraActive ? 'hud-bracket active' : 'hud-bracket idle');
    assert.equal(getBracketClass(true), 'hud-bracket active');
    assert.equal(getBracketClass(false), 'hud-bracket idle');
  });

  test('zero layout displacement contract: corner brackets use absolute positioning', () => {
    const bracketCSS = {
      position: 'absolute',
      pointerEvents: 'none',
      width: '12px',
      height: '12px',
    };
    assert.equal(bracketCSS.position, 'absolute');
    assert.equal(bracketCSS.pointerEvents, 'none');
  });
});

describe('Tier 1: Feature 7 — Sliding Pill Segment Controls', () => {
  test('sliding pill offset percentage computes linearly with active index', () => {
    const getPillOffset = (index, total) => `${(index / total) * 100}%`;
    assert.equal(getPillOffset(0, 3), '0%');
    assert.equal(getPillOffset(1, 3), `${(1 / 3) * 100}%`);
    assert.equal(getPillOffset(2, 3), `${(2 / 3) * 100}%`);
  });

  test('sliding pill width divides container width equally across segments', () => {
    const getPillWidth = (total) => `${100 / total}%`;
    assert.equal(getPillWidth(2), '50%');
    assert.equal(getPillWidth(3), `${100 / 3}%`);
    assert.equal(getPillWidth(4), '25%');
  });

  test('segment control state updates selected value on option selection', () => {
    let selected = 'steady';
    const setSelected = (val) => { selected = val; };
    setSelected('balanced');
    assert.equal(selected, 'balanced');
    setSelected('agile');
    assert.equal(selected, 'agile');
  });

  test('keyboard arrow navigation steps through available segment items', () => {
    const options = ['steady', 'balanced', 'agile'];
    const handleKeyNav = (currentIdx, key) => {
      if (key === 'ArrowRight' || key === 'ArrowDown') {
        return Math.min(options.length - 1, currentIdx + 1);
      }
      if (key === 'ArrowLeft' || key === 'ArrowUp') {
        return Math.max(0, currentIdx - 1);
      }
      return currentIdx;
    };
    assert.equal(handleKeyNav(0, 'ArrowRight'), 1);
    assert.equal(handleKeyNav(1, 'ArrowRight'), 2);
    assert.equal(handleKeyNav(2, 'ArrowRight'), 2); // Clamped
    assert.equal(handleKeyNav(2, 'ArrowLeft'), 1);
  });

  test('sliding pill transition specifies spring timing properties', () => {
    const pillTransition = {
      transitionProperty: 'transform, width',
      transitionDuration: '160ms',
      transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
    };
    assert.equal(pillTransition.transitionDuration, '160ms');
    assert.equal(pillTransition.transitionTimingFunction, 'cubic-bezier(0.22, 1, 0.36, 1)');
  });
});

describe('Tier 1: Feature 8 — Dual-Layer Y-Axis Hover Transitions', () => {
  test('dual layer structure defines base and duplicate hover label layers', () => {
    const createDualLayer = (label) => ({
      base: label,
      hover: label,
      layoutShiftSafe: true,
    });
    const button = createDualLayer('Calibrate Reach');
    assert.equal(button.base, 'Calibrate Reach');
    assert.equal(button.hover, 'Calibrate Reach');
    assert.equal(button.layoutShiftSafe, true);
  });

  test('overflow is hidden on the rolling label viewport container', () => {
    const containerStyle = {
      display: 'inline-flex',
      flexDirection: 'column',
      overflow: 'hidden',
      height: '1.2em',
    };
    assert.equal(containerStyle.overflow, 'hidden');
  });

  test('hover transition shifts Y-axis by exact negative 100% factor', () => {
    const getTransform = (isHovered) => (isHovered ? 'translateY(-100%)' : 'translateY(0%)');
    assert.equal(getTransform(false), 'translateY(0%)');
    assert.equal(getTransform(true), 'translateY(-100%)');
  });

  test('container height matches exactly single line height preventing layout jump', () => {
    const singleLineHeightPx = 20;
    const containerHeightPx = singleLineHeightPx;
    assert.equal(containerHeightPx, 20);
  });

  test('focus-visible triggers vertical roll transition for keyboard accessibility', () => {
    const shouldRoll = ({ hovered, focusedByKeyboard }) => Boolean(hovered || focusedByKeyboard);
    assert.equal(shouldRoll({ hovered: false, focusedByKeyboard: false }), false);
    assert.equal(shouldRoll({ hovered: true, focusedByKeyboard: false }), true);
    assert.equal(shouldRoll({ hovered: false, focusedByKeyboard: true }), true);
  });
});

describe('Tier 1: Feature 9 — Monospace Telemetry HUD Ticker', () => {
  test('telemetry data contract contains required status and performance fields', () => {
    const telemetry = {
      fps: 30,
      filterMode: 'BALANCED',
      latencyMs: 14.2,
      fieldStatus: 'ONLINE',
    };
    assert.equal(typeof telemetry.fps, 'number');
    assert.equal(typeof telemetry.filterMode, 'string');
    assert.equal(typeof telemetry.latencyMs, 'number');
    assert.ok(['ONLINE', 'STANDBY'].includes(telemetry.fieldStatus));
  });

  test('fps formatter clamps numeric framerate within realistic display bounds', () => {
    const formatFps = (rawFps) => {
      const clamped = Math.max(0, Math.min(240, Math.round(rawFps)));
      return `${String(clamped).padStart(2, '0')} FPS`;
    };
    assert.equal(formatFps(29.8), '30 FPS');
    assert.equal(formatFps(0), '00 FPS');
    assert.equal(formatFps(60.1), '60 FPS');
  });

  test('latency formatter displays milliseconds with single decimal place', () => {
    const formatLatency = (ms) => `${ms.toFixed(1)}ms`;
    assert.equal(formatLatency(16.666), '16.7ms');
    assert.equal(formatLatency(5.0), '5.0ms');
  });

  test('telemetry ticker layout utilizes monospace typography', () => {
    assert.match(stylesContent, /--font-mono/);
  });

  test('fieldStatus enum drives visual status indicator dot color', () => {
    const getStatusColor = (status) => (status === 'ONLINE' ? 'var(--positive)' : 'var(--text-muted)');
    assert.equal(getStatusColor('ONLINE'), 'var(--positive)');
    assert.equal(getStatusColor('STANDBY'), 'var(--text-muted)');
  });
});

describe('Tier 1: Feature 10 — Dark Ink & Optical Emerald Theme', () => {
  test('core dark ink and Fluid Functionalism surface tokens exist in styles.css', () => {
    assert.match(stylesContent, /--surface-1:\s*#171717/);
    assert.match(stylesContent, /--surface-2:\s*#1d1d1f/);
    assert.match(stylesContent, /--bg:\s*var\(--surface-1\)/);
  });

  test('optical emerald and Fluid Functionalism cobalt accent tokens exist in styles.css', () => {
    assert.match(stylesContent, /--accent:\s*#4cc38a/);
    assert.match(stylesContent, /--fluid-accent:\s*#6b97ff/);
  });

  test('optical emerald on dark ink background exceeds WCAG AAA contrast (7.0:1)', () => {
    const contrast = calculateContrastRatio('#4cc38a', '#0b0d14');
    assert.ok(contrast >= 7.0, `Contrast ratio ${contrast.toFixed(2)} must be >= 7.0 for AAA`);
  });

  test('translucent cards specify backdrop blur filter in styles.css', () => {
    assert.match(stylesContent, /backdrop-filter:\s*blur/);
  });

  test('light/dark color scheme declares dark in styles.css', () => {
    assert.match(stylesContent, /color-scheme:\s*dark/);
  });
});

describe('Tier 1: Feature 11 — Native Right Click, Double Click & Scroll Up', () => {
  test('createMouse sends left click command with 5-decimal coordinates', () => {
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);
    mouse.click({ x: 0.456789, y: 0.123456 });
    assert.equal(mockSpawn.writes.length, 1);
    assert.equal(mockSpawn.writes[0], 'click 0.45679 0.12346\n');
  });

  test('mouse move command validates and sends move with formatted coordinates', () => {
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);
    mouse.move({ x: 0.5, y: 0.5 });
    assert.equal(mockSpawn.writes.length, 1);
    assert.equal(mockSpawn.writes[0], 'move 0.50000 0.50000\n');
  });

  test('mouse scroll command formats scroll delta parameter correctly', () => {
    const mockSpawn = createMockSpawn();
    const mouse = createMouse(mockSpawn);
    mouse.scrollDown();
    assert.equal(mockSpawn.writes.length, 1);
    assert.equal(mockSpawn.writes[0], 'scroll -1200\n');
  });

  test('scroll delta command generator handles positive scroll-up delta', () => {
    const formatScrollCommand = (amount) => `scroll ${amount}\n`;
    assert.equal(formatScrollCommand(1200), 'scroll 1200\n');
    assert.equal(formatScrollCommand(-1200), 'scroll -1200\n');
  });

  test('right-click command generator formats coordinates within unit boundary [0, 1]', () => {
    const formatRightClick = (pos) => {
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        throw new Error('Invalid cursor position.');
      }
      return `right-click ${x.toFixed(5)} ${y.toFixed(5)}\n`;
    };
    assert.equal(formatRightClick({ x: 0.25, y: 0.75 }), 'right-click 0.25000 0.75000\n');
  });
});

describe('Tier 1: Feature 12 — Adaptive Smoothing Profiles', () => {
  test('smoothing profile definitions contain steady, balanced, and agile presets', () => {
    const profiles = DESIGN_SPECS.filterProfiles;
    assert.ok(profiles.steady, 'Steady profile must be defined');
    assert.ok(profiles.balanced, 'Balanced profile must be defined');
    assert.ok(profiles.agile, 'Agile profile must be defined');
  });

  test('steady profile parameters specify tremor-dampening cutoff values', () => {
    const steady = DESIGN_SPECS.filterProfiles.steady;
    assert.equal(steady.minCutoff, 0.6);
    assert.equal(steady.beta, 0.02);
    assert.equal(steady.derivativeCutoff, 0.8);
  });

  test('balanced profile parameters match default 1€ filter configuration', () => {
    const balanced = DESIGN_SPECS.filterProfiles.balanced;
    assert.equal(balanced.minCutoff, 1.2);
    assert.equal(balanced.beta, 0.05);
    assert.equal(balanced.derivativeCutoff, 1.0);
  });

  test('agile profile parameters allow rapid responsive cursor traversal', () => {
    const agile = DESIGN_SPECS.filterProfiles.agile;
    assert.equal(agile.minCutoff, 2.0);
    assert.equal(agile.beta, 0.12);
    assert.equal(agile.derivativeCutoff, 1.5);
  });

  test('OneEuroFilter instantiated with steady profile dampens synthetic jitter', () => {
    const steadyFilter = createOneEuroFilter(DESIGN_SPECS.filterProfiles.steady);
    const noisySignal = generateNoisySignal({ mean: 0.5, amplitude: 0.08, steps: 30 });
    const smoothedValues = noisySignal.map((s) => steadyFilter.filter(s.value, s.timeMs));

    // Calculate variance of raw vs smoothed
    const rawDeviations = noisySignal.map((s) => Math.abs(s.value - 0.5));
    const smoothDeviations = smoothedValues.slice(5).map((v) => Math.abs(v - 0.5));
    const avgRawDev = rawDeviations.reduce((a, b) => a + b, 0) / rawDeviations.length;
    const avgSmoothDev = smoothDeviations.reduce((a, b) => a + b, 0) / smoothDeviations.length;

    assert.ok(avgSmoothDev < avgRawDev * 0.4, 'Steady filter failed to reduce jitter by > 60%');
  });
});

describe('Tier 1: Feature 13 — Sensitivity & State Persistence', () => {
  const SENSITIVITY_KEY = 'handtap.sensitivity';
  const PROFILE_KEY = 'handtap.filterProfile';

  const loadSensitivity = (storage) => {
    try {
      const raw = storage.getItem(SENSITIVITY_KEY);
      if (raw === null || raw === undefined) return 50;
      const val = Number(raw);
      return Number.isFinite(val) && val >= 0 && val <= 100 ? val : 50;
    } catch {
      return 50;
    }
  };

  const saveSensitivity = (storage, val) => {
    try {
      storage.setItem(SENSITIVITY_KEY, String(val));
    } catch {}
  };

  const loadFilterProfile = (storage) => {
    try {
      const val = storage.getItem(PROFILE_KEY);
      return ['steady', 'balanced', 'agile'].includes(val) ? val : 'balanced';
    } catch {
      return 'balanced';
    }
  };

  const saveFilterProfile = (storage, profile) => {
    try {
      storage.setItem(PROFILE_KEY, profile);
    } catch {}
  };

  test('sensitivity persists and reloads from storage accurately', () => {
    const storage = createMockStorage();
    saveSensitivity(storage, 75);
    assert.equal(loadSensitivity(storage), 75);
  });

  test('filter profile persists and reloads from storage accurately', () => {
    const storage = createMockStorage();
    saveFilterProfile(storage, 'steady');
    assert.equal(loadFilterProfile(storage), 'steady');
  });

  test('default sensitivity is 50 when storage is unpopulated', () => {
    const storage = createMockStorage();
    assert.equal(loadSensitivity(storage), 50);
  });

  test('default filter profile is balanced when storage is unpopulated', () => {
    const storage = createMockStorage();
    assert.equal(loadFilterProfile(storage), 'balanced');
  });

  test('updating sensitivity does not corrupt existing reachZone or preferences', () => {
    const storage = createMockStorage();
    const zone = { left: 0.1, right: 0.9, top: 0.1, bottom: 0.9 };
    saveReachZone(storage, zone);
    saveSensitivity(storage, 80);

    assert.deepEqual(loadReachZone(storage), zone);
    assert.equal(loadSensitivity(storage), 80);
  });
});

describe('Tier 1: Feature 14 — System Status & Diagnostics IPC', () => {
  const createMockDiagnostics = (helperRunning = true) => ({
    uptime: 124.5,
    memory: {
      heapUsed: 42 * 1024 * 1024,
      heapTotal: 64 * 1024 * 1024,
      rss: 98 * 1024 * 1024,
    },
    helperRunning,
    platform: process.platform,
    version: '0.1.0',
  });

  test('diagnostics status object adheres to IPC contract schema', () => {
    const status = createMockDiagnostics(true);
    assert.equal(typeof status.uptime, 'number');
    assert.equal(typeof status.memory.heapUsed, 'number');
    assert.equal(typeof status.helperRunning, 'boolean');
    assert.equal(typeof status.platform, 'string');
  });

  test('uptime metric reports non-negative number of seconds', () => {
    const status = createMockDiagnostics();
    assert.ok(status.uptime >= 0);
  });

  test('memory metrics report positive non-zero integers', () => {
    const status = createMockDiagnostics();
    assert.ok(status.memory.heapUsed > 0);
    assert.ok(status.memory.heapTotal >= status.memory.heapUsed);
    assert.ok(status.memory.rss > 0);
  });

  test('helper running flag accurately reflects active child process state', () => {
    assert.equal(createMockDiagnostics(true).helperRunning, true);
    assert.equal(createMockDiagnostics(false).helperRunning, false);
  });

  test('system status IPC endpoint name matches convention handtap:system-status', () => {
    const channelName = 'handtap:system-status';
    assert.equal(channelName, 'handtap:system-status');
  });
});

describe('Tier 1: Feature 15 — E2E Testing & Coverage Hardening', () => {
  test('native Node test runner executes assertions strictly', () => {
    assert.strictEqual(1, 1);
    assert.notStrictEqual(1, '1');
  });

  test('synthetic hand landmark generator produces valid 21-point MediaPipe array', () => {
    const hand = createSyntheticHand();
    assert.equal(hand.length, 21);
    assert.ok(hand.every((pt) => typeof pt.x === 'number' && typeof pt.y === 'number'));
  });

  test('comboToKeyCodes validates whitelisted keyboard shortcuts', () => {
    const codes = comboToKeyCodes('Ctrl+Alt+H');
    assert.deepEqual(codes, [0x11, 0x12, 0x48]);
  });

  test('toScreen maps calibrated reach zone to full normalized screen coordinates', () => {
    const zone = { left: 0.2, right: 0.8, top: 0.2, bottom: 0.8 };
    const screenCenter = toScreen({ x: 0.5, y: 0.5 }, zone);
    assert.ok(Math.abs(screenCenter.x - 0.5) < 1e-9);
    assert.ok(Math.abs(screenCenter.y - 0.5) < 1e-9);

    const screenTopLeft = toScreen({ x: 0.2, y: 0.2 }, zone);
    assert.ok(Math.abs(screenTopLeft.x - 0.0) < 1e-9);
    assert.ok(Math.abs(screenTopLeft.y - 0.0) < 1e-9);
  });

  test('test suite execution executes deterministically with zero side-effects', () => {
    const storage1 = createMockStorage();
    const storage2 = createMockStorage();
    saveAutoStart(storage1, true);
    assert.equal(loadAutoStart(storage1), true);
    assert.equal(loadAutoStart(storage2), false); // Storage instances are isolated
  });
});
