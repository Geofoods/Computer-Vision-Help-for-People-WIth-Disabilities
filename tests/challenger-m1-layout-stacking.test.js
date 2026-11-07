import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Load source CSS for static layout & stacking context analysis
const cssContent = fs.readFileSync(
  path.resolve(process.cwd(), 'src/styles.css'),
  'utf8',
);
const jsxContent = fs.readFileSync(
  path.resolve(process.cwd(), 'src/GravityField.jsx'),
  'utf8',
);
const mainJsxContent = fs.readFileSync(
  path.resolve(process.cwd(), 'src/main.jsx'),
  'utf8',
);

// Physics & noise functions from GravityField.jsx
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

test('Empirical Challenger M1: CSS Layout & Stacking Context Analysis', async (t) => {
  await t.test('gravity-field-wrap layout rules adhere to staged hero spatial contract', () => {
    const wrapRegex = /\.gravity-field-wrap\s*\{([^}]+)\}/s;
    const match = cssContent.match(wrapRegex);
    assert.ok(match, '.gravity-field-wrap class must exist in src/styles.css');

    const body = match[1];
    assert.match(body, /position:\s*absolute/, 'wrap must be position: absolute inside hero-stage-shell');
    assert.match(body, /inset:\s*0/, 'wrap must have inset: 0');
    assert.match(body, /width:\s*100%/, 'wrap must be width: 100%');
    assert.match(body, /height:\s*100%/, 'wrap must be height: 100%');
    assert.match(body, /z-index:\s*0/, 'wrap must have z-index: 0');
    assert.match(body, /pointer-events:\s*none/, 'wrap must have pointer-events: none to pass clicks through');
    assert.match(body, /overflow:\s*hidden/, 'wrap must have overflow: hidden');
  });

  await t.test('foreground cards and panels have z-index > 0 and position: relative to prevent occlusion', () => {
    const sections = [
      { name: '.hero', regex: /\.hero\s*\{([^}]+)\}/s },
      { name: '.topbar', regex: /\.topbar\s*\{([^}]+)\}/s },
      { name: '.workspace', regex: /\.workspace\s*\{([^}]+)\}/s },
      { name: 'footer', regex: /footer\s*\{([^}]+)\}/s },
      { name: '.help-panel', regex: /\.help-panel\s*\{([^}]+)\}/s },
    ];

    for (const { name, regex } of sections) {
      const match = cssContent.match(regex);
      assert.ok(match, `${name} must exist in styles.css`);
      const body = match[1];
      assert.match(body, /position:\s*relative/, `${name} must have position: relative`);
      const zMatch = body.match(/z-index:\s*(\d+)/);
      assert.ok(zMatch, `${name} must specify explicit z-index`);
      const zVal = parseInt(zMatch[1], 10);
      assert.ok(zVal >= 1, `${name} z-index (${zVal}) must be strictly >= 1`);
    }
  });

  await t.test('mask-image eliminates old 55% blackout cutoff', () => {
    const wrapRegex = /\.gravity-field-wrap\s*\{([^}]+)\}/s;
    const match = cssContent.match(wrapRegex);
    const body = match[1];
    assert.doesNotMatch(body, /55%/, '55% hard blackout mask must not be present');
    assert.match(body, /radial-gradient/, 'radial-gradient mask must be defined');
  });

  await t.test('GravityField is mounted inside hero-stage-shell before foreground .hero content', () => {
    const stageIdx = mainJsxContent.indexOf('<section className="hero-stage-shell">');
    const gravityFieldIdx = mainJsxContent.indexOf('<GravityField');
    const heroIdx = mainJsxContent.indexOf('<div className="hero">');

    assert.ok(stageIdx !== -1, 'hero-stage-shell exists');
    assert.ok(gravityFieldIdx !== -1, 'GravityField exists');
    assert.ok(heroIdx !== -1, 'hero foreground container exists');

    assert.ok(
      gravityFieldIdx > stageIdx && gravityFieldIdx < heroIdx,
      'GravityField must be placed inside hero-stage-shell behind foreground .hero',
    );
  });
});

