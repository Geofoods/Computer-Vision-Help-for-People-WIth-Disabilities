import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Hand, Camera, MousePointer2, Settings2, CircleHelp, Check, AlertCircle, Sparkles, Power } from 'lucide-react';
import { REACH_ZONE, createDigitDetector, createHoldDetector, createMovementDetector, createOneEuroFilter, createPinchDetector, cursorPoint, isLicking, pinchRatio, toScreen } from './tracking.js';
import { loadBindings, loadSoundsOn, loadTypingToggle, saveBindings, saveTypingPreferences } from './keybinds.js';
import { playDigitTyped, playTypingOff, playTypingOn } from './sounds.js';
import { KeybindSection } from './KeybindSection.jsx';
import { NumberTyping } from './NumberTyping.jsx';
import './styles.css';

const CLICK_COOLDOWN = 500;
const SCROLL_COOLDOWN = 1200;
const TYPED_DISPLAY_LENGTH = 24;
// A timer rather than requestAnimationFrame, which stops when the window is hidden
// and would freeze the mouse the moment another app covers this one.
const FRAME_INTERVAL = 33;
const desktop = window.handtapDesktop;

// Starts the detection worker and resolves once its model has loaded.
function createWorker() {
  return new Promise((resolve, reject) => {
    // Resolved next to index.html, where the bundled worker is served in dev and in the build.
    const worker = new Worker(new URL('hand-worker.js', window.location.href));
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') resolve(worker);
      else if (data.type === 'error') reject(new Error(data.message));
    };
    worker.onerror = (event) => reject(new Error(event.message || 'The hand tracking worker failed to start.'));
    worker.postMessage({ type: 'init' });
  });
}

function cameraErrorMessage(error) {
  if (error.name === 'NotAllowedError') return 'Camera permission was denied. Allow camera access and try again.';
  if (error.name === 'NotFoundError') return 'No camera was found. Connect a camera and try again, or restart HandTap if one is already connected.';
  if (error.name === 'NotReadableError') return 'Another app is using the camera. Close it and try again.';
  return 'We could not start the camera. Check camera permissions and try again.';
}

