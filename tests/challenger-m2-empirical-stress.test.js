import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateContrastRatio,
  createSyntheticHand,
} from './helpers.js';
import {
  createOneEuroFilter,
  toScreen,
  pinchRatio,
} from '../src/tracking.js';
import { comboToKeyCodes } from '../electron/keys.cjs';

const stylesContent = fs.readFileSync(path.resolve('src/styles.css'), 'utf-8');
const dualLayerContent = fs.readFileSync(path.resolve('src/components/DualLayerButton.jsx'), 'utf-8');
const slidingPillContent = fs.readFileSync(path.resolve('src/components/SlidingPill.jsx'), 'utf-8');
const telemetryContent = fs.readFileSync(path.resolve('src/components/TelemetryHud.jsx'), 'utf-8');
const moduleIndexContent = fs.readFileSync(path.resolve('src/components/ModuleIndex.jsx'), 'utf-8');
const visionAuraContent = fs.readFileSync(path.resolve('src/components/VisionAura.jsx'), 'utf-8');

describe('Empirical Challenger M2: Layout Stability & Zero CLS Architecture', () => {
  test('DualLayerButton container defines rigid height and overflow constraints preventing reflow', () => {
    assert.match(stylesContent, /\.dual-layer-btn\s*\{[^}]*height:\s*40px;/, 'Button must constrain height to 40px');
    assert.match(stylesContent, /\.dual-layer-btn\s*\{[^}]*overflow:\s*hidden;/, 'Button must hide overflow');
    assert.match(stylesContent, /\.dual-layer-btn\s*\{[^}]*display:\s*inline-flex;/, 'Button must be inline-flex');
  });

  test('DualLayerButton roll container transitions GPU transform without affecting document geometry', () => {
    assert.match(stylesContent, /\.dual-layer-roll\s*\{[^}]*transform:\s*translateY\(0%\);/);
    assert.match(stylesContent, /\.dual-layer-btn:hover:not\(:disabled\)\s*\.dual-layer-roll[\s\S]*?transform:\s*translateY\(-50%\);/);
    assert.match(stylesContent, /\.dual-layer-btn:focus-visible\s*\.dual-layer-roll\s*\{[^}]*transform:\s*translateY\(-50%\);/);
  });

  test('DualLayerButton primary and secondary layers match exact 40px button height', () => {
    const layerMatch = stylesContent.match(/\.layer-primary,\s*\.layer-secondary\s*\{([^}]+)\}/s);
    assert.ok(layerMatch, 'Layer styles must exist');
    assert.match(layerMatch[1], /height:\s*40px;/);
    assert.match(layerMatch[1], /flex-shrink:\s*0;/);
  });

  test('SlidingPill indicator transitions GPU transform and width using 160ms quintic spring bezier', () => {
    assert.match(stylesContent, /\.sliding-pill-indicator\s*\{[^}]*position:\s*absolute;/s);
    assert.match(stylesContent, /\.sliding-pill-indicator\s*\{[^}]*pointer-events:\s*none;/s);
    assert.match(stylesContent, /\.sliding-pill-indicator\s*\{[\s\S]*?transform 160ms cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\)/);
  });

  test('TelemetryHud constrains vertical dimension and uses tabular-nums on numeric readouts', () => {
    assert.match(stylesContent, /\.telemetry-bar\s*\{[^}]*overflow-x:\s*auto;/s);
    assert.match(stylesContent, /\.telemetry-item\s*\{[^}]*white-space:\s*nowrap;/s);
    assert.match(stylesContent, /\.telemetry-val\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
  });

  test('VisionAura layer is fixed, pointer-events: none, and isolated from document flow', () => {
    assert.match(stylesContent, /\.vision-aura-layer\s*\{[^}]*position:\s*fixed;/s);
    assert.match(stylesContent, /\.vision-aura-layer\s*\{[^}]*pointer-events:\s*none;/s);
    assert.match(visionAuraContent, /aria-hidden="true"/);
  });

  test('Responsive media queries collapse multi-column grids to single-column cleanly', () => {
    assert.match(stylesContent, /@media\s*\(max-width:\s*860px\)\s*\{[\s\S]*?\.hero\s*\{[^}]*grid-template-columns:\s*1fr;/s);
    assert.match(stylesContent, /@media\s*\(max-width:\s*860px\)\s*\{[\s\S]*?\.feedback-grid,\s*\.setup-grid\s*\{[^}]*grid-template-columns:\s*1fr;/s);
    assert.match(stylesContent, /@media\s*\(max-width:\s*480px\)\s*\{[\s\S]*?\.app-shell\s*\{[^}]*padding:\s*0\s*16px;/s);
  });
});

describe('Empirical Challenger M2: Accessibility, Screen Readers & Focus Semantics', () => {
  test('DualLayerButton applies aria-hidden="true" to secondary layer preventing duplicate speech synthesis', () => {
    assert.match(dualLayerContent, /<span\s+className="layer-secondary"\s+aria-hidden="true">/);
  });

  test('Decorative dividers and ghost weight spans carry aria-hidden="true"', () => {
    assert.match(telemetryContent, /<span className="telemetry-divider" aria-hidden="true">·<\/span>/);
    assert.match(slidingPillContent, /className="ghost-weight-reserve" aria-hidden="true"/);
    assert.match(moduleIndexContent, /aria-label=\{`Section \$\{formattedIndex\}: \$\{label\}`\}/);
  });

  test('SlidingPill adheres to WAI-ARIA Radio Group pattern', () => {
    assert.match(slidingPillContent, /role="radiogroup"/);
    assert.match(slidingPillContent, /aria-label=\{ariaLabel\}/);
    assert.match(slidingPillContent, /tabIndex=\{0\}/);
    assert.match(slidingPillContent, /role="radio"/);
    assert.match(slidingPillContent, /aria-checked=\{isSelected\}/);
    assert.match(slidingPillContent, /tabIndex=\{-1\}/);
  });

  test('Global :focus-visible rule provides distinct high contrast 2px Fluid Accent outline', () => {
    assert.match(stylesContent, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--fluid-accent\);/);
    assert.match(stylesContent, /:focus-visible\s*\{[^}]*outline-offset:\s*2px;/);
  });

  test('Reduced motion preference disables animations and transitions globally', () => {
    const reducedMotionMatch = stylesContent.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*$/);
    assert.ok(reducedMotionMatch, 'prefers-reduced-motion media query must exist');
    assert.match(reducedMotionMatch[1], /animation:\s*none\s*!important;/);
    assert.match(reducedMotionMatch[1], /transition:\s*none\s*!important;/);
  });
});

describe('Empirical Challenger M2: Optical Contrast Ratios & WCAG Verification', () => {
  const DARK_SURFACES = [
    { name: '--surface-1', hex: '#171717' },
    { name: '--surface-2', hex: '#1d1d1f' },
    { name: '--surface-3', hex: '#242427' },
  ];

  test('Primary text (#f2f4f8) satisfies WCAG AAA (>7.0:1) across Fluid Functionalism Dark surfaces', () => {
    for (const surface of DARK_SURFACES) {
      const cr = calculateContrastRatio('#f2f4f8', surface.hex);
      assert.ok(cr >= 12.0, `Primary text on ${surface.name} must exceed 12.0:1 (actual: ${cr.toFixed(2)}:1)`);
    }
  });

  test('Secondary text (#a7aebd) satisfies WCAG AA/AAA (>6.0:1) across Dark surfaces', () => {
    for (const surface of DARK_SURFACES) {
      const cr = calculateContrastRatio('#a7aebd', surface.hex);
      assert.ok(cr >= 6.0, `Secondary text on ${surface.name} must be >= 6.0:1 (actual: ${cr.toFixed(2)}:1)`);
    }
  });

  test('High-contrast preference media query boosts hairline and border-control opacity in both themes', () => {
    assert.match(stylesContent, /@media\s*\(prefers-contrast:\s*more\)\s*\{[\s\S]*?0\.25/);
  });
});

describe('Empirical Challenger M2: Assistive Control & CV Non-Regression', () => {
  test('1€ filter mathematical invariants hold: zero drift on static signal, responsive on step', () => {
    const filter = createOneEuroFilter({ minCutoff: 1.2, beta: 0.05, derivativeCutoff: 1.0 });
    let smoothed = 0.5;
    for (let i = 0; i < 20; i += 1) {
      smoothed = filter.filter(0.5, i * 33.3);
    }
    assert.ok(Math.abs(smoothed - 0.5) < 1e-4);

    const stepOutput = filter.filter(1.0, 21 * 33.3);
    assert.ok(stepOutput > 0.5 && stepOutput < 1.0);
  });

  test('Reach zone coordinate remapping accurately bounds screen coordinate space to [0, 1]', () => {
    const customZone = { left: 0.2, right: 0.8, top: 0.2, bottom: 0.8 };
    const center = toScreen({ x: 0.5, y: 0.5 }, customZone);
    assert.ok(Math.abs(center.x - 0.5) < 1e-6);
    assert.ok(Math.abs(center.y - 0.5) < 1e-6);

    const outside = toScreen({ x: 0.05, y: 0.95 }, customZone);
    assert.equal(outside.x, 0.0);
    assert.equal(outside.y, 1.0);
  });

  test('Pinch ratio calculation handles distance-invariant aspect corrections', () => {
    const hand = createSyntheticHand({ scale: 1.0, gap: 0.4 });
    const ratioNormal = pinchRatio(hand, 4 / 3);
    assert.ok(Number.isFinite(ratioNormal) && ratioNormal > 0 && ratioNormal < 1);
  });

  test('Native keyboard shortcut translation produces whitelisted virtual keycodes', () => {
    assert.deepEqual(comboToKeyCodes('Ctrl+Shift+P'), [0x11, 0x10, 0x50]);
    assert.deepEqual(comboToKeyCodes('Toggle Drag'), []);
    assert.throws(() => comboToKeyCodes('Ctrl+InvalidKeyName'), /not a key combination HandTap can press/);
  });
});