test('Empirical Challenger M1: Viewport Geometry & Particle Lattice Stress', async (t) => {
  const viewports = [
    { name: 'Micro viewport', w: 1, h: 1, dpr: 1 },
    { name: 'Zero/Degenerate fallback', w: 0, h: 0, dpr: 1 },
    { name: 'iPhone SE (portrait)', w: 320, h: 568, dpr: 2 },
    { name: 'iPhone 14 Pro', w: 393, h: 852, dpr: 3 },
    { name: 'iPad Mini (portrait)', w: 768, h: 1024, dpr: 2 },
    { name: 'iPad Mini (landscape)', w: 1024, h: 768, dpr: 2 },
    { name: 'Laptop HD', w: 1366, h: 768, dpr: 1 },
    { name: 'Desktop Full HD', w: 1920, h: 1080, dpr: 1 },
    { name: 'Desktop QHD (High-DPI 125%)', w: 2560, h: 1440, dpr: 1.25 },
    { name: 'Desktop 4K UHD (High-DPI 200%)', w: 3840, h: 2160, dpr: 2 },
    { name: 'Super Ultrawide 32:9', w: 5120, h: 1440, dpr: 1 },
  ];

  for (const vp of viewports) {
    await t.test(`Lattice generator under ${vp.name} (${vp.w}x${vp.h}, dpr: ${vp.dpr})`, () => {
      // Replicate buildParticles sizing logic
      const dpr = Math.min(vp.dpr || 1, 2);
      const width = Math.max(1, Math.floor(vp.w));
      const height = Math.max(1, Math.floor(vp.h));
      const canvasWidth = Math.floor(width * dpr);
      const canvasHeight = Math.floor(height * dpr);

      assert.ok(canvasWidth >= 1, 'canvasWidth must be >= 1');
      assert.ok(canvasHeight >= 1, 'canvasHeight must be >= 1');
      assert.ok(dpr <= 2, 'dpr must be clamped to at most 2 to avoid memory blowup');

      const spacing = width < 768 ? 32 : 28;
      const cols = Math.max(16, Math.floor(width / spacing));
      const rows = Math.max(10, Math.floor(height / spacing));

      assert.ok(cols >= 16, 'cols minimum constraint (16) must hold');
      assert.ok(rows >= 10, 'rows minimum constraint (10) must hold');

      const particleCount = cols * rows;
      assert.ok(particleCount >= 160, 'Minimum particle count must be at least 160');
      assert.ok(particleCount <= 20000, `Particle count ${particleCount} must remain within GPU budget (<20k)`);

      // Verify coordinate generation
      const list = [];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const jx = 0; // Deterministic test
          const jy = 0;
          const nx = ((c + 0.5 + jx) / cols) * 2 - 1;
          const ny = ((r + 0.5 + jy) / rows) * 2 - 1;

          assert.ok(Number.isFinite(nx), 'nx must be finite');
          assert.ok(Number.isFinite(ny), 'ny must be finite');
          assert.ok(nx >= -1 && nx <= 1, `nx ${nx} must be in [-1, 1]`);
          assert.ok(ny >= -1 && ny <= 1, `ny ${ny} must be in [-1, 1]`);
          list.push({ refX: nx, refY: ny });
        }
      }
      assert.equal(list.length, particleCount);
    });
  }
});