function App() {
  const videoRef = useRef(null);
  const viewRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const workerRef = useRef(null);
  // True while a frame is out with the worker, so frames are dropped rather than queued.
  const busyRef = useRef(false);
  const onLandmarksRef = useRef(() => {});
  const onFaceRef = useRef(() => {});
  const timerRef = useRef(null);
  // Starts at 0 so the placeholder frame shown before the camera's first real frame is skipped.
  const lastVideoTimeRef = useRef(0);
  const cursorRef = useRef(null);
  const lastClickRef = useRef(0);
  const demoButtonRef = useRef(null);
  const pinchRef = useRef(createPinchDetector());
  const movementRef = useRef(createMovementDetector());
  const digitRef = useRef(createDigitDetector());
  const toggleHoldRef = useRef(createHoldDetector());
  const lastScrollRef = useRef(0);
  const tongueRef = useRef(false);
  const faceLandmarksRef = useRef(null);
  const filterXRef = useRef(createOneEuroFilter());
  const filterYRef = useRef(createOneEuroFilter());
  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gesture, setGesture] = useState('Waiting for camera');
  const [strength, setStrength] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [sensitivity, setSensitivity] = useState(50);
  const [nativeError, setNativeError] = useState('');
  const [controlOn, setControlOn] = useState(false);
  const [hotkey, setHotkey] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [demoClicks, setDemoClicks] = useState(0);
  const [tongueLicks, setTongueLicks] = useState(0);
  const [tongueActive, setTongueActive] = useState(false);
  const [tongueAvailable, setTongueAvailable] = useState(true);
  const [bindings, setBindings] = useState(() => loadBindings(window.localStorage));
  const [lastMovement, setLastMovement] = useState(null);
  const [typingOn, setTypingOn] = useState(false);
  const [typingHotkey, setTypingHotkey] = useState(null);
  const [typingToggle, setTypingToggle] = useState(() => loadTypingToggle(window.localStorage));
  const [soundsOn, setSoundsOn] = useState(() => loadSoundsOn(window.localStorage));
  const [armedDigit, setArmedDigit] = useState(null);
  const [typed, setTyped] = useState('');

  // The detection loop runs outside React's render cycle, so it reads current values
  // from refs. Values captured in a closure would never update once the loop started.
  const sensitivityRef = useRef(sensitivity);
  sensitivityRef.current = sensitivity;
  const controlRef = useRef(controlOn);
  controlRef.current = controlOn;
  const typingRef = useRef(typingOn);
  typingRef.current = typingOn;
  const typingToggleRef = useRef(typingToggle);
  typingToggleRef.current = typingToggle;
  const soundsRef = useRef(soundsOn);
  soundsRef.current = soundsOn;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const setBinding = useCallback((id, combo) => {
    setBindings((current) => {
      const next = { ...current };
      if (combo) next[id] = combo;
      else delete next[id];
      return next;
    });
  }, []);

  useEffect(() => saveBindings(window.localStorage, bindings), [bindings]);
  useEffect(() => saveTypingPreferences(window.localStorage, typingToggle, soundsOn), [typingToggle, soundsOn]);

  // Covers every way of toggling, and is the only sign of it from inside another app.
  const wasTypingRef = useRef(typingOn);
  useEffect(() => {
    if (wasTypingRef.current === typingOn) return;
    wasTypingRef.current = typingOn;
    if (soundsRef.current) (typingOn ? playTypingOn : playTypingOff)();
  }, [typingOn]);

  const resetTracking = () => {
    pinchRef.current.reset();
    movementRef.current.reset();
    digitRef.current.reset();
    toggleHoldRef.current.reset();
    setArmedDigit(null);
    filterXRef.current.reset();
    filterYRef.current.reset();
    cursorRef.current?.classList.remove('visible');
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setStrength(0);
  };

  const stopCamera = useCallback(() => {
    clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    lastVideoTimeRef.current = 0;
    busyRef.current = false;
    setCameraOn(false);
    setControlOn(false);
    setTypingOn(false);
    setGesture('Camera paused');
    setTongueActive(false);
    tongueRef.current = false;
    faceLandmarksRef.current = null;
    resetTracking();
  }, []);

  const triggerClick = useCallback(async (position) => {
    const now = performance.now();
    if (now - lastClickRef.current < CLICK_COOLDOWN) return;
    lastClickRef.current = now;
    setNativeError('');
    setClicks((value) => value + 1);
    try {
      if (desktop && controlRef.current) {
        await desktop.clickAt(position);
      } else {
        demoButtonRef.current?.click();
      }
    } catch (clickError) {
      setNativeError(clickError.message || 'The desktop click could not be completed.');
    }
  }, []);

  const triggerMovement = useCallback(async (id) => {
    // Number typing is made of poses, so only a swipe can mean something else while it's on.
    if (typingRef.current && !id.startsWith('swipe')) return;
    setLastMovement({ id });
    // A tap used as the toggle is handled as a hold in handleLandmarks instead.
    if (id === typingToggleRef.current) {
      if (id.startsWith('swipe')) setTypingOn((value) => !value);
      return;
    }
    const combo = bindingsRef.current[id];
    if (typingRef.current || !combo || !desktop || !controlRef.current) return;
    setNativeError('');
    try {
      await desktop.pressKeys(combo);
    } catch (keyError) {
      setNativeError(keyError.message || 'The shortcut could not be pressed.');
    }
  }, []);

  const typeDigit = useCallback(async (digit) => {
    setTyped((value) => (value + digit).slice(-TYPED_DISPLAY_LENGTH));
    if (soundsRef.current) playDigitTyped();
    if (!desktop || !controlRef.current) return;
    setNativeError('');
    try {
      await desktop.pressKeys(digit);
    } catch (keyError) {
      setNativeError(keyError.message || 'The number could not be typed.');
    }
  }, []);

  const handleFace = useCallback(({ landmarks, blendshapes }) => {
    const licking = isLicking(blendshapes);
    faceLandmarksRef.current = landmarks;
    setTongueActive(licking);
    if (licking && !tongueRef.current) {
      setTongueLicks((value) => value + 1);
      const now = performance.now();
      if (desktop && controlRef.current && now - lastScrollRef.current > SCROLL_COOLDOWN) {
        lastScrollRef.current = now;
        desktop.scrollDown().catch((scrollError) => {
          setNativeError(scrollError.message || 'The page could not be scrolled.');
        });
      }
    }
    tongueRef.current = licking;
  }, []);
  onFaceRef.current = handleFace;

  // Drawn after the hand, which clears the canvas, on every frame so it doesn't flicker
  // between the less frequent face results.
  const drawMouth = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const landmarks = faceLandmarksRef.current;
    if (!canvas || !video || !landmarks) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    const [upperLip, lowerLip, leftCorner, rightCorner] = [13, 14, 61, 291].map((index) => landmarks[index]);
    const context = canvas.getContext('2d');
    context.strokeStyle = tongueRef.current ? '#67e8a4' : '#f2b84b';
    context.lineWidth = 5;
    context.beginPath();
    context.ellipse(
      ((leftCorner.x + rightCorner.x) / 2) * canvas.width,
      ((upperLip.y + lowerLip.y) / 2) * canvas.height,
      Math.max(12, (Math.abs(rightCorner.x - leftCorner.x) * canvas.width) / 2),
      Math.max(8, (Math.abs(lowerLip.y - upperLip.y) * canvas.height) / 2 + 5),
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  };

  const drawLandmarks = (landmarks, pinching) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const context = canvas.getContext('2d');
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#9b8cff';
    landmarks.forEach(({ x, y }) => {
      context.beginPath();
      context.arc(x * canvas.width, y * canvas.height, 5, 0, Math.PI * 2);
      context.fill();
    });
    const thumb = landmarks[4];
    const index = landmarks[8];
    context.strokeStyle = pinching ? '#67e8a4' : '#f2b84b';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(thumb.x * canvas.width, thumb.y * canvas.height);
    context.lineTo(index.x * canvas.width, index.y * canvas.height);
    context.stroke();
  };

  const handleLandmarks = useCallback((landmarks, now) => {
    const video = videoRef.current;
    if (!landmarks) {
      setGesture('Show one hand to camera');
      resetTracking();
      drawMouth();
      return;
    }

    const point = cursorPoint(landmarks);
    const smoothed = { x: filterXRef.current.filter(point.x, now), y: filterYRef.current.filter(point.y, now) };
    const aspect = video.videoWidth / video.videoHeight;
    const ratio = pinchRatio(landmarks, aspect);
    const { movement, pose } = movementRef.current.update(landmarks, { aspect, now, sensitivity: sensitivityRef.current });
    // Making a bound pose can bring the index near the thumb, which shouldn't also click.
    // Unbound poses leave clicking exactly as it is for people not using keybinds.
    const poseIsToggle = Boolean(pose) && pose === typingToggleRef.current;
    const poseIsBound = poseIsToggle || Boolean(pose && bindingsRef.current[pose]);
    const typing = typingRef.current;
    if (toggleHoldRef.current.update(poseIsToggle, now)) setTypingOn((value) => !value);
    const { pinching, justPinched } = pinchRef.current.update(typing || poseIsBound ? Infinity : ratio, sensitivityRef.current);
    if (typing && !poseIsToggle) {
      const { digit, armed } = digitRef.current.update(landmarks, aspect);
      setArmedDigit(armed);
      if (digit !== null) typeDigit(digit);
    } else {
      digitRef.current.reset();
      setArmedDigit(null);
    }
    const screenPosition = toScreen(smoothed);

    drawLandmarks(landmarks, pinching);
    drawMouth();
    if (cursorRef.current) {
      cursorRef.current.style.left = `${smoothed.x * 100}%`;
      cursorRef.current.style.top = `${smoothed.y * 100}%`;
      cursorRef.current.classList.add('visible');
    }
    setStrength(Math.max(0, Math.min(100, Math.round((1 - ratio) * 100))));
    setGesture(typing ? 'Typing numbers' : pinching ? 'Tap detected' : 'Hand ready');

    if (desktop && controlRef.current && !typing) desktop.moveTo(screenPosition);
    if (justPinched) triggerClick(screenPosition);
    if (movement) triggerMovement(movement);
  }, [triggerClick, triggerMovement, typeDigit]);
  onLandmarksRef.current = handleLandmarks;

  const scheduleFrame = useCallback(() => {
    timerRef.current = setTimeout(async () => {
      const video = videoRef.current;
      const worker = workerRef.current;
      // Skip ticks that arrive before the camera has a new frame, or while the worker is busy.
      if (video && worker && !busyRef.current && video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        busyRef.current = true;
        try {
          const bitmap = await createImageBitmap(video);
          worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now() }, [bitmap]);
        } catch (frameError) {
          busyRef.current = false;
          console.error(frameError);
        }
      }
      if (streamRef.current) scheduleFrame();
    }, FRAME_INTERVAL);
  }, []);

  const startCamera = async () => {
    setLoading(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      // Fires when the camera dies on its own (unplugged, driver crash), not on a normal stop.
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopCamera();
        setError('The camera stopped unexpectedly. Press Start camera to try again.');
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch (cameraError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(cameraErrorMessage(cameraError));
      setLoading(false);
      return;
    }
    try {
      if (!workerRef.current) {
        // Kept across pauses, so restarting the camera doesn't reload the model.
        const worker = await createWorker();
        worker.onmessage = ({ data }) => {
          // Only tongue tracking can still fail once the hand model is running.
          if (data.type === 'face-unavailable' || data.type === 'error') setTongueAvailable(false);
          if (data.type !== 'result') return;
          busyRef.current = false;
          if (!streamRef.current) return;
          if (data.face) onFaceRef.current(data.face);
          onLandmarksRef.current(data.landmarks, performance.now());
        };
        workerRef.current = worker;
      }
      // The camera may have stopped while the model was loading.
      if (!streamRef.current) return;
      setCameraOn(true);
      setGesture('Show one hand to camera');
      scheduleFrame();
    } catch (modelError) {
      console.error(modelError);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(`Hand tracking could not load (${modelError.message}). Restart HandTap and try again.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => {
    stopCamera();
    workerRef.current?.terminate();
    workerRef.current = null;
  }, [stopCamera]);

  useEffect(() => {
    desktop?.getTypingHotkey().then(setTypingHotkey);
    return desktop?.onToggleTyping(() => {
      if (streamRef.current) setTypingOn((value) => !value);
    });
  }, []);

  useEffect(() => {
    desktop?.getHotkey().then(setHotkey);
    return desktop?.onToggleControl(() => {
      if (streamRef.current) setControlOn((value) => !value);
    });
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Hand size={21} strokeWidth={2.5} /></span>
          <span>hand<span>tap</span></span>
        </div>
        <div className="topbar-actions">
          <span className="privacy-pill"><span className="privacy-dot" /> Camera stays on this device</span>
          <button
            className="icon-button"
            aria-label="Help"
            aria-expanded={helpOpen}
            aria-controls="help-panel"
            onClick={() => setHelpOpen((value) => !value)}
          >
            <CircleHelp size={20} />
          </button>
        </div>
      </header>

      {helpOpen && (
        <section id="help-panel" className="help-panel" aria-label="Help">
          <h2>Getting good results</h2>
          <ul>
            <li>Sit about an arm's length from the camera, with your whole hand in good light.</li>
            <li>Moving your hand inside the dashed box moves the cursor across your whole screen.</li>
            <li>If taps are missed, raise the sensitivity. If clicks fire by accident, lower it.</li>
            <li>To get the regular mouse back, lower your hand out of view{hotkey ? ` or press ${hotkey}` : ''}.</li>
            <li>While mouse control is on, sticking out your tongue scrolls down the window under the cursor.</li>
            <li>To type a number, turn on number typing, hold up its fingers until it shows as ready, then close your hand. The chart under Number typing shows each pattern, and you can choose the movement that turns it on and off.</li>
            <li>Keybinds press a keyboard shortcut when you make a movement. A fast cursor move can count as a swipe, so only give swipes a shortcut if you want them.</li>
          </ul>
        </section>
      )}

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15} /> Accessible interaction</div>
          <h1>Click with a<br /><em>simple tap.</em></h1>
          <p>Use your camera to move the mouse with your hand, and tap your thumb and index finger to click. No mouse or touchpad required.</p>
          <div className="how-it-works">
            <div className="step"><span>1</span><div><strong>Start your camera</strong><small>Allow access when asked</small></div></div>
            <div className="step"><span>2</span><div><strong>Tap thumb + index</strong><small>Try it on the test button below</small></div></div>
            <div className="step"><span>3</span><div><strong>Turn on mouse control</strong><small>Your hand now moves the real cursor</small></div></div>
          </div>
        </div>

        <div className="camera-card">
          <div className="camera-header">
            <div><span className={`status-dot ${cameraOn ? 'live' : ''}`} /> {cameraOn ? 'Camera active' : 'Camera preview'}</div>
            <span className="live-label">{cameraOn ? 'LIVE' : 'READY'}</span>
          </div>
          <div ref={viewRef} className="camera-view">
            <video
              ref={videoRef}
              className={cameraOn ? 'visible' : ''}
              playsInline
              muted
              // Match the preview to the camera's shape so the overlay lines up with the hand.
              // Chromium reports a placeholder size at first, so this can't be read once at startup.
              onResize={({ currentTarget: { videoWidth, videoHeight } }) => {
                viewRef.current.style.aspectRatio = `${videoWidth} / ${videoHeight}`;
              }}
            />
            <canvas ref={canvasRef} />
            {cameraOn && (
              <div
                className="reach-zone"
                aria-hidden="true"
                style={{
                  left: `${REACH_ZONE.left * 100}%`,
                  right: `${(1 - REACH_ZONE.right) * 100}%`,
                  top: `${REACH_ZONE.top * 100}%`,
                  bottom: `${(1 - REACH_ZONE.bottom) * 100}%`,
                }}
              />
            )}
            <div ref={cursorRef} className="fake-cursor" aria-hidden="true"><MousePointer2 size={26} /></div>
            {!cameraOn && <div className="camera-placeholder"><div className="camera-icon"><Camera size={28} /></div><strong>Your hand will appear here</strong><span>Position your hand clearly in view</span></div>}
            {cameraOn && <div className="tracking-label"><span className="tracking-dot" /> Tracking hand</div>}
          </div>
          {error && <div className="error-message" role="alert"><AlertCircle size={16} /> {error}</div>}
          <div className="camera-hint"><MousePointer2 size={14} /> The dashed box is your whole screen</div>
          <div className={`tongue-status ${tongueActive ? 'active' : ''}`}><span /> Tongue tracking: {!tongueAvailable ? 'unavailable' : tongueActive ? (controlOn ? 'scrolling down' : 'lick detected') : 'ready'} · {tongueLicks} {tongueLicks === 1 ? 'lick' : 'licks'}</div>
          <button className={`camera-button ${cameraOn ? 'stop' : ''}`} onClick={cameraOn ? stopCamera : startCamera} disabled={loading}>
            {loading ? 'Loading hand tracking…' : cameraOn ? 'Pause camera' : 'Start camera'}
          </button>
          {desktop ? (
            <button
              className={`control-button ${controlOn ? 'active' : ''}`}
              aria-pressed={controlOn}
              disabled={!cameraOn}
              onClick={() => setControlOn((value) => !value)}
            >
              <Power size={15} /> {controlOn ? 'Mouse control is on' : 'Turn on mouse control'}
              {hotkey && <kbd>{hotkey}</kbd>}
            </button>
          ) : (
            <p className="camera-hint">Controlling the real mouse needs the HandTap desktop app.</p>
          )}
        </div>
      </section>

      <section className="workspace">
        <div className="section-heading"><div><p className="eyebrow">Live feedback</p><h2>Make a test click</h2></div><div className="feedback-counts"><div className="click-count"><MousePointer2 size={16} /> {clicks} {clicks === 1 ? 'click' : 'clicks'}</div><div className="click-count lick-count"><Hand size={16} /> {tongueLicks} {tongueLicks === 1 ? 'lick' : 'licks'}</div></div></div>
        <div className="feedback-grid">
          <div className="demo-panel">
            <p className="panel-label">Interaction area</p>
            <button ref={demoButtonRef} className="demo-button" onClick={() => setDemoClicks((value) => value + 1)}>
              {demoClicks > 0
                ? <span key={demoClicks} className="demo-flash"><Check size={23} /></span>
                : <MousePointer2 size={23} />}
              <span>{demoClicks > 0 ? `Clicked ${demoClicks} ${demoClicks === 1 ? 'time' : 'times'}` : 'Tap your fingers to press me'}</span>
              <small>{controlOn ? 'Move the cursor here, then tap' : 'While mouse control is off, every tap presses this button'}</small>
            </button>
            <div className="success-note"><Check size={16} /> Taps stay inside this app until you turn on mouse control</div>
          </div>
          <aside className="status-panel">
            <p className="panel-label">Gesture status</p>
            <div className={`gesture-state ${gesture === 'Tap detected' ? 'detected' : ''}`}><span className="state-icon"><Hand size={22} /></span><div aria-live="polite"><strong>{gesture}</strong><small>{cameraOn ? 'Keep your hand in frame' : 'Start the camera to begin'}</small></div></div>
            <div className="meter-row"><span>Pinch strength</span><strong>{strength}%</strong></div>
            <div className="meter"><span style={{ width: `${strength}%` }} /></div>
            <div className="settings-title"><Settings2 size={15} /> Sensitivity <strong>{sensitivity}%</strong></div>
            <input aria-label="Gesture sensitivity" type="range" min="20" max="80" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} />
            {nativeError && <div className="error-message" role="alert"><AlertCircle size={16} /> {nativeError}</div>}
          </aside>
        </div>
      </section>

      <NumberTyping
        typingOn={typingOn}
        onToggle={() => setTypingOn((value) => !value)}
        cameraOn={cameraOn}
        controlOn={controlOn}
        isDesktop={Boolean(desktop)}
        hotkey={typingHotkey}
        armedDigit={armedDigit}
        typed={typed}
        onClear={() => setTyped('')}
        typingToggle={typingToggle}
        onChangeToggle={setTypingToggle}
        soundsOn={soundsOn}
        onChangeSounds={setSoundsOn}
      />

      <KeybindSection
        bindings={bindings}
        onChange={setBinding}
        lastMovement={lastMovement}
        controlOn={controlOn}
        isDesktop={Boolean(desktop)}
        typingToggle={typingToggle}
      />

      <footer><span>handtap is designed for privacy and ease of use.</span><span>Processing happens locally on this computer.</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
