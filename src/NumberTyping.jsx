import React from 'react';
import { Power } from 'lucide-react';
import { DIGIT_CHART } from './tracking.js';
import { TYPING_TOGGLES } from './keybinds.js';
import { GESTURE_CLOSED } from './gesture-model.js';

function teachText(teaching, labelOf) {
  if (!teaching) return 'Can\u2019t make a pattern? Press Teach and hold any hand shape you can, and HandTap learns it for you. It stays on this computer.';
  const name = labelOf(teaching.label);
  if (teaching.status === 'ready') return `Get ready to show your hand shape for ${name}…`;
  return `Learning ${name}: hold still, ${teaching.percent}%`;
}

function TeachControls({ label, name, taught, cameraOn, teaching, onTeach, onForget }) {
  return (
    <div className="teach-controls">
      <button type="button" className="teach-button" disabled={!cameraOn || Boolean(teaching)} aria-label={`Teach a hand shape for ${name}`} onClick={() => onTeach(label)}>
        {taught ? 'Teach more' : 'Teach'}
      </button>
      {taught && <button type="button" className="teach-button quiet" aria-label={`Forget the hand shape for ${name}`} onClick={() => onForget(label)}>Forget</button>}
    </div>
  );
}

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

export function NumberTyping({ typingOn, onToggle, cameraOn, controlOn, isDesktop, hotkey, armedDigit, typed, onClear, typingToggle, onChangeToggle, soundsOn, onChangeSounds, controlToggle, gestureSamples, teaching, onTeach, onForget }) {
  const labelOf = (label) => (label === GESTURE_CLOSED ? 'the type gesture' : `number ${label}`);
  const teachProps = { cameraOn, teaching, onTeach, onForget };
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
            {TYPING_TOGGLES.filter(({ id }) => id !== controlToggle).map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
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
        <p className="teach-status" aria-live="polite">{teachText(teaching, labelOf)}</p>
        <ul className="digit-chart">
          {DIGIT_CHART.map(({ digit, label }) => (
            <li key={digit} className={`${armedDigit === digit ? 'ready' : ''} ${teaching?.label === digit ? 'teaching' : ''}`}>
              <strong>{digit}</strong>
              <span>{gestureSamples[digit] ? 'Your own hand shape' : label}</span>
              <TeachControls label={digit} name={labelOf(digit)} taught={Boolean(gestureSamples[digit])} {...teachProps} />
            </li>
          ))}
          <li className={teaching?.label === GESTURE_CLOSED ? 'teaching' : ''}>
            <strong>Type</strong>
            <span>{gestureSamples[GESTURE_CLOSED] ? 'Your own hand shape' : 'Close into a fist'}</span>
            <TeachControls label={GESTURE_CLOSED} name={labelOf(GESTURE_CLOSED)} taught={Boolean(gestureSamples[GESTURE_CLOSED])} {...teachProps} />
          </li>
        </ul>
      </div>
    </section>
  );
}