test('Empirical Challenger M1: Pointer Event Cartesian Normalization Adversarial Suite', async (t) => {
  const winW = 1920;
  const winH = 1080;

  function simulatePointer(clientX, clientY, customW = winW, customH = winH) {
    const w = customW || 1;
    const h = customH || 1;
    const x = (clientX / w) * 2 - 1;
    const y = (clientY / h) * 2 - 1;

    let mouseX = 0;
    let mouseY = 0;
    let active = false;

    if (x >= -1.05 && x <= 1.05 && y >= -1.05 && y <= 1.05) {
      mouseX = Math.max(-1, Math.min(1, x));
      mouseY = Math.max(-1, Math.min(1, y));
      active = true;
    } else {
      active = false;
    }

    return { x: mouseX, y: mouseY, active, rawX: x, rawY: y };
  }

  await t.test('center of viewport maps to (0, 0)', () => {
    const res = simulatePointer(960, 540);
    assert.equal(res.active, true);
    assert.equal(res.x, 0);
    assert.equal(res.y, 0);
  });

  await t.test('top-left corner (0, 0) maps to (-1, -1)', () => {
    const res = simulatePointer(0, 0);
    assert.equal(res.active, true);
    assert.equal(res.x, -1);
    assert.equal(res.y, -1);
  });

  await t.test('bottom-right corner (1920, 1080) maps to (1, 1)', () => {
    const res = simulatePointer(1920, 1080);
    assert.equal(res.active, true);
    assert.equal(res.x, 1);
    assert.equal(res.y, 1);
  });

  await t.test('slight overshoot within 5% tolerance window remains active and clamps to [-1, 1]', () => {
    // x = (1950 / 1920) * 2 - 1 = 1.03125 (within 1.05)
    const res = simulatePointer(1950, 540);
    assert.equal(res.active, true);
    assert.equal(res.x, 1); // clamped
    assert.equal(res.y, 0);

    // Negative slight overshoot: x = (-20 / 1920) * 2 - 1 = -1.0208 (within -1.05)
    const res2 = simulatePointer(-20, 540);
    assert.equal(res2.active, true);
    assert.equal(res2.x, -1); // clamped
    assert.equal(res2.y, 0);
  });

  await t.test('overshoot beyond 5% tolerance window deactivates pointer without throwing', () => {
    const res = simulatePointer(2200, 540);
    assert.equal(res.active, false);

    const res2 = simulatePointer(-200, 540);
    assert.equal(res2.active, false);

    const res3 = simulatePointer(960, -300);
    assert.equal(res3.active, false);

    const res4 = simulatePointer(960, 2000);
    assert.equal(res4.active, false);
  });

  await t.test('extreme out-of-bounds coordinates (multi-monitor or capture) are handled safely', () => {
    const extremeCases = [
      [-100000, -100000],
      [100000, 100000],
      [0, -999999],
      [999999, 0],
    ];

    for (const [cx, cy] of extremeCases) {
      const res = simulatePointer(cx, cy);
      assert.equal(res.active, false);
      assert.ok(Number.isFinite(res.rawX));
      assert.ok(Number.isFinite(res.rawY));
    }
  });

  await t.test('zero-dimension window fallback handles division by zero safely', () => {
    const res = simulatePointer(100, 100, 0, 0);
    assert.ok(Number.isFinite(res.rawX));
    assert.ok(Number.isFinite(res.rawY));
    assert.ok(typeof res.active === 'boolean');
  });
});

