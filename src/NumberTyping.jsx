import React from 'react';
import { Power, Volume2 } from 'lucide-react';
import { DIGIT_CHART } from './tracking.js';
import { TYPING_TOGGLES } from './keybinds.js';
import { GESTURE_CLOSED } from './gesture-model.js';
import { ModuleIndex } from './components/ModuleIndex.jsx';
import { HudFrame } from './components/HudFrame.jsx';
import { DualLayerButton } from './components/DualLayerButton.jsx';
import { SlidingPill } from './components/SlidingPill.jsx';
import { ScrollSection } from './components/ScrollSection.jsx';
import { FluidHoverHighlight } from './components/FluidHoverHighlight.jsx';
import { useFluidHover } from './hooks/useFluidHover.js';

// Finger states [thumb, index, middle, ring, pinky] for each digit pattern
const FINGER_PATTERNS = {
  '1': [false, true, false, false, false],
  '2': [false, true, true, false, false],
  '3': [false, true, true, true, false],
  '4': [false, true, true, true, true],
  '5': [true, true, true, true, true],
  '6': [true, true, false, false, false],
  '7': [true, true, true, false, false],
  '8': [true, true, true, true, false],
  '9': [true, false, false, false, true],
  '0': [false, false, false, false, true],
  closed: [false, false, false, false, false],
};

function FingerDiagram({ patternKey, active }) {
  const fingers = FINGER_PATTERNS[patternKey] || FINGER_PATTERNS.closed;
  const xs = [8, 17, 24, 31, 38];
  const heights = [11, 18, 20, 18, 14];
  return (
    <svg className={`finger-diagram ${active ? 'active' : ''}`} width="46" height="32" viewBox="0 0 46 32" aria-hidden="true">
      <rect x="12" y="21" width="24" height="9" rx="4" className="palm-base" />
      {fingers.map((up, idx) => {
        const h = up ? heights[idx] : 6;
        const y = up ? 22 - h : 16;
        return (
          <rect
            key={xs[idx]}
            x={xs[idx]}
            y={y}
            width="4.5"
            height={h}
            rx="2.25"
            className={up ? 'finger-bar up' : 'finger-bar down'}
          />
        );
      })}
    </svg>
  );
}

