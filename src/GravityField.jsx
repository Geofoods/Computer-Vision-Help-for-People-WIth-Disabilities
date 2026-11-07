import React, { useEffect, useRef } from 'react';

export function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Fast 2D value/gradient noise approximation for organic drift matching Antigravity's snoise
export function pseudoNoise(x, y, t) {
  return (
    Math.sin(x * 1.7 + t * 0.9) * Math.cos(y * 1.9 - t * 0.7) * 0.5 +
    Math.sin((x * 0.8 - y * 1.1) * 2.3 + t * 1.3) * 0.3 +
    Math.cos(x * 3.1 + y * 2.7 - t * 0.5) * 0.2
  );
}

/**
 * Staged Awwwards Interactive Gravity Field + Buoyant Bubble-Pop Physics.
 * Framed inside the Hero Spatial Stage (rather than cluttering lower utility tables),
 * reacts to mouse, webcam hand coordinates, scroll progress, and pinch/action shockwaves.
 */
export function GravityField({
  handPoint,
  pinching,
  cameraOn,
  pulseKey,
  theme = 'dark',
}) {
  const canvasRef = useRef(null);
  const handRef = useRef({ point: null, pinching: false, cameraOn: false, theme: 'dark' });
  const wavesRef = useRef([]);
  const bubblesRef = useRef([]);
  const sparksRef = useRef([]);
  const wellCenterRef = useRef({ x: 0.18, y: -0.04 });
  const scrollProgressRef = useRef(0);

  handRef.current = { point: handPoint, pinching, cameraOn, theme };

  const spawnBurst = (normX, normY) => {
    wavesRef.current.push({
      x: normX,
      y: normY,
      radius: 0.02,
      alpha: 1,
      speed: 0.024,
    });

    const count = 16;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.32;
      const speed = 0.0045 + Math.random() * 0.0085;
      bubblesRef.current.push({
        x: normX + Math.cos(angle) * 0.02,
        y: normY + Math.sin(angle) * 0.02,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.0028, // natural upward buoyancy
        r: 4 + Math.random() * 7.5,
        life: 0,
        maxLife: 34 + Math.floor(Math.random() * 26),
        wobbleSeed: Math.random() * Math.PI * 2,
        hueMix: Math.random(),
      });
    }
    if (bubblesRef.current.length > 96) {
      bubblesRef.current.splice(0, bubblesRef.current.length - 96);
    }
  };

  useEffect(() => {
    if (!pulseKey) return;
    spawnBurst(wellCenterRef.current.x, wellCenterRef.current.y);
  }, [pulseKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles = [];

    const mouse = { x: 0, y: 0, active: false };
    const cursorPos = { x: 0.18, y: -0.04 };
    const ringPos = { x: 0.18, y: -0.04 };

    const buildParticles = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width || window.innerWidth));
      height = Math.max(1, Math.floor(rect.height || 560));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);

      const spacing = width < 768 ? 30 : 26;
      const cols = Math.max(16, Math.floor(width / spacing));
      const rows = Math.max(10, Math.floor(height / spacing));
      const list = [];

      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const jx = (Math.random() - 0.5) * 0.72;
          const jy = (Math.random() - 0.5) * 0.72;
          const nx = ((c + 0.5 + jx) / cols) * 2 - 1;
          const ny = ((r + 0.5 + jy) / rows) * 2 - 1;
          list.push({
            refX: nx,
            refY: ny,
            posX: 0,
            posY: 0,
            scale: 0.2,
            velocity: 0,
            seed: Math.random() * Math.PI * 2,
            colorMix: Math.random(),
          });
        }
      }
      particles = list;
    };

    buildParticles();

    const handlePointerMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || window.innerWidth || 1;
      const h = rect.height || window.innerHeight || 1;
      const x = ((event.clientX - rect.left) / w) * 2 - 1;
      const y = ((event.clientY - rect.top) / h) * 2 - 1;
      if (x >= -1.08 && x <= 1.08 && y >= -1.12 && y <= 1.12) {
        mouse.x = Math.max(-1, Math.min(1, x));
        mouse.y = Math.max(-1, Math.min(1, y));
        mouse.active = true;
      } else {
        mouse.active = false;
      }
    };

    const handlePointerDown = (event) => {
      if (reducedMotion) return;
      const rect = canvas.getBoundingClientRect();
      if (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      ) {
        const nx = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const ny = ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
        spawnBurst(nx, ny);
      }
    };

    const handlePointerLeave = () => {
      mouse.active = false;
    };

    const handleScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const heroSpan = Math.max(420, window.innerHeight * 0.85);
      scrollProgressRef.current = Math.max(0, Math.min(1, scrollY / heroSpan));
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', buildParticles, { passive: true });

    let rafId = null;
    const startTime = performance.now();

    const render = (now) => {
      rafId = requestAnimationFrame(render);
      if (document.hidden) return;

      const time = (now - startTime) * 0.001;
      const aspect = width / Math.max(1, height);
      const scrollT = scrollProgressRef.current;

      const driftX = pseudoNoise(1.4, 2.1, time * 0.66) * 0.26;
      const driftY = pseudoNoise(3.7, 0.9, time * 0.75) * 0.18;

      const {
        point: hand,
        pinching: isPinching,
        cameraOn: camActive,
        theme: currentTheme,
      } = handRef.current;
      const isLight = currentTheme === 'light';

      if (camActive && hand) {
        const hx = (hand.x * 2 - 1) * 0.85;
        const hy = (hand.y * 2 - 1) * 0.85;
        cursorPos.x = hx + driftX * 0.22;
        cursorPos.y = hy + driftY * 0.22;
        ringPos.x += (cursorPos.x - ringPos.x) * 0.085;
        ringPos.y += (cursorPos.y - ringPos.y) * 0.085;
      } else if (mouse.active) {
        cursorPos.x = mouse.x + driftX * 0.16;
        cursorPos.y = mouse.y + driftY * 0.16;
        ringPos.x += (cursorPos.x - ringPos.x) * 0.07;
        ringPos.y += (cursorPos.y - ringPos.y) * 0.07;
      } else {
        cursorPos.x = -0.18 + driftX;
        cursorPos.y = -0.02 + driftY;
        ringPos.x += (cursorPos.x - ringPos.x) * 0.024;
        ringPos.y += (cursorPos.y - ringPos.y) * 0.024;
      }

      wellCenterRef.current = { x: ringPos.x, y: ringPos.y };

      const baseRadius = isPinching ? 0.38 : 0.26;
      const ringRadius =
        (baseRadius + Math.sin(time * 1.0) * 0.03 + Math.cos(time * 3.0) * 0.02) *
        (1 - scrollT * 0.18);
      const ringWidth = 0.09;
      const ringWidth2 = 0.055;
      const ringDisplacement = isPinching ? 0.7 : 0.48;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Scroll-linked subtle parallax & focal compression inside the stage
      const stageAlpha = Math.max(0.2, 1 - scrollT * 0.65);
      ctx.globalAlpha = stageAlpha;

      const wellScreenX = (ringPos.x + 1) * 0.5 * width;
      const wellScreenY = ((ringPos.y + 1) * 0.5 + scrollT * 0.08) * height;
      const wellGrad = ctx.createRadialGradient(
        wellScreenX,
        wellScreenY,
        4,
        wellScreenX,
        wellScreenY,
        Math.max(width, height) * 0.42,
      );
      if (isPinching) {
        wellGrad.addColorStop(0, isLight ? 'rgba(34, 160, 107, 0.16)' : 'rgba(76, 195, 138, 0.16)');
        wellGrad.addColorStop(0.5, isLight ? 'rgba(107, 151, 255, 0.08)' : 'rgba(107, 151, 255, 0.06)');
        wellGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        wellGrad.addColorStop(0, isLight ? 'rgba(107, 151, 255, 0.14)' : 'rgba(107, 151, 255, 0.12)');
        wellGrad.addColorStop(0.5, isLight ? 'rgba(34, 160, 107, 0.05)' : 'rgba(76, 195, 138, 0.04)');
        wellGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = wellGrad;
      ctx.fillRect(0, 0, width, height);

      const halfT = time * 0.5;
      const activeWaves = wavesRef.current;

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
        const dispX =
          (reducedMotion ? 0 : Math.sin(p.refX * 14 + time * 2.6) * 0.012 * clampDist) +
          pseudoNoise(p.refX * 4, p.refY * 4, time * 0.35) * 0.014;
        const dispY =
          (reducedMotion ? 0 : Math.cos(p.refY * 14 + time * 2.1) * 0.012 * clampDist) +
          pseudoNoise(p.refY * 4, p.refX * 4, time * 0.35) * 0.014;

        const curX = p.refX + dispX;
        const curY = p.refY + dispY;

        const pushFactor = Math.pow(Math.max(0, t2), 0.75) * ringDisplacement;
        p.posX -= (ringPos.x - curX) * pushFactor;
        p.posY -= (ringPos.y - curY) * pushFactor;

        // Shockwave ripple physically displaces capsules outward as it passes
        for (let wIdx = 0; wIdx < activeWaves.length; wIdx += 1) {
          const wv = activeWaves[wIdx];
          const wdx = (curX - wv.x) * aspect;
          const wdy = curY - wv.y;
          const wDist = Math.hypot(wdx, wdy);
          const band = Math.abs(wDist - wv.radius * 1.8);
          if (band < 0.09 && wDist > 0.001) {
            const impulse = (1 - band / 0.09) * wv.alpha * 0.18;
            p.posX += (wdx / wDist) * impulse;
            p.posY += (wdy / wDist) * impulse;
            t += impulse * 1.8;
          }
        }

        p.scale += (t - p.scale) * 0.18;
        p.velocity = p.velocity * 0.5 + p.scale * 0.25;

        const finalX = curX + p.posX * 0.28;
        const finalY = curY + p.posY * 0.28 + scrollT * 0.08;

        const sx = (finalX + 1) * 0.5 * width;
        const sy = (finalY + 1) * 0.5 * height;

        const angle =
          Math.atan2(finalY - ringPos.y, (finalX - ringPos.x) * aspect) +
          Math.sin(p.seed + time * 0.8) * 0.22;

        const energised = smoothstep(0.22, 0.85, p.scale);
        const alpha = Math.min(0.95, Math.max(0.22, 0.3 + energised * 0.62));

        const len = 5.0 + Math.min(2.0, p.scale) * 9.5;
        const thick = 2.0 + Math.min(1.6, p.scale) * 2.0;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);

        if (energised > 0.12) {
          if (p.colorMix < 0.46) {
            ctx.fillStyle = isLight
              ? `rgba(28, 156, 104, ${alpha.toFixed(3)})`
              : `rgba(76, 195, 138, ${alpha.toFixed(3)})`;
          } else if (p.colorMix < 0.84) {
            ctx.fillStyle = isLight
              ? `rgba(74, 125, 255, ${alpha.toFixed(3)})`
              : `rgba(107, 151, 255, ${alpha.toFixed(3)})`;
          } else {
            ctx.fillStyle = isLight
              ? `rgba(217, 130, 43, ${alpha.toFixed(3)})`
              : `rgba(242, 184, 75, ${alpha.toFixed(3)})`;
          }
        } else {
          ctx.fillStyle = isLight
            ? `rgba(100, 112, 132, ${(alpha * 0.52).toFixed(3)})`
            : `rgba(148, 160, 184, ${(alpha * 0.65).toFixed(3)})`;
        }

        ctx.beginPath();
        ctx.roundRect(-len * 0.5, -thick * 0.5, len, thick, thick * 0.5);
        ctx.fill();
        ctx.restore();
      }

      // Render VisionOS-style concentric specular shockwaves
      for (let i = activeWaves.length - 1; i >= 0; i -= 1) {
        const wv = activeWaves[i];
        wv.radius += wv.speed;
        wv.alpha *= 0.925;
        if (wv.alpha < 0.02) {
          activeWaves.splice(i, 1);
        } else {
          const wx = (wv.x + 1) * 0.5 * width;
          const wy = ((wv.y + 1) * 0.5 + scrollT * 0.08) * height;
          const rPx = wv.radius * Math.min(width, height);

          ctx.beginPath();
          ctx.arc(wx, wy, rPx, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(107, 151, 255, ${(wv.alpha * 0.85).toFixed(3)})`;
          ctx.lineWidth = 1.75;
          ctx.stroke();

          if (rPx > 14) {
            ctx.beginPath();
            ctx.arc(wx, wy, rPx * 0.76, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(76, 195, 138, ${(wv.alpha * 0.55).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Render buoyant iridescent bubbles that drift upward, swell, and pop into micro-sparks
      const bubbles = bubblesRef.current;
      const sparks = sparksRef.current;

      for (let i = bubbles.length - 1; i >= 0; i -= 1) {
        const b = bubbles[i];
        b.life += 1;
        b.vx *= 0.975;
        b.vy = b.vy * 0.98 - 0.00018; // upward acceleration
        b.x += b.vx + Math.sin(time * 5 + b.wobbleSeed) * 0.0009;
        b.y += b.vy;

        const progress = b.life / b.maxLife;
        if (progress >= 1) {
          const bx = (b.x + 1) * 0.5 * width;
          const by = ((b.y + 1) * 0.5 + scrollT * 0.08) * height;
          // Pop into 4 tiny droplets!
          for (let s = 0; s < 4; s += 1) {
            const sa = (Math.PI * 0.5) * s + b.wobbleSeed;
            sparks.push({
              x: bx,
              y: by,
              vx: Math.cos(sa) * (1.4 + Math.random() * 1.2),
              vy: Math.sin(sa) * (1.4 + Math.random() * 1.2),
              life: 0,
              maxLife: 12,
            });
          }
          bubbles.splice(i, 1);
        } else {
          const bx = (b.x + 1) * 0.5 * width;
          const by = ((b.y + 1) * 0.5 + scrollT * 0.08) * height;
          // Slight pre-pop swell between 82% and 100% life
          const swell = progress > 0.82 ? 1 + ((progress - 0.82) / 0.18) * 0.32 : 1;
          const radiusPx = b.r * swell;
          const bAlpha = (1 - Math.pow(progress, 2.2)) * 0.82;

          ctx.save();
          ctx.beginPath();
          ctx.arc(bx, by, radiusPx, 0, Math.PI * 2);
          ctx.fillStyle =
            b.hueMix < 0.5
              ? `rgba(107, 151, 255, ${(bAlpha * 0.16).toFixed(3)})`
              : `rgba(76, 195, 138, ${(bAlpha * 0.16).toFixed(3)})`;
          ctx.fill();
          ctx.lineWidth = 1.15;
          ctx.strokeStyle =
            b.hueMix < 0.5
              ? `rgba(165, 198, 255, ${bAlpha.toFixed(3)})`
              : `rgba(130, 232, 184, ${bAlpha.toFixed(3)})`;
          ctx.stroke();

          // Specular glass highlight crescent on top-left of bubble
          ctx.beginPath();
          ctx.arc(bx, by, Math.max(1.5, radiusPx * 0.68), -Math.PI * 0.82, -Math.PI * 0.35);
          ctx.strokeStyle = `rgba(255, 255, 255, ${(bAlpha * 0.85).toFixed(3)})`;
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Render bubble-pop micro-sparks
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const sp = sparks[i];
        sp.life += 1;
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vx *= 0.88;
        sp.vy *= 0.88;
        if (sp.life >= sp.maxLife) {
          sparks.splice(i, 1);
        } else {
          const spAlpha = 1 - sp.life / sp.maxLife;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 1.4, 0, Math.PI * 2);
          ctx.fillStyle = isLight
            ? `rgba(74, 125, 255, ${spAlpha.toFixed(3)})`
            : `rgba(220, 236, 255, ${spAlpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      ctx.restore();
    };

    rafId = requestAnimationFrame(render);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', buildParticles);
    };
  }, []);

  return (
    <div className="gravity-field-wrap" aria-hidden="true">
      <canvas ref={canvasRef} className="gravity-field-canvas" />
    </div>
  );
}