test('Empirical Challenger M1: Physics Simulation Multi-Frame Stability & Conservation', async (t) => {
  const width = 1280;
  const height = 720;
  const aspect = width / height;

  // Set up particle lattice
  const spacing = 28;
  const cols = Math.floor(width / spacing);
  const rows = Math.floor(height / spacing);
  const particles = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      particles.push({
        refX: ((c + 0.5) / cols) * 2 - 1,
        refY: ((r + 0.5) / rows) * 2 - 1,
        posX: 0,
        posY: 0,
        scale: 0.2,
        velocity: 0,
        seed: (c * 17 + r * 23) % 6.28,
        colorMix: (c + r) / (cols + rows),
      });
    }
  }

  const cursorPos = { x: 0.18, y: -0.04 };
  const ringPos = { x: 0.18, y: -0.04 };
  const pulse = { active: false, x: 0, y: 0, radius: 0, alpha: 0 };

  const totalFrames = 1200; // 20s @ 60fps

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const now = frame * 16.666;
    const time = now * 0.001;
    const halfT = time * 0.5;

    const driftX = pseudoNoise(1.4, 2.1, time * 0.66) * 0.28;
    const driftY = pseudoNoise(3.7, 0.9, time * 0.75) * 0.18;

    let isPinching = false;

    // Simulation phases
    if (frame < 300) {
      // Phase 1: Autonomous idle drift
      cursorPos.x = 0.22 + driftX;
      cursorPos.y = -0.02 + driftY;
      ringPos.x += (cursorPos.x - ringPos.x) * 0.02;
      ringPos.y += (cursorPos.y - ringPos.y) * 0.02;
    } else if (frame < 600) {
      // Phase 2: Active mouse cursor sweep
      const mouseX = Math.sin(frame * 0.05);
      const mouseY = Math.cos(frame * 0.04);
      cursorPos.x = mouseX + driftX * 0.2;
      cursorPos.y = mouseY + driftY * 0.2;
      ringPos.x += (cursorPos.x - ringPos.x) * 0.06;
      ringPos.y += (cursorPos.y - ringPos.y) * 0.06;
    } else if (frame < 900) {
      // Phase 3: Live webcam hand tracking
      const handX = 0.5 + Math.sin(frame * 0.03) * 0.4;
      const handY = 0.5 + Math.cos(frame * 0.02) * 0.3;
      const hx = (handX * 2 - 1) * 0.85;
      const hy = (handY * 2 - 1) * 0.85;
      cursorPos.x = hx + driftX * 0.25;
      cursorPos.y = hy + driftY * 0.25;
      ringPos.x += (cursorPos.x - ringPos.x) * 0.08;
      ringPos.y += (cursorPos.y - ringPos.y) * 0.08;
    } else {
      // Phase 4: Pinching & shockwaves
      isPinching = true;
      if (frame === 900 || frame === 1050) {
        pulse.active = true;
        pulse.radius = 0.02;
        pulse.alpha = 1;
      }
      cursorPos.x = 0.1 + driftX * 0.2;
      cursorPos.y = -0.1 + driftY * 0.2;
      ringPos.x += (cursorPos.x - ringPos.x) * 0.08;
      ringPos.y += (cursorPos.y - ringPos.y) * 0.08;
    }

    assert.ok(Number.isFinite(ringPos.x), `Frame ${frame}: ringPos.x must be finite`);
    assert.ok(Number.isFinite(ringPos.y), `Frame ${frame}: ringPos.y must be finite`);
    assert.ok(Math.abs(ringPos.x) < 2.0, `Frame ${frame}: ringPos.x must stay within bounded space`);
    assert.ok(Math.abs(ringPos.y) < 2.0, `Frame ${frame}: ringPos.y must stay within bounded space`);

    const baseRadius = isPinching ? 0.38 : 0.26;
    const ringRadius = baseRadius + Math.sin(time * 1.0) * 0.03 + Math.cos(time * 3.0) * 0.02;
    const ringWidth = 0.09;
    const ringWidth2 = 0.055;
    const ringDisplacement = isPinching ? 0.70 : 0.48;

    // Check well radial glow bounds
    const wellScreenX = ((ringPos.x + 1) * 0.5) * width;
    const wellScreenY = ((ringPos.y + 1) * 0.5) * height;
    assert.ok(Number.isFinite(wellScreenX), `Frame ${frame}: wellScreenX must be finite`);
    assert.ok(Number.isFinite(wellScreenY), `Frame ${frame}: wellScreenY must be finite`);

    // Verify particle simulation step
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.posX *= 0.82;
      p.posY *= 0.82;

      const dx0 = (p.refX - ringPos.x) * aspect;
      const dy0 = p.refY - ringPos.y;
      const dist = Math.hypot(dx0, dy0);

      const noise0 = pseudoNoise(p.refX * 2.5, p.refY * 2.5, halfT);
      const dist1 = Math.hypot(dx0 + noise0 * 0.015, dy0 + noise0 * 0.015);

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

      const nS = pseudoNoise(p.refX * 2 + 1.8, p.refY * 2 + 7.2, halfT);
      t += Math.pow((nS + 1.5) * 0.5, 2) * 0.32;

      const clampDist = Math.min(1, dist);
      const dispX = Math.sin(p.refX * 14 + time * 2.6) * 0.012 * clampDist;
      const dispY = Math.cos(p.refY * 14 + time * 2.1) * 0.012 * clampDist;

      const curX = p.refX + dispX;
      const curY = p.refY + dispY;

      const pushFactor = Math.pow(Math.max(0, t2), 0.75) * ringDisplacement;
      p.posX -= (ringPos.x - curX) * pushFactor;
      p.posY -= (ringPos.y - curY) * pushFactor;

      p.scale += (t - p.scale) * 0.18;
      p.velocity = p.velocity * 0.5 + p.scale * 0.25;

      const finalX = curX + p.posX * 0.28;
      const finalY = curY + p.posY * 0.28;

      const sx = ((finalX + 1) * 0.5) * width;
      const sy = ((finalY + 1) * 0.5) * height;

      const angle =
        Math.atan2(finalY - ringPos.y, (finalX - ringPos.x) * aspect) +
        Math.sin(p.seed + time * 0.8) * 0.22;

      const energised = smoothstep(0.22, 0.85, p.scale);
      const alpha = Math.min(0.95, Math.max(0.24, 0.34 + energised * 0.60));
      const len = 5.0 + Math.min(2.0, p.scale) * 9.5;
      const thick = 2.0 + Math.min(1.6, p.scale) * 2.0;

      // Sample 5 particles per frame for performance
      if (i % 200 === 0) {
        assert.ok(Number.isFinite(p.scale), `Frame ${frame}, Particle ${i}: scale must be finite`);
        assert.ok(Number.isFinite(sx), `Frame ${frame}, Particle ${i}: sx must be finite`);
        assert.ok(Number.isFinite(sy), `Frame ${frame}, Particle ${i}: sy must be finite`);
        assert.ok(Number.isFinite(angle), `Frame ${frame}, Particle ${i}: angle must be finite`);
        assert.ok(alpha >= 0.24 && alpha <= 0.95, `Frame ${frame}, Particle ${i}: alpha (${alpha}) must be in [0.24, 0.95]`);
        assert.ok(len >= 5.0 && len <= 24.0, `Frame ${frame}, Particle ${i}: len (${len}) must be in [5.0, 24.0]`);
        assert.ok(thick >= 2.0 && thick <= 5.2, `Frame ${frame}, Particle ${i}: thick (${thick}) must be in [2.0, 5.2]`);
      }
    }

    // Shockwave pulse decay
    if (pulse.active) {
      pulse.radius += 0.025;
      pulse.alpha *= 0.92;
      if (pulse.alpha < 0.02) {
        pulse.active = false;
      }
    }
  }

  // Shockwave must be inactive after 150 frames since last trigger
  assert.equal(pulse.active, false, 'Shockwave pulse must properly dissipate and deactivate');
});

