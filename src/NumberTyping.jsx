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

function readingText(typingOn, armedDigit, seenDigit, seenTaught) {
  if (!typingOn) return 'Turn on typing to start';
  if (seenDigit !== null && seenDigit !== armedDigit) {
    return seenTaught ? <>Your shape for {seenDigit}, <span className="match-value" /> match</> : `Reading ${seenDigit}, hold still`;
  }
  if (armedDigit !== null) return seenTaught ? <>Your shape, <span className="match-value" /> match. Close to type</> : 'Close your hand to type';
  return 'Hold up a pattern';
}

export function NumberTyping({ typingOn, onToggle, cameraOn, controlOn, isDesktop, hotkey, armedDigit, seenDigit, seenTaught, readoutRef, typed, typedCount, onClear, typingToggle, onChangeToggle, soundsOn, onChangeSounds, controlToggle, gestureSamples, teaching, onTeach, onForget }) {
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
          <Power size={16} strokeWidth={1.5} /> {typingOn ? 'Number typing is on' : 'Turn on number typing'}
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
          <div ref={readoutRef} className={`armed-digit ${armedDigit !== null ? 'ready' : ''} ${seenDigit !== null && armedDigit === null ? 'reading' : ''}`}>
            <small>Ready to type</small>
            <div className="digit-ring">
              {/* Fills as HandTap becomes sure of a pattern. For a taught shape, its strength is how closely the hand matches. */}
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <circle className="ring-track" cx="24" cy="24" r="21" pathLength="1" />
                <circle className="ring-fill" cx="24" cy="24" r="21" pathLength="1" />
              </svg>
              <strong key={armedDigit ?? 'none'} className={armedDigit !== null ? 'digit-pop' : ''}>{armedDigit ?? seenDigit ?? '–'}</strong>
            </div>
            <span className="reading-caption">{readingText(typingOn, armedDigit, seenDigit, seenTaught)}</span>
          </div>
          <div className="typed-output">
            <small>Typed</small>
            <output aria-live="polite">{typed ? <>{typed.slice(0, -1)}<span key={typedCount} className="typed-new">{typed.slice(-1)}</span></> : '–'}</output>
            {typed && <button type="button" className="clear-typed" onClick={onClear}>Clear</button>}
          </div>
        </div>
        <p className="typing-how">Hold a pattern until it shows above, then close your fingers into a fist to type it.</p>
        <p className="teach-status" aria-live="polite">{teachText(teaching, labelOf)}</p>
        <div className={`progress-track ${teaching ? 'on' : ''}`} aria-hidden="true">
          {teaching?.status === 'ready' && <i className="progress-run countdown" />}
          {teaching?.status === 'recording' && <i style={{ transform: `scaleX(${teaching.percent / 100})` }} />}
        </div>
        <ul className="digit-chart">
          {DIGIT_CHART.map(({ digit, label }) => (
            <li key={digit} className={`${armedDigit === digit ? 'ready' : ''} ${teaching?.label === digit ? 'teaching' : ''}`}>
              <kbd>{digit}</kbd>
              <span>{gestureSamples[digit] ? 'Your own hand shape' : label}</span>
              <TeachControls label={digit} name={labelOf(digit)} taught={Boolean(gestureSamples[digit])} {...teachProps} />
            </li>
          ))}
          <li className={teaching?.label === GESTURE_CLOSED ? 'teaching' : ''}>
            <kbd>Type</kbd>
            <span>{gestureSamples[GESTURE_CLOSED] ? 'Your own hand shape' : 'Close into a fist'}</span>
            <TeachControls label={GESTURE_CLOSED} name={labelOf(GESTURE_CLOSED)} taught={Boolean(gestureSamples[GESTURE_CLOSED])} {...teachProps} />
          </li>
        </ul>
      </div>
    </section>
  );
}
