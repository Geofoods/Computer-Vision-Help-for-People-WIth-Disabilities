import React, { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { MOVEMENTS, PRESET_GROUPS, comboFromEvent, isPreset } from './keybinds.js';

const FLASH_MS = 1200;
const MOVEMENT_GROUPS = [
  { label: 'Hand gestures', hint: 'Use your fingers and hand position.', ids: ['indexTap', 'middleTap', 'ringTap', 'fist'] },
  { label: 'Face gestures', hint: 'Use your eyes, mouth, and cheeks.', ids: ['blink', 'winkLeft', 'winkRight', 'kiss', 'cheekPuff', 'mouthOpen', 'tongueLick'] },
  { label: 'Head gestures', hint: 'Tilt or shake your head.', ids: ['headTiltLeft', 'headTiltRight', 'headTiltUp', 'headTiltDown', 'headShakeHorizontal', 'headShakeVertical'] },
  { label: 'Hand movements', hint: 'Move your hand in a direction.', ids: ['swipeLeft', 'swipeRight', 'swipeUp', 'swipeDown'] },
];

function statusText(isDesktop, controlOn) {
  if (!isDesktop) return 'Sending keys needs the HandTap desktop app. You can still try the movements here.';
  if (!controlOn) return 'Keys are only sent while mouse control is on. Until then, try a movement and watch its row light up.';
  return 'Movements with a shortcut now press it in whichever app is in front.';
}

function BindingRow({ movement, combo, flashing, onChange, reservedFor }) {
  const reserved = Boolean(reservedFor);
  const [recording, setRecording] = useState(false);
  const selectId = `keybind-${movement.id}`;

  const handleKeyDown = (event) => {
    if (!recording) return;
    event.preventDefault();
    // Esc always leaves recording, so the keyboard can't get stuck here.
    if (event.code === 'Escape') {
      setRecording(false);
      return;
    }
    const recorded = comboFromEvent(event);
    if (recorded) {
      onChange(movement.id, recorded);
      setRecording(false);
    }
  };

  return (
    <li className={`keybind-row ${flashing ? 'flash' : ''}`}>
      <div className="keybind-movement">
        <label htmlFor={selectId}>{movement.label}</label>
        <small>{movement.hint}</small>
      </div>
      <select id={selectId} value={reserved ? '' : combo ?? ''} disabled={reserved} onChange={(event) => onChange(movement.id, event.target.value)}>
        <option value="">{reservedFor ?? 'No shortcut'}</option>
        {combo && !isPreset(combo) && <option value={combo}>{combo}</option>}
        {PRESET_GROUPS.map(({ label, presets }) => (
          <optgroup key={label} label={label}>
            {presets.map((preset) => (
              <option key={preset.combo} value={preset.combo}>{preset.label.toLowerCase() === preset.combo.toLowerCase() ? preset.label : `${preset.label} (${preset.combo})`}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        className={`record-button ${recording ? 'recording' : ''}`}
        disabled={reserved}
        aria-label={recording ? `Recording a shortcut for ${movement.label}. Press keys, or Esc to cancel.` : `Record a shortcut for ${movement.label}`}
        onClick={() => setRecording((value) => !value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setRecording(false)}
      >
        <Keyboard size={16} strokeWidth={1.5} /> {recording ? 'Press keys…' : 'Record'}
      </button>
    </li>
  );
}

export function KeybindSection({ bindings, onChange, lastMovement, controlOn, isDesktop, typingToggle, controlToggle }) {
  const [flashingId, setFlashingId] = useState(null);

  useEffect(() => {
    if (!lastMovement) return undefined;
    setFlashingId(lastMovement.id);
    const timer = setTimeout(() => setFlashingId(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [lastMovement]);

  const flashing = MOVEMENTS.find(({ id }) => id === flashingId);

  return (
    <section className="workspace keybinds" aria-labelledby="keybinds-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Keybinds</p>
          <h2 id="keybinds-heading">Turn movements into shortcuts</h2>
        </div>
      </div>
      <div className="keybind-panel">
        <p className="keybind-status">{statusText(isDesktop, controlOn)}</p>
        <div className="keybind-groups">
          {MOVEMENT_GROUPS.map(({ label, hint, ids }) => (
            <section className="keybind-group" key={label} aria-labelledby={`keybind-group-${label}`}>
              <div className="keybind-group-heading">
                <h3 id={`keybind-group-${label}`}>{label}</h3>
                <p>{hint}</p>
              </div>
              <ul className="keybind-list">
                {ids.map((id) => MOVEMENTS.find((movement) => movement.id === id)).filter(Boolean).map((movement) => (
                  <BindingRow
                    key={movement.id}
                    movement={movement}
                    combo={bindings[movement.id]}
                    flashing={flashingId === movement.id}
                    onChange={onChange}
                    reservedFor={movement.id === controlToggle ? 'Turns mouse control on and off' : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="keybind-live" aria-live="polite">{flashing ? `${flashing.label} detected` : ''}</p>
      </div>
    </section>
  );
}
