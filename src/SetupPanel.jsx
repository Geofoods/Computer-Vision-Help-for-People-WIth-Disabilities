import React from 'react';
import { Move, Power, Sparkles } from 'lucide-react';
import { TYPING_TOGGLES } from './keybinds.js';
import { ModuleIndex } from './components/ModuleIndex.jsx';
import { HudFrame } from './components/HudFrame.jsx';
import { DualLayerButton } from './components/DualLayerButton.jsx';
import { SlidingPill } from './components/SlidingPill.jsx';
import { ScrollSection } from './components/ScrollSection.jsx';

export function SetupPanel({
  cameraOn,
  isDesktop,
  reachCapturing,
  reachMessage,
  reachIsCustom,
  onCalibrateReach,
  onResetReach,
  autoStart,
  onChangeAutoStart,
  controlToggle,
  onChangeControlToggle,
  typingToggle,
  filterProfile = 'balanced',
  onChangeFilterProfile = () => {},
  overlayEnabled = true,
  onChangeOverlayEnabled = () => {},
}) {
  return (
    <ScrollSection className="setup" aria-labelledby="setup-heading">
      <div className="section-heading">
        <div>
          <ModuleIndex index={3} label="Personal calibration" />
          <h2 id="setup-heading">Set HandTap up around your body</h2>
        </div>
      </div>

      <div className="setup-grid">
        <HudFrame className="keybind-panel">
          <h3><Move size={16} strokeWidth={1.6} /> Your comfortable reach</h3>
          <p className="keybind-status">
            Move your hand around the space that feels effortless, however small. That area will map across your entire screen.
          </p>
          <div className="setup-actions">
            <DualLayerButton
              type="button"
              className="record-button"
              disabled={!cameraOn || reachCapturing}
              onClick={onCalibrateReach}
              hoverText={reachCapturing ? 'Measuring range…' : 'Measure my reach'}
            >
              {reachCapturing ? 'Keep moving…' : 'Calibrate my reach'}
            </DualLayerButton>
            {reachIsCustom && !reachCapturing && (
              <DualLayerButton
                type="button"
                className="clear-typed inline"
                onClick={onResetReach}
                hoverText="Use default area"
              >
                Reset
              </DualLayerButton>
            )}
          </div>
          <div className={`progress-track ${reachCapturing ? 'on' : ''}`} aria-hidden="true">
            {reachCapturing && <i className="progress-run reach-run" />}
          </div>
          <p className="setup-message" aria-live="polite">{reachMessage}</p>
        </HudFrame>

        <HudFrame className="keybind-panel">
          <h3><Power size={16} strokeWidth={1.6} /> Tracking feel and startup</h3>
          <div className="setup-controls-stack">
            <div className="setup-toggle-row">
              <span className="field-label">Camera startup</span>
              <SlidingPill
                options={[
                  { id: false, label: 'Manual' },
                  { id: true, label: 'Auto-start' },
                ]}
                value={Boolean(autoStart)}
                onChange={onChangeAutoStart}
                ariaLabel="Camera auto-start mode"
              />
            </div>

            <div className="setup-toggle-row">
              <span className="field-label">Motion smoothing</span>
              <SlidingPill
                options={[
                  { id: 'steady', label: 'Steady' },
                  { id: 'balanced', label: 'Balanced' },
                  { id: 'agile', label: 'Agile' },
                ]}
                value={filterProfile}
                onChange={onChangeFilterProfile}
                ariaLabel="Motion smoothing filter profile"
              />
            </div>

            {isDesktop && (
              <div className="setup-toggle-row">
                <span className="field-label">
                  <Sparkles size={14} strokeWidth={1.6} /> Spatial aura on desktop
                </span>
                <SlidingPill
                  options={[
                    { id: false, label: 'In app only' },
                    { id: true, label: 'Full screen' },
                  ]}
                  value={Boolean(overlayEnabled)}
                  onChange={onChangeOverlayEnabled}
                  ariaLabel="Desktop spatial aura feedback"
                />
              </div>
            )}

            {isDesktop && (
              <div className="setup-select">
                <label htmlFor="control-toggle">Turn mouse control on and off with</label>
                <select
                  id="control-toggle"
                  value={controlToggle}
                  onChange={(event) => onChangeControlToggle(event.target.value)}
                >
                  {TYPING_TOGGLES.filter(({ id }) => id !== typingToggle).map(({ id, label }) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                  <option value="">No movement</option>
                </select>
              </div>
            )}
          </div>
        </HudFrame>
      </div>
    </ScrollSection>
  );
}
