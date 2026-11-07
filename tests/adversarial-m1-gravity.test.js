import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Load styles and GravityField source directly for empirical AST/regex & logic checks
const STYLES_PATH = path.resolve('src/styles.css');
const GRAVITY_FIELD_PATH = path.resolve('src/GravityField.jsx');
const MAIN_PATH = path.resolve('src/main.jsx');

const stylesContent = fs.readFileSync(STYLES_PATH, 'utf-8');
const gravityFieldContent = fs.readFileSync(GRAVITY_FIELD_PATH, 'utf-8');
const mainContent = fs.readFileSync(MAIN_PATH, 'utf-8');

// Pure mathematical mirror of GravityField algorithms for exhaustive numerical stress testing
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pseudoNoise(x, y, t) {
  return (
    Math.sin(x * 1.7 + t * 0.9) * Math.cos(y * 1.9 - t * 0.7) * 0.5 +
    Math.sin((x * 0.8 - y * 1.1) * 2.3 + t * 1.3) * 0.3 +
    Math.cos(x * 3.1 + y * 2.7 - t * 0.5) * 0.2
  );
}

describe('Adversarial Stress Suite: Milestone 1 (Gravity Field)', () => {

  describe('1. CSS Architecture & Staged Awwwards Hero Framing', () => {
    test('.gravity-field-wrap is framed inside .hero-stage-shell and allows pointer event pass-through', () => {
      assert.match(stylesContent, /\.hero-stage-shell\s*\{[^}]*position:\s*relative;/);
      assert.match(stylesContent, /\.hero-stage-shell\s*\{[^}]*overflow:\s*hidden;/);
      assert.match(stylesContent, /\.gravity-field-wrap\s*\{[^}]*position:\s*absolute;/);
      assert.match(stylesContent, /\.gravity-field-wrap\s*\{[^}]*inset:\s*0;/);
      assert.match(stylesContent, /\.gravity-field-wrap\s*\{[^}]*pointer-events:\s*none;/);
      assert.match(stylesContent, /\.gravity-field-wrap\s*\{[^}]*z-index:\s*0;/);
    });

    test('vignette mask does not cause abrupt 55% cutoff', () => {
      assert.match(stylesContent, /mask-image:\s*radial-gradient\(ellipse 96% 92% at 52% 50%,\s*#000 68%,\s*transparent 100%\)/);
    });

    test('hero-stage-shell mounts GravityField inside the architectural hero stage with buoyant bubble bursts', () => {
      assert.match(mainContent, /<section\s+className=["']hero-stage-shell["']>\s*<GravityField/);
      assert.match(gravityFieldContent, /spawnBurst/);
      assert.match(gravityFieldContent, /bubblesRef/);
    });
  });

  describe('2. Numerical Stability & Extreme Coordinate Math', () => {
    test('smoothstep handles standard and inverse edge thresholds without NaN', () => {
      // Standard: edge0 < edge1
      assert.equal(smoothstep(0, 1, 0), 0);
      assert.equal(smoothstep(0, 1, 0.5), 0.5);
      assert.equal(smoothstep(0, 1, 1), 1);
      assert.equal(smoothstep(0, 1, -10), 0);
      assert.equal(smoothstep(0, 1, 10), 1);

      // Inverse edge thresholds (used in GravityField line 209: smoothstep(ringRadius + ringWidth2, ringRadius, dist))
      const edge0 = 0.35 + 0.055;
      const edge1 = 0.35;
      const v1 = smoothstep(edge0, edge1, edge0);
      const v2 = smoothstep(edge0, edge1, edge1);
      const mid = smoothstep(edge0, edge1, (edge0 + edge1) / 2);

      assert.equal(v1, 0);
      assert.equal(v2, 1);
      assert.ok(Number.isFinite(mid) && mid >= 0 && mid <= 1);
    });

    test('pseudoNoise remains bounded in [-1, 1] across extreme spatial/temporal inputs', () => {
      const testCases = [
        [0, 0, 0],
        [1e6, -1e6, 1e5],
        [-1e7, 1e7, -1e5],
        [0.00001, -0.00001, 999999],
        [Math.PI, Math.E, Math.SQRT2],
      ];

      for (const [x, y, t] of testCases) {
        const val = pseudoNoise(x, y, t);
        assert.ok(Number.isFinite(val), `pseudoNoise(${x}, ${y}, ${t}) produced non-finite value`);
        assert.ok(val >= -1.05 && val <= 1.05, `pseudoNoise(${x}, ${y}, ${t}) out of bounds: ${val}`);
      }
    });

    test('particle physics simulation loop does not drift to NaN or Infinity over 10,000 frames', () => {
      // Stress test with time progression and simulated user pointer actions
      const width = 1920;
      const height = 1080;
      const aspect = width / height;

      let ringPosX = 0.18;
      let ringPosY = -0.04;
      let cursorPos = { x: 0.18, y: -0.04 };
      let particle = {
        refX: 0.5,
        refY: -0.2,
        posX: 0,
        posY: 0,
        scale: 0.2,
        velocity: 0,
        seed: 1.23,
      };

      const baseRadius = 0.26;
      const ringWidth = 0.09;
      const ringWidth2 = 0.055;
      const ringDisplacement = 0.48;

      for (let frame = 0; frame < 10000; frame++) {
        const time = frame * 0.016; // 60fps
        const halfT = time * 0.5;

        // Periodic erratic mouse input
        if (frame % 100 === 0) {
          cursorPos.x = (Math.sin(frame) * 1.5); // Can be slightly beyond [-1, 1]
          cursorPos.y = (Math.cos(frame) * 1.5);
        }

        ringPosX += (cursorPos.x - ringPosX) * 0.06;
        ringPosY += (cursorPos.y - ringPosY) * 0.06;

        particle.posX *= 0.82;
        particle.posY *= 0.82;

        const dx0 = (particle.refX - ringPosX) * aspect;
        const dy0 = particle.refY - ringPosY;
        const dist = Math.hypot(dx0, dy0);

        const noise0 = pseudoNoise(particle.refX * 2.5, particle.refY * 2.5, halfT);
        const dist1 = Math.hypot(dx0 + noise0 * 0.015, dy0 + noise0 * 0.015);

        const ringRadius = baseRadius + Math.sin(time * 1.0) * 0.03 + Math.cos(time * 3.0) * 0.02;

        let t =
          smoothstep(ringRadius - ringWidth * 2, ringRadius, dist) -
          smoothstep(ringRadius, ringRadius + ringWidth, dist1);
        let t2 =
          smoothstep(ringRadius - ringWidth2 * 2, ringRadius, dist) -
          smoothstep(ringRadius, ringRadius + ringWidth2, dist1);
        const t3 = smoothstep(ringRadius + ringWidth2, ringRadius, dist);

        t = t * t;
        t2 = t2 * t2 * t2;
        t += t2 * 2.8 + t3 * 0.45;

        const nS = pseudoNoise(particle.refX * 2 + 1.8, particle.refY * 2 + 7.2, halfT);
        t += Math.pow((nS + 1.5) * 0.5, 2) * 0.32;

        const clampDist = Math.min(1, dist);
        const dispX = Math.sin(particle.refX * 14 + time * 2.6) * 0.012 * clampDist + pseudoNoise(particle.refX * 4, particle.refY * 4, time * 0.35) * 0.014;
        const dispY = Math.cos(particle.refY * 14 + time * 2.1) * 0.012 * clampDist + pseudoNoise(particle.refY * 4, particle.refX * 4, time * 0.35) * 0.014;

        const curX = particle.refX + dispX;
        const curY = particle.refY + dispY;

        const pushFactor = Math.pow(Math.max(0, t2), 0.75) * ringDisplacement;
        particle.posX -= (ringPosX - curX) * pushFactor;
        particle.posY -= (ringPosY - curY) * pushFactor;

        particle.scale += (t - particle.scale) * 0.18;
        particle.velocity = particle.velocity * 0.5 + particle.scale * 0.25;

        const finalX = curX + particle.posX * 0.28;
        const finalY = curY + particle.posY * 0.28;

        const sx = ((finalX + 1) * 0.5) * width;
        const sy = ((finalY + 1) * 0.5) * height;

        const energised = smoothstep(0.22, 0.85, particle.scale);
        const alpha = Math.min(0.95, Math.max(0.24, 0.34 + energised * 0.60));

        const len = 5.0 + Math.min(2.0, particle.scale) * 9.5;
        const thick = 2.0 + Math.min(1.6, particle.scale) * 2.0;

        assert.ok(Number.isFinite(sx), `sx became non-finite at frame ${frame}`);
        assert.ok(Number.isFinite(sy), `sy became non-finite at frame ${frame}`);
        assert.ok(Number.isFinite(len) && len >= 5.0 && len <= 24.0, `len out of range at frame ${frame}: ${len}`);
        assert.ok(Number.isFinite(thick) && thick >= 2.0 && thick <= 5.2, `thick out of range at frame ${frame}: ${thick}`);
        assert.ok(alpha >= 0.24 && alpha <= 0.95, `alpha out of bounds [0.24, 0.95] at frame ${frame}: ${alpha}`);
      }
    });
  });

  describe('3. Pointer Event Boundaries & Viewport Sanitization', () => {
    function simulatePointerMove(clientX, clientY, winW, winH) {
      const w = winW || 1;
      const h = winH || 1;
      const x = (clientX / w) * 2 - 1;
      const y = (clientY / h) * 2 - 1;
      if (x >= -1.05 && x <= 1.05 && y >= -1.05 && y <= 1.05) {
        return {
          x: Math.max(-1, Math.min(1, x)),
          y: Math.max(-1, Math.min(1, y)),
          active: true,
        };
      }
      return { active: false };
    }

    test('pointer at center (winW/2, winH/2) maps to Cartesian origin (0, 0)', () => {
      const res = simulatePointerMove(960, 540, 1920, 1080);
      assert.equal(res.active, true);
      assert.ok(Math.abs(res.x) < 1e-6);
      assert.ok(Math.abs(res.y) < 1e-6);
    });

    test('pointer at extreme screen edges clamps strictly to [-1, 1]', () => {
      const topLeft = simulatePointerMove(0, 0, 1920, 1080);
      assert.equal(topLeft.active, true);
      assert.equal(topLeft.x, -1);
      assert.equal(topLeft.y, -1);

      const bottomRight = simulatePointerMove(1920, 1080, 1920, 1080);
      assert.equal(bottomRight.active, true);
      assert.equal(bottomRight.x, 1);
      assert.equal(bottomRight.y, 1);
    });

    test('pointer outside viewport threshold (e.g. cursor exited window) deactivates cleanly', () => {
      const farLeft = simulatePointerMove(-200, 500, 1920, 1080);
      assert.equal(farLeft.active, false);

      const farRight = simulatePointerMove(2500, 500, 1920, 1080);
      assert.equal(farRight.active, false);

      const farAbove = simulatePointerMove(500, -300, 1920, 1080);
      assert.equal(farAbove.active, false);

      const farBelow = simulatePointerMove(500, 1500, 1920, 1080);
      assert.equal(farBelow.active, false);
    });

    test('pointer with NaN, undefined or Infinite coordinates safely evaluates to inactive without crash', () => {
      const nanTest = simulatePointerMove(NaN, 500, 1920, 1080);
      assert.equal(nanTest.active, false);

      const infTest = simulatePointerMove(Infinity, -Infinity, 1920, 1080);
      assert.equal(infTest.active, false);

      const zeroWin = simulatePointerMove(100, 100, 0, 0);
      assert.ok(typeof zeroWin.active === 'boolean');
    });
  });

  describe('4. Dynamic Canvas Resizing, Aspect Ratio & DPR Guarding', () => {
    function computeCanvasDimensions(rectWidth, rectHeight, windowWidth, windowHeight, dprInput) {
      const dpr = Math.min(dprInput || 1, 2);
      const width = Math.max(1, Math.floor(rectWidth || windowWidth || 1));
      const height = Math.max(1, Math.floor(rectHeight || windowHeight || 1));
      const canvasWidth = Math.floor(width * dpr);
      const canvasHeight = Math.floor(height * dpr);
      const spacing = width < 768 ? 32 : 28;
      const cols = Math.max(16, Math.floor(width / spacing));
      const rows = Math.max(10, Math.floor(height / spacing));

      return { dpr, width, height, canvasWidth, canvasHeight, cols, rows, particleCount: cols * rows };
    }

    test('zero or null window dimensions fall back safely to minimum 1x1 canvas buffer', () => {
      const res = computeCanvasDimensions(0, 0, 0, 0, 1);
      assert.equal(res.width, 1);
      assert.equal(res.height, 1);
      assert.equal(res.canvasWidth, 1);
      assert.equal(res.canvasHeight, 1);
      assert.ok(res.cols >= 16);
      assert.ok(res.rows >= 10);
      assert.ok(res.particleCount >= 160);
    });

    test('retina and high-DPR screens clamp DPR to 2 to prevent GPU memory buffer exhaustion', () => {
      const dpr3 = computeCanvasDimensions(1920, 1080, 1920, 1080, 3.0);
      assert.equal(dpr3.dpr, 2.0);
      assert.equal(dpr3.canvasWidth, 3840);
      assert.equal(dpr3.canvasHeight, 2160);

      const dpr4 = computeCanvasDimensions(1920, 1080, 1920, 1080, 4.0);
      assert.equal(dpr4.dpr, 2.0);

      const dpr1_5 = computeCanvasDimensions(1920, 1080, 1920, 1080, 1.5);
      assert.equal(dpr1_5.dpr, 1.5);
    });

    test('ultra-wide (32:9) and vertical mobile (9:16) aspect ratios produce proportional particle lattices', () => {
      // 5120 x 1440 (Samsung Neo G9 ultra-wide)
      const ultraWide = computeCanvasDimensions(5120, 1440, 5120, 1440, 1);
      assert.equal(ultraWide.cols, Math.floor(5120 / 28)); // 182
      assert.equal(ultraWide.rows, Math.floor(1440 / 28)); // 51
      assert.ok(ultraWide.particleCount > 9000);

      // 360 x 800 (Mobile portrait)
      const mobile = computeCanvasDimensions(360, 800, 360, 800, 2);
      assert.equal(mobile.cols, 16); // Clamped minimum 16
      assert.equal(mobile.rows, Math.floor(800 / 32)); // 25
      assert.equal(mobile.particleCount, 16 * 25);
    });
  });

  describe('5. Unmount Cleanup & Zero-Leak Verification', () => {
    test('GravityField cleans up window event listeners and cancelAnimationFrame on unmount', () => {
      assert.match(
        gravityFieldContent,
        /window\.removeEventListener\('pointermove',\s*handlePointerMove\)/,
        'Must remove pointermove listener on unmount'
      );
      assert.match(
        gravityFieldContent,
        /window\.removeEventListener\('pointerleave',\s*handlePointerLeave\)/,
        'Must remove pointerleave listener on unmount'
      );
      assert.match(
        gravityFieldContent,
        /window\.removeEventListener\('resize',\s*buildParticles\)/,
        'Must remove resize listener on unmount'
      );
      assert.match(
        gravityFieldContent,
        /cancelAnimationFrame\(rafId\)/,
        'Must cancelAnimationFrame on unmount'
      );
    });

    test('GravityField does NOT register IntersectionObserver that halts rendering on scroll', () => {
      assert.doesNotMatch(
        gravityFieldContent,
        /new\s+IntersectionObserver/,
        'IntersectionObserver must NOT be present (causes canvas to freeze on scroll)'
      );
    });

    test('document.hidden is checked inside render loop to save CPU when tab is backgrounded', () => {
      assert.match(
        gravityFieldContent,
        /if\s*\(\s*document\.hidden\s*\)\s*return;/,
        'Must preserve CPU efficiency when document.hidden is true'
      );
    });
  });

  describe('6. Capsule & Ring Glow Geometry Specifications', () => {
    test('capsule proportions match Antigravity sdRoundBox formula (length >= 5px, thick >= 2px)', () => {
      assert.match(gravityFieldContent, /const\s+len\s*=\s*5\.0\s*\+\s*Math\.min\(2\.0,\s*p\.scale\)\s*\*\s*9\.5;/);
      assert.match(gravityFieldContent, /const\s+thick\s*=\s*2\.0\s*\+\s*Math\.min\(1\.6,\s*p\.scale\)\s*\*\s*2\.0;/);
    });

    test('resting baseRadius is enlarged from 0.16/0.24 to 0.26/0.38', () => {
      assert.match(gravityFieldContent, /const\s+baseRadius\s*=\s*isPinching\s*\?\s*0\.38\s*:\s*0\.26;/);
    });

    test('well radial gradient radius reaches 42% of max canvas viewport dimension', () => {
      assert.match(gravityFieldContent, /Math\.max\(width,\s*height\)\s*\*\s*0\.42/);
    });
  });
});
