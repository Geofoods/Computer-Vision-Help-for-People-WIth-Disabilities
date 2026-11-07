import React from 'react';
import { Power } from 'lucide-react';
import { DIGIT_CHART } from './tracking.js';
import { TYPING_TOGGLES } from './keybinds.js';

function statusText(typingOn, controlOn, isDesktop, toggle) {
  if (!typingOn) {
    const start = toggle ? `${toggle.instruction} to start typing numbers` : 'Turn this on to type numbers with your fingers';
    return `${start}. The cursor and clicks pause until you turn it off.`;
  }
  const stop = toggle ? ` ${toggle.instruction} to stop.` : '';
  if (isDesktop && controlOn) return `Numbers now type into whichever app is in front.${stop}`;
  return isDesktop
    ? `Practice mode: numbers only appear here until mouse control is on.${stop}`
    : `Practice mode: typing into other apps needs the HandTap desktop app.${stop}`;
}

export function NumberTyping({ typingOn, onToggle, cameraOn, controlOn, isDesktop, hotkey, armedDigit, typed, onClear, typingToggle, onChangeToggle, soundsOn, onChangeSounds }) {
  const toggle = TYPING_TOGGLES.find(({ id }) => id === typingToggle);
  return (
    <section className="workspace number-typing" aria-labelledby="number-typing-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Number typing</p>
          <h2 id="number-typing-heading">Type numbers with your fingers</h2>
        </div>
      </div>
      <div className="keybind-panel">
        <p className="keybind-status" aria-live="polite">{statusText(typingOn, controlOn, isDesktop, toggle)}</p>
        <button
          type="button"
          className={`control-button ${typingOn ? 'active' : ''}`}
          aria-pressed={typingOn}
          disabled={!cameraOn}
          onClick={onToggle}
        >
          <Power size={15} /> {typingOn ? 'Number typing is on' : 'Turn on number typing'}
          {hotkey && <kbd>{hotkey}</kbd>}
        </button>
        <div className="typing-options">
          <label htmlFor="typing-toggle">Turn on and off with</label>
          <select id="typing-toggle" value={typingToggle} onChange={(event) => onChangeToggle(event.target.value)}>
            {TYPING_TOGGLES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            <option value="">No movement</option>
          </select>
          <label className="typing-sounds">
            <input type="checkbox" checked={soundsOn} onChange={(event) => onChangeSounds(event.target.checked)} />
            Play a sound when typing turns on or off and for each number
          </label>
        </div>
        <div className="typing-readout">
          <div className={`armed-digit ${armedDigit !== null ? 'ready' : ''}`}>
            <small>Ready to type</small>
            <strong>{armedDigit ?? '–'}</strong>
          </div>
          <div className="typed-output">
            <small>Typed</small>
            <output aria-live="polite">{typed || '–'}</output>
            {typed && <button type="button" className="clear-typed" onClick={onClear}>Clear</button>}
          </div>
        </div>
        <p className="typing-how">Hold a pattern until it shows above, then close your fingers into a fist to type it.</p>
        <ul className="digit-chart">
          {DIGIT_CHART.map(({ digit, label }) => (
            <li key={digit} className={armedDigit === digit ? 'ready' : ''}><strong>{digit}</strong><span>{label}</span></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
