import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { SlidingPill } from './SlidingPill.jsx';

const SHAPE_OPTIONS = [
  { id: 'rounded', label: 'Rounded' },
  { id: 'pill', label: 'Pill' },
  { id: 'sharp', label: 'Sharp' },
];

/**
 * Live Telemetry & Fluid Functionalism Surface Strip.
 * Displays real measured camera FPS, MediaPipe worker inference time, GPU/CPU delegate,
 * 1€ filter profile, drag-lock state, and live Dark/Light + Concentric Shape controls.
 */
export function TelemetryHud({
  cameraOn = false,
  fps = 0,
  inferenceMs = 0,
  delegate = 'GPU',
  filterMode = 'Balanced',
  dragging = false,
  theme = 'dark',
  onToggleTheme,
  shape = 'rounded',
  onChangeShape,
}) {
  const clampedFps = Math.max(0, Math.min(240, Math.round(Number(fps) || 0)));
  const formattedFps = cameraOn ? `${clampedFps} fps` : 'Standby';
  const safeMs = Math.max(0, Number(inferenceMs) || 0);
  const formattedLatency = cameraOn && safeMs > 0 ? `${safeMs.toFixed(1)} ms` : '-';

  return (
    <aside className="telemetry-bar" aria-label="Live tracking status and appearance">
      <div className="telemetry-metrics">
        <div className="telemetry-item">
          <span className={`telemetry-dot ${cameraOn ? 'online' : ''}`} aria-hidden="true" />
          <span className="telemetry-label">Camera</span>
          <span className={`telemetry-val ${cameraOn ? 'active' : ''}`}>{formattedFps}</span>
        </div>
        <span className="telemetry-divider" aria-hidden="true">·</span>
        <div className="telemetry-item">
          <span className="telemetry-label">Inference</span>
          <span className="telemetry-val">{formattedLatency}</span>
        </div>
        <span className="telemetry-divider" aria-hidden="true">·</span>
        <div className="telemetry-item">
          <span className="telemetry-label">Engine</span>
          <span className="telemetry-val">{delegate} local</span>
        </div>
        <span className="telemetry-divider" aria-hidden="true">·</span>
        <div className="telemetry-item">
          <span className="telemetry-label">Smoothing</span>
          <span className="telemetry-val">{filterMode}</span>
        </div>
        {dragging && (
          <>
            <span className="telemetry-divider" aria-hidden="true">·</span>
            <div className="telemetry-item">
              <span className="telemetry-val drag-pill">Drag locked</span>
            </div>
          </>
        )}
      </div>

      <div className="telemetry-controls">
        {onChangeShape && (
          <SlidingPill
            compact
            options={SHAPE_OPTIONS}
            value={shape}
            onChange={onChangeShape}
            ariaLabel="Concentric corner shape"
          />
        )}
        {onToggleTheme && (
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light surface' : 'Switch to dark surface'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <span className={`theme-icon-swap ${theme === 'light' ? 'light' : 'dark'}`} aria-hidden="true">
              <Moon size={14} strokeWidth={1.75} className="icon-moon" />
              <Sun size={14} strokeWidth={1.75} className="icon-sun" />
            </span>
            <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