function teachText(teaching, labelOf) {
  if (!teaching) return 'Can\u2019t make a pattern? Press Teach and hold any hand shape that feels natural—HandTap learns it locally on this computer.';
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

export function NumberTyping({
  typingOn,
  onToggle,
  cameraOn,
  controlOn,
  isDesktop,
  hotkey,
  armedDigit,
  typed,
  typedCount = 0,
  onClear,
  typingToggle,
  onChangeToggle,
  soundsOn,
  onChangeSounds,
  controlToggle,
  gestureSamples,
  teaching,
  onTeach,
  onForget,
}) {
  const labelOf = (label) => (label === GESTURE_CLOSED ? 'the type gesture' : `number ${label}`);
  const teachProps = { cameraOn, teaching, onTeach, onForget };
  const toggle = TYPING_TOGGLES.find(({ id }) => id === typingToggle);
  const { containerProps, registerItem, hover } = useFluidHover({ axis: 'xy', nearest: true });

  return (
    <ScrollSection className="number-typing" aria-labelledby="number-typing-heading">
      <div className="section-heading">
        <div>
          <ModuleIndex index={4} label="Number typing" />
          <h2 id="number-typing-heading">Type numbers with your fingers</h2>
        </div>
      </div>

      <HudFrame className="keybind-panel">
        <p className="keybind-status" aria-live="polite">{statusText(typingOn, controlOn, isDesktop, toggle)}</p>
        <DualLayerButton
          type="button"
          className={`control-button ${typingOn ? 'active' : ''}`}
          aria-pressed={typingOn}
          disabled={!cameraOn}
          onClick={onToggle}
          hoverText={typingOn ? 'Pause number typing' : 'Start number typing'}
        >
          <Power size={16} strokeWidth={1.6} /> {typingOn ? 'Number typing is on' : 'Turn on number typing'}
          {hotkey && <kbd>{hotkey}</kbd>}
        </DualLayerButton>
        <div className="typing-options">
          <label htmlFor="typing-toggle">Turn on and off with</label>
          <select id="typing-toggle" value={typingToggle} onChange={(event) => onChangeToggle(event.target.value)}>
            {TYPING_TOGGLES.filter(({ id }) => id !== controlToggle).map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            <option value="">No movement</option>
          </select>
          <div className="typing-sound-segmented">
            <span className="audio-cue-label">
              <Volume2 size={15} strokeWidth={1.6} /> Sound cues
            </span>
            <SlidingPill
              options={[
                { id: false, label: 'Off' },
                { id: true, label: 'On' },
              ]}
              value={Boolean(soundsOn)}
              onChange={onChangeSounds}
              ariaLabel="Typing sound cues"
            />
          </div>
        </div>
        <div className="typing-readout">
          <div className={`armed-digit ${armedDigit !== null ? 'ready' : ''}`}>
            <small>Ready to type</small>
            <strong key={armedDigit ?? 'none'} className={armedDigit !== null ? 'digit-pop' : ''}>{armedDigit ?? '–'}</strong>
          </div>
          <div className="typed-output">
            <small>Typed</small>
            <output aria-live="polite">{typed ? <>{typed.slice(0, -1)}<span key={typedCount} className="typed-new">{typed.slice(-1)}</span></> : '–'}</output>
            {typed && (
              <DualLayerButton
                type="button"
                className="clear-typed"
                onClick={onClear}
                hoverText="Clear digits"
              >
                Clear
              </DualLayerButton>
            )}
          </div>
        </div>
        <p className="typing-how">Hold a pattern until it shows above, then close your fingers into a fist to type it. With two hands visible, your other hand can type while the cursor hand keeps moving.</p>
        <p className="teach-status" aria-live="polite">{teachText(teaching, labelOf)}</p>
        <div className={`progress-track ${teaching ? 'on' : ''}`} aria-hidden="true">
          {teaching?.status === 'ready' && <i className="progress-run countdown" />}
          {teaching?.status === 'recording' && <i style={{ transform: `scaleX(${teaching.percent / 100})` }} />}
        </div>

        <div className="fluid-grid-stage" {...containerProps}>
          <FluidHoverHighlight hover={hover} className="digit-hover-pill" />
          <ul className="digit-chart">
            {DIGIT_CHART.map(({ digit, label }) => (
              <li
                key={digit}
                {...registerItem(digit)}
                className={`${armedDigit === digit ? 'ready' : ''} ${teaching?.label === digit ? 'teaching' : ''}`.trim()}
              >
                <div className="digit-card-top">
                  <kbd>{digit}</kbd>
                  <FingerDiagram patternKey={digit} active={armedDigit === digit} />
                </div>
                <span>{gestureSamples[digit] ? 'Your own hand shape' : label}</span>
                <TeachControls label={digit} name={labelOf(digit)} taught={Boolean(gestureSamples[digit])} {...teachProps} />
              </li>
            ))}
            <li
              {...registerItem(GESTURE_CLOSED)}
              className={teaching?.label === GESTURE_CLOSED ? 'teaching' : ''}
            >
              <div className="digit-card-top">
                <kbd>Type</kbd>
                <FingerDiagram patternKey="closed" active={false} />
              </div>
              <span>{gestureSamples[GESTURE_CLOSED] ? 'Your own hand shape' : 'Close into a fist'}</span>
              <TeachControls label={GESTURE_CLOSED} name={labelOf(GESTURE_CLOSED)} taught={Boolean(gestureSamples[GESTURE_CLOSED])} {...teachProps} />
            </li>
          </ul>
        </div>
      </HudFrame>
    </ScrollSection>
  );
}
