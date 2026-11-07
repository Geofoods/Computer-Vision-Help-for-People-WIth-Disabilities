import React from 'react';
import { Move, Rocket } from 'lucide-react';
import { TYPING_TOGGLES } from './keybinds.js';

export function SetupPanel({ cameraOn, isDesktop, reachCapturing, reachMessage, reachIsCustom, onCalibrateReach, onResetReach, autoStart, onChangeAutoStart, controlToggle, onChangeControlToggle, typingToggle }) {
  return (
    <section className="workspace setup" aria-labelledby="setup-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Fit it to you</p>
          <h2 id="setup-heading">Set HandTap up around your body</h2>
        </div>
      </div>
      <div className="setup-grid">
        <div className="keybind-panel">
          <h3><Move size={17} /> Your reach</h3>
          <p className="keybind-status">Move your hand around the space that feels comfortable, however small. That space then covers your whole screen.</p>
          <div className="setup-actions">
            <button type="button" className="record-button" disabled={!cameraOn || reachCapturing} onClick={onCalibrateReach}>
              {reachCapturing ? 'Keep moving…' : 'Calibrate my reach'}
            </button>
            {reachIsCustom && !reachCapturing && <button type="button" className="clear-typed inline" onClick={onResetReach}>Reset</button>}
          </div>
          <p className="setup-message" aria-live="polite">{reachMessage}</p>
        </div>
        <div className="keybind-panel">
          <h3><Rocket size={17} /> Hands-free start</h3>
          <label className="typing-sounds">
            <input type="checkbox" checked={autoStart} onChange={(event) => onChangeAutoStart(event.target.checked)} />
            Start the camera when HandTap opens
          </label>
          {isDesktop && (
            <div className="setup-select">
              <label htmlFor="control-toggle">Turn mouse control on and off with</label>
              <select id="control-toggle" value={controlToggle} onChange={(event) => onChangeControlToggle(event.target.value)}>
                {TYPING_TOGGLES.filter(({ id }) => id !== typingToggle).map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                <option value="">No movement</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