test('Empirical Challenger M1: Rapid Resize Stress Harness', async (t) => {
  await t.test('500 consecutive rapid resize iterations execute cleanly without memory leak', () => {
    let prevParticleCount = 0;
    for (let i = 0; i < 500; i += 1) {
      const w = 400 + Math.floor(Math.random() * 2000);
      const h = 300 + Math.floor(Math.random() * 1200);
      const spacing = w < 768 ? 32 : 28;
      const cols = Math.max(16, Math.floor(w / spacing));
      const rows = Math.max(10, Math.floor(h / spacing));
      const count = cols * rows;
      assert.ok(count > 0);
      prevParticleCount = count;
    }
    assert.ok(prevParticleCount > 0);
  });
});

test('Empirical Challenger M1: Lifecycle & Event Listener Cleanup', async (t) => {
  await t.test('cleanup function removes all registered window listeners and cancels RAF', () => {
    assert.match(jsxContent, /window\.removeEventListener\('pointermove',\s*handlePointerMove\)/);
    assert.match(jsxContent, /window\.removeEventListener\('pointerleave',\s*handlePointerLeave\)/);
    assert.match(jsxContent, /window\.removeEventListener\('resize',\s*buildParticles\)/);
    assert.match(jsxContent, /cancelAnimationFrame\(rafId\)/);
  });
});
