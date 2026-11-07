import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { spring } from '../lib/springs.js';

const MAX_ACTIVE_BURSTS = 5;
const BURST_LIFETIME_MS = 920;

const BUBBLE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function buildBubbles(seedKey) {
  return BUBBLE_ANGLES.map((deg, idx) => {
    const jitter = ((seedKey * 17 + idx * 31) % 24) - 12;
    const rad = ((deg + jitter) * Math.PI) / 180;
    const distance = 44 + ((seedKey * 13 + idx * 19) % 34);
    const size = 6 + ((idx * 3 + seedKey) % 7);
    return {
      id: idx,
      dx: Math.cos(rad) * distance,
      dy: Math.sin(rad) * distance - 14, // slight upward buoyancy
      size,
      delay: idx * 0.014,
    };
  });
}

/**
 * Apple Vision Pro / visionOS inspired Spatial Aura & Dwell Ring feedback layer.
 * - Spawns concentric chromatic/specular glass ripples + buoyant micro-bubble pop bursts
 *   whenever a gesture, click, drag, scroll, digit, or mode toggle occurs.
 * - Renders a live circular SVG dwell-charge ring while holding a gesture or active drag lock.
 * - Displays a frosted spatial status capsule confirming the latest recognized action.
 */
export function VisionAura({
  auraEvent,
  dwellProgress = 0,
  dwellLabel = '',
  focusPoint = null,
  dragging = false,
}) {
  const prefersReduced = useReducedMotion();
  const [bursts, setBursts] = useState([]);
  const [activeToast, setActiveToast] = useState(null);

  useEffect(() => {
    if (!auraEvent || !auraEvent.id) return undefined;

    const winW = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
    const winH = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;

    const px = Number.isFinite(auraEvent.x) ? auraEvent.x * winW : winW * 0.5;
    const py = Number.isFinite(auraEvent.y) ? auraEvent.y * winH : winH * 0.38;

    const burst = {
      id: auraEvent.id,
      x: Math.max(48, Math.min(winW - 48, px)),
      y: Math.max(48, Math.min(winH - 48, py)),
      kind: auraEvent.kind || 'click',
      label: auraEvent.label || 'Action triggered',
      bubbles: buildBubbles(auraEvent.id),
    };

    setBursts((prev) => [...prev.slice(-(MAX_ACTIVE_BURSTS - 1)), burst]);
    setActiveToast({
      id: auraEvent.id,
      label: burst.label,
      detail: auraEvent.detail || '',
      kind: burst.kind,
    });

    const burstTimer = setTimeout(() => {
      setBursts((prev) => prev.filter((item) => item.id !== burst.id));
    }, BURST_LIFETIME_MS);

    const toastTimer = setTimeout(() => {
      setActiveToast((prev) => (prev?.id === burst.id ? null : prev));
    }, 1850);

    return () => {
      clearTimeout(burstTimer);
      clearTimeout(toastTimer);
    };
  }, [auraEvent]);

  const clampedDwell = Math.max(0, Math.min(1, Number(dwellProgress) || 0));
  const showDwell = (clampedDwell > 0.04 || dragging) && focusPoint;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - (dragging ? 1 : clampedDwell));

  return (
    <div className="vision-aura-layer" aria-hidden="true">
      {/* Spatial Glass Action Capsule */}
      <AnimatePresence mode="wait">
        {activeToast && (
          <motion.div
            key={activeToast.id}
            className={`vision-aura-pill kind-${activeToast.kind}`}
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.94 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96, transition: spring.fast.exit }}
            transition={spring.slow}
          >
            <span className="vision-aura-pill-orb" />
            <span className="vision-aura-pill-label">{activeToast.label}</span>
            {activeToast.detail && <span className="vision-aura-pill-detail">{activeToast.detail}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Circular Spatial Aura Ripples + Buoyant Bubble Pop Bursts */}
      {bursts.map((burst) => (
        <div
          key={burst.id}
          className={`vision-aura-origin kind-${burst.kind}`}
          style={{ left: `${burst.x}px`, top: `${burst.y}px` }}
        >
          <span className="vision-aura-core" />
          <span className="vision-aura-ring-primary" />
          <span className="vision-aura-ring-secondary" />
          {!prefersReduced &&
            burst.bubbles.map((b) => (
              <span
                key={b.id}
                className="vision-aura-bubble"
                style={{
                  width: `${b.size}px`,
                  height: `${b.size}px`,
                  '--bx': `${b.dx.toFixed(1)}px`,
                  '--by': `${b.dy.toFixed(1)}px`,
                  animationDelay: `${b.delay.toFixed(3)}s`,
                }}
              />
            ))}
        </div>
      ))}

      {/* Continuous Circular VisionOS Dwell / Drag Ring */}
      {showDwell && (
        <div
          className={`vision-dwell-ring ${dragging ? 'dragging' : ''}`}
          style={{
            left: `${Math.max(36, Math.min((window.innerWidth || 1280) - 36, focusPoint.x * (window.innerWidth || 1280)))}px`,
            top: `${Math.max(36, Math.min((window.innerHeight || 800) - 36, focusPoint.y * (window.innerHeight || 800)))}px`,
          }}
        >
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle className="vision-dwell-track" cx="28" cy="28" r={radius} />
            <circle
              className="vision-dwell-arc"
              cx="28"
              cy="28"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          {dwellLabel && <span className="vision-dwell-tag">{dwellLabel}</span>}
        </div>
      )}
    </div>
  );
}

