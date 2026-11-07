import React, { useEffect, useState } from 'react';
import { Keyboard, Power } from 'lucide-react';
import { MOVEMENTS, PRESET_GROUPS, comboFromEvent, isPreset } from './keybinds.js';

const FLASH_MS = 1200;

function statusText(isDesktop, sendKeysOn) {
  if (!isDesktop) return 'Sending keys needs the HandTap desktop app. You can still try the movements here.';
  if (!sendKeysOn) return 'No keys are sent yet. Try a movement and watch its row light up, then turn on sending keys.';
  return 'Movements with a shortcut now press it in whichever app is in front. A fast cursor move can count as a swipe, so only give swipes a shortcut if you want them.';
}

function BindingRow({ movement, combo, flashing, onChange }) {
  const [recording, setRecording] = useState(false);
  const selectId = `keybind-${movement.id}`;

  const handleKeyDown = (event) => {
    if (!recording) return;
    event.preventDefault();
    // Esc always leaves recording, so the keyboard can't get stuck here. It's still a preset.
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
      <select id={selectId} value={combo ?? ''} onChange={(event) => onChange(movement.id, event.target.value)}>
        <option value="">No shortcut</option>
        {combo && !isPreset(combo) && <option value={combo}>{combo}</option>}
        {PRESET_GROUPS.map(({ label, presets }) => (
          <optgroup key={label} label={label}>
            {presets.map((preset) => (
              <option key={preset.combo} value={preset.combo}>{preset.label} ({preset.combo})</option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        className={`record-button ${recording ? 'recording' : ''}`}
        aria-label={recording ? `Recording a shortcut for ${movement.label}. Press keys, or Esc to cancel.` : `Record a shortcut for ${movement.label}`}
        onClick={() => setRecording((value) => !value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setRecording(false)}
      >
        <Keyboard size={15} /> {recording ? 'Press keys…' : 'Record'}
      </button>
    </li>
  );
}

export function KeybindSection({ bindings, onChange, lastMovement, sendKeysOn, onToggleSendKeys, cameraOn, isDesktop }) {
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
        <p className="keybind-status">{statusText(isDesktop, sendKeysOn)}</p>
        {isDesktop && (
          <button
            type="button"
            className={`control-button ${sendKeysOn ? 'active' : ''}`}
            aria-pressed={sendKeysOn}
            disabled={!cameraOn}
            onClick={onToggleSendKeys}
          >
            <Power size={15} /> {sendKeysOn ? 'Sending keys is on' : 'Turn on sending keys'}
          </button>
        )}
        <ul className="keybind-list">
          {MOVEMENTS.map((movement) => (
            <BindingRow
              key={movement.id}
              movement={movement}
              combo={bindings[movement.id]}
              flashing={flashingId === movement.id}
              onChange={onChange}
            />
          ))}
        </ul>
        <p className="keybind-live" aria-live="polite">{flashing ? `${flashing.label} detected` : ''}</p>
      </div>
    </section>
  );
}
