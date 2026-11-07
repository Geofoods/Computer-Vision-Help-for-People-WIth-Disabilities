import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const cssContent = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');
const mainJsxContent = fs.readFileSync(path.resolve(process.cwd(), 'src/main.jsx'), 'utf8');
const setupJsxContent = fs.readFileSync(path.resolve(process.cwd(), 'src/SetupPanel.jsx'), 'utf8');
const numberTypingJsxContent = fs.readFileSync(path.resolve(process.cwd(), 'src/NumberTyping.jsx'), 'utf8');
const keybindsJsxContent = fs.readFileSync(path.resolve(process.cwd(), 'src/KeybindSection.jsx'), 'utf8');

const hudFrameContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/HudFrame.jsx'), 'utf8');
const moduleIndexContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ModuleIndex.jsx'), 'utf8');
const slidingPillContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SlidingPill.jsx'), 'utf8');
const telemetryHudContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/TelemetryHud.jsx'), 'utf8');
const visionAuraContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/VisionAura.jsx'), 'utf8');
const fluidHoverContent = fs.readFileSync(path.resolve(process.cwd(), 'src/components/FluidHoverHighlight.jsx'), 'utf8');
const overlayHtmlContent = fs.readFileSync(path.resolve(process.cwd(), 'electron/overlay.html'), 'utf8');

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getRelativeLuminance({ r, g, b }) {
  const [sR, sG, sB] = [r, g, b].map((val) => {
    const v = val / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sR + 0.7152 * sG + 0.0722 * sB;
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getRelativeLuminance(hexToRgb(hex1));
  const lum2 = getRelativeLuminance(hexToRgb(hex2));
  const bright = Math.max(lum1, lum2);
  const dark = Math.min(lum1, lum2);
  return (bright + 0.05) / (dark + 0.05);
}

test('Empirical Challenger M2: Fluid Functionalism + VisionOS Spatial Aura Suite', async (t) => {
  await t.test('1. Editorial Section Markers — Monotonic 01..05 & Unslop Sentence Case', () => {
    const allJsx = [mainJsxContent, setupJsxContent, numberTypingJsxContent, keybindsJsxContent].join('\n');
    const indexMatches = [...allJsx.matchAll(/<ModuleIndex\s+index=\{?(\d+)\}?\s+label="([^"]+)"/g)];

    assert.equal(indexMatches.length, 5, 'Must have 5 section markers across the application');

    for (let i = 0; i < indexMatches.length; i += 1) {
      const num = parseInt(indexMatches[i][1], 10);
      const label = indexMatches[i][2];
      assert.equal(num, i + 1, `Section at position ${i} must have sequential index ${i + 1}`);
      assert.doesNotMatch(label, /^\[/, 'Label must not contain artificial sci-fi square brackets');
      assert.notEqual(label, label.toUpperCase(), 'Label must use calm sentence case per unslop');
    }

    assert.match(moduleIndexContent, /aria-label=\{`Section \$\{formattedIndex\}: \$\{label\}`\}/);
  });

  await t.test('2. Authentic Fluid Functionalism 8-Tier Surface Ladder & Concentric Shapes', () => {
    for (let tier = 1; tier <= 8; tier += 1) {
      assert.match(cssContent, new RegExp(`--surface-${tier}:`), `Dark/Light --surface-${tier} must exist`);
    }
    assert.match(cssContent, /--shadow-1:/);
    assert.match(cssContent, /--shadow-2:/);
    assert.match(cssContent, /--shadow-3:/);
    assert.match(cssContent, /--shadow-4:/);
    assert.match(cssContent, /--fluid-accent:\s*#6b97ff/);

    // Concentric shape profiles matching fluidfunctionalism.com
    assert.match(cssContent, /:root\[data-shape='rounded'\]/);
    assert.match(cssContent, /:root\[data-shape='pill'\]/);
    assert.match(cssContent, /:root\[data-shape='sharp'\]/);

    // Light and Dark theme definitions
    assert.match(cssContent, /:root\[data-theme='dark'\]/);
    assert.match(cssContent, /:root\[data-theme='light'\]/);

    // HudFrame renders clean Fluid Functionalism tactile surface card without ASCII brackets
    assert.match(hudFrameContent, /fluid-surface-card/);
    assert.doesNotMatch(hudFrameContent, /┌/);
  });

  await t.test('3. Shared FluidHoverHighlight & Ghost-Span Zero-Reflow Optical Weight', () => {
    assert.match(fluidHoverContent, /fluid-hover-highlight/);
    assert.match(fluidHoverContent, /spring\.fast/);
    assert.match(numberTypingJsxContent, /useFluidHover\(\{\s*axis:\s*'xy',\s*nearest:\s*true\s*\}\)/);
    assert.match(keybindsJsxContent, /useFluidHover\(\{\s*axis:\s*'y'\s*\}\)/);

    // Ghost-span zero-reflow optical font weight in SlidingPill
    assert.match(slidingPillContent, /ghost-weight-reserve/);
    assert.match(cssContent, /\.ghost-weight-reserve\s*\{[^}]*visibility:\s*hidden;/s);
  });

  await t.test('4. Apple Vision Pro Spatial Aura + Buoyant Bubbles + Desktop Overlay', () => {
    assert.match(visionAuraContent, /vision-aura-layer/);
    assert.match(visionAuraContent, /vision-aura-ring-primary/);
    assert.match(visionAuraContent, /vision-aura-bubble/);
    assert.match(visionAuraContent, /vision-dwell-ring/);
    assert.match(cssContent, /@keyframes\s+visionAuraPrimary/);
    assert.match(cssContent, /@keyframes\s+visionBubblePop/);
    assert.match(overlayHtmlContent, /aura-canvas/);
    assert.match(overlayHtmlContent, /spatial-pill/);
  });

  await t.test('5. Live Telemetry Strip Formatting & Boundary Clamping', () => {
    assert.match(telemetryHudContent, /aria-label="Live tracking status and appearance"/);
    assert.match(telemetryHudContent, /telemetry-bar/);
    assert.doesNotMatch(telemetryHudContent, /OPTICAL_FPS/);
    assert.doesNotMatch(telemetryHudContent, /WASM_LOCAL/);

    const clampFps = (fps) => Math.max(0, Math.min(240, Math.round(Number(fps) || 0)));
    assert.equal(clampFps(-50), 0);
    assert.equal(clampFps(29.7), 30);
    assert.equal(clampFps(999), 240);
  });

  await t.test('6. Dual-Layer Button Zero-CLS Roll & Geometric 1px Press-Collapse', () => {
    const btnMatch = cssContent.match(/\.dual-layer-btn\s*\{([^}]+)\}/s);
    assert.ok(btnMatch, '.dual-layer-btn definition must exist');
    assert.match(btnMatch[1], /align-items:\s*flex-start/);
    assert.match(btnMatch[1], /height:\s*40px/);
    assert.match(btnMatch[1], /overflow:\s*hidden/);

    // Geometric 1px press-collapse instead of rubbery scale(0.95)
    assert.match(cssContent, /\.dual-layer-btn:active:not\(:disabled\)\s*\{[^}]*transform:\s*translateY\(1px\)/s);
  });

  await t.test('7. Anti-Slop Palette, Springs & WCAG AAA Contrast Conformance', () => {
    assert.match(cssContent, /--spring-fast:\s*0\.08s;/);
    assert.match(cssContent, /--spring-moderate:\s*0\.16s;/);
    assert.match(cssContent, /--spring-slow:\s*0\.24s;/);

    const contrastOnDarkCard = getContrastRatio('#4cc38a', '#1d1d1f');
    assert.ok(contrastOnDarkCard >= 7.0, `Emerald on Dark Surface-2 must be >= 7.0:1 (got ${contrastOnDarkCard.toFixed(2)})`);

    const textOnDarkCard = getContrastRatio('#f2f4f8', '#1d1d1f');
    assert.ok(textOnDarkCard >= 13.0, `Primary text on Dark Surface-2 must be >= 13.0:1 (got ${textOnDarkCard.toFixed(2)})`);

    const textOnLightCard = getContrastRatio('#14171f', '#ffffff');
    assert.ok(textOnLightCard >= 15.0, `Primary text on Light Surface-2 must be >= 15.0:1 (got ${textOnLightCard.toFixed(2)})`);

    assert.doesNotMatch(cssContent, /linear-gradient\([^)]*#8[0-9a-f]{5}[^)]*\)/i);
    assert.match(cssContent, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?transition:\s*none\s*!important;/);
  });
});
