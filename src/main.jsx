import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Hand, Camera, MousePointer2, Settings2, CircleHelp, Check, AlertCircle, Power } from 'lucide-react';
import { HOLD_MS, REACH_ZONE, computeReachZone, createDigitDetector, createFaceGestureDetector, createHoldDetector, createMovementDetector, createOneEuroFilter, createPinchDetector, cursorPoint, headPitch, headPitchStrength, headTilt, isLicking, pinchRatio, toScreen } from './tracking.js';
import { loadBindings, loadSoundsOn, loadTypingToggle, saveBindings, saveTypingPreferences } from './keybinds.js';
import { playControlOff, playControlOn, playDigitTyped, playTypingOff, playTypingOn } from './sounds.js';
import { SAMPLES_PER_TEACH, addSamples, createGestureModel, forgetLabel, handFeatures } from './gesture-model.js';
import { loadAutoStart, loadControlToggle, loadGestureSamples, loadReachZone, saveAutoStart, saveControlToggle, saveGestureSamples, saveReachZone } from './preferences.js';
import { KeybindSection } from './KeybindSection.jsx';
import { NumberTyping } from './NumberTyping.jsx';
import { SetupPanel } from './SetupPanel.jsx';
import './styles.css';

const CLICK_COOLDOWN = 500;
const SCROLL_COOLDOWN = 1200;
const TYPED_DISPLAY_LENGTH = 24;
const TEACH_COUNTDOWN = 1500;
const MODE_NOTICE_TIME = 1600;
// Heads move naturally while people talk and look around, so a tilt has to be held.
const HEAD_TILT_HOLD = 400;
const REACH_CAPTURE_TIME = 5000;
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

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Added straight to the DOM so a click never waits on a React render, and removes itself.
function showClickRipple(view, cursor) {
  if (!view || !cursor?.classList.contains('visible') || prefersReducedMotion()) return;
  const ripple = document.createElement('span');
  ripple.className = 'click-ripple';
  ripple.style.left = cursor.style.left;
  ripple.style.top = cursor.style.top;
  ripple.addEventListener('animationend', () => ripple.remove());
  view.append(ripple);
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
  const controlHoldRef = useRef(createHoldDetector());
  // Set while learning from the hand. Nothing else acts on the hand during these.
  const teachRef = useRef(null);
  const reachCaptureRef = useRef(null);
  const lastScrollRef = useRef(0);
  const lastPositionRef = useRef(null);
  const tongueRef = useRef(false);
  const headTiltRef = useRef(null);
  const headTiltHoldRef = useRef(createHoldDetector({ holdMs: HEAD_TILT_HOLD }));
  const headScrollRef = useRef({ id: null, last: 0 });
  const faceGestureRef = useRef(createFaceGestureDetector());
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
  const [typedCount, setTypedCount] = useState(0);
  const [holding, setHolding] = useState(null);
  const [modeNotice, setModeNotice] = useState(null);
  const [controlToggle, setControlToggle] = useState(() => loadControlToggle(window.localStorage, typingToggle, bindings));
  const [autoStart, setAutoStart] = useState(() => loadAutoStart(window.localStorage));
  const [reachZone, setReachZone] = useState(() => loadReachZone(window.localStorage));
  const [reachCapturing, setReachCapturing] = useState(false);
  const [reachMessage, setReachMessage] = useState('');
  const [gestureSamples, setGestureSamples] = useState(() => loadGestureSamples(window.localStorage));
  const [handsDetected, setHandsDetected] = useState(0);
  const [teaching, setTeaching] = useState(null);
  const gestureModel = useMemo(() => createGestureModel(gestureSamples), [gestureSamples]);

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
  const controlToggleRef = useRef(controlToggle);
  controlToggleRef.current = controlToggle;
  const reachZoneRef = useRef(reachZone);
  reachZoneRef.current = reachZone;
  const gestureModelRef = useRef(gestureModel);
  gestureModelRef.current = gestureModel;
  const soundsRef = useRef(soundsOn);
  soundsRef.current = soundsOn;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const setBinding = useCallback((id, combo) => {
    setBindings((current) => {
      const next = { ...current };
      next[id] = combo;
      return next;
    });
  }, []);

  useEffect(() => saveBindings(window.localStorage, bindings), [bindings]);
  useEffect(() => saveTypingPreferences(window.localStorage, typingToggle, soundsOn), [typingToggle, soundsOn]);
  useEffect(() => saveControlToggle(window.localStorage, controlToggle), [controlToggle]);
  useEffect(() => saveAutoStart(window.localStorage, autoStart), [autoStart]);
  useEffect(() => saveReachZone(window.localStorage, reachZone === REACH_ZONE ? null : reachZone), [reachZone]);
  useEffect(() => saveGestureSamples(window.localStorage, gestureSamples), [gestureSamples]);

  // Covers every way of toggling, and is the only sign of it from inside another app.
  const wasTypingRef = useRef(typingOn);
  useEffect(() => {
    if (wasTypingRef.current === typingOn) return;
    wasTypingRef.current = typingOn;
    if (soundsRef.current) (typingOn ? playTypingOn : playTypingOff)();
    setModeNotice({ text: typingOn ? 'Number typing on' : 'Number typing off', on: typingOn, id: performance.now() });
  }, [typingOn]);

  const wasControlRef = useRef(controlOn);
  useEffect(() => {
    if (wasControlRef.current === controlOn) return;
    wasControlRef.current = controlOn;
    if (soundsRef.current) (controlOn ? playControlOn : playControlOff)();
    setModeNotice({ text: controlOn ? 'Mouse control on' : 'Mouse control off', on: controlOn, id: performance.now() });
  }, [controlOn]);

  useEffect(() => {
    if (!modeNotice) return undefined;
    const timer = setTimeout(() => setModeNotice(null), MODE_NOTICE_TIME);
    return () => clearTimeout(timer);
  }, [modeNotice]);

  const resetTracking = () => {
    pinchRef.current.reset();
    movementRef.current.reset();
    digitRef.current.reset();
    toggleHoldRef.current.reset();
    controlHoldRef.current.reset();
    setArmedDigit(null);
    setHolding(null);
    cursorRef.current?.classList.remove('pressed');
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
    setHandsDetected(0);
    setControlOn(false);
    setTypingOn(false);
    setGesture('Camera paused');
    setTongueActive(false);
    tongueRef.current = false;
    headTiltRef.current = null;
    headTiltHoldRef.current.reset();
    headScrollRef.current = { id: null, last: 0 };
    faceGestureRef.current.reset();
    faceLandmarksRef.current = null;
    teachRef.current = null;
    setTeaching(null);
    reachCaptureRef.current = null;
    setReachCapturing(false);
    resetTracking();
  }, []);

  const triggerClick = useCallback(async (position) => {
    const now = performance.now();
    if (now - lastClickRef.current < CLICK_COOLDOWN) return;
    lastClickRef.current = now;
    setNativeError('');
    setClicks((value) => value + 1);
    showClickRipple(viewRef.current, cursorRef.current);
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

  const triggerMovement = useCallback(async (id, position, intensity = 1) => {
    // Learning from the hand shouldn't press anything, including from the face.
    if (teachRef.current || reachCaptureRef.current) return;
    // Number typing is made of poses, so only a swipe can mean something else while it's on.
    if (typingRef.current && !id.startsWith('swipe')) return;
    setLastMovement({ id });
    // A tap used as a toggle is handled as a hold in handleLandmarks instead.
    if (id === typingToggleRef.current) {
      if (id.startsWith('swipe')) setTypingOn((value) => !value);
      return;
    }
    if (id === controlToggleRef.current) {
      if (id.startsWith('swipe') && desktop && !typingRef.current) setControlOn((value) => !value);
      return;
    }
    const combo = bindingsRef.current[id];
    if (typingRef.current || !combo) return;
    // Handled here, ahead of the check below, because a click with mouse control off still
    // presses the test button. A movement with no position of its own uses the cursor's.
    if (combo === 'Left Click') {
      const target = position ?? lastPositionRef.current;
      if (target) triggerClick(target);
      return;
    }
    if (!desktop || !controlRef.current) return;
    setNativeError('');
    try {
      if (combo === 'Scroll Down' || combo === 'Scroll Up') {
        const direction = combo === 'Scroll Down' ? -1 : 1;
        const amount = direction * Math.round(120 * (1 + 4 * Math.min(1, Math.max(0, intensity))));
        if (intensity < 1 || id === 'headTiltUp' || id === 'headTiltDown') await desktop.scrollBy(amount);
        else if (combo === 'Scroll Down') await desktop.scrollDown();
        else await desktop.scrollBy(amount);
      } else {
        await desktop.pressKeys(combo);
      }
    } catch (keyError) {
      setNativeError(keyError.message || 'The shortcut could not be pressed.');
    }
  }, [triggerClick]);

  const typeDigit = useCallback(async (digit) => {
    setTyped((value) => (value + digit).slice(-TYPED_DISPLAY_LENGTH));
    setTypedCount((value) => value + 1);
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
    const pitch = headPitchStrength(landmarks);
    const tilt = headTilt(landmarks) ?? pitch?.id ?? null;
    if (tilt !== headTiltRef.current) {
      headTiltRef.current = tilt;
      headTiltHoldRef.current.reset();
    }
    const now = performance.now();
    if (headTiltHoldRef.current.update(Boolean(tilt), now)) triggerMovement(tilt, undefined, pitch?.intensity ?? 1);
    if (pitch && headTiltHoldRef.current.hasFired() && now - headScrollRef.current.last >= 120) {
      headScrollRef.current = { id: pitch.id, last: now };
      triggerMovement(pitch.id, undefined, pitch.intensity);
    }
    for (const gesture of faceGestureRef.current.update(blendshapes)) triggerMovement(gesture);
    setTongueActive(licking);
    if (licking && !tongueRef.current) {
      setTongueLicks((value) => value + 1);
      const now = performance.now();
      if (desktop && controlRef.current && now - lastScrollRef.current > SCROLL_COOLDOWN) {
        lastScrollRef.current = now;
        triggerMovement('tongueLick');
      }
    }
    tongueRef.current = licking;
  }, [triggerMovement]);
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
    context.strokeStyle = tongueRef.current ? '#4cc38a' : '#e5a00d';
    context.lineWidth = 4;
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

  const drawLandmarks = (landmarks, pinching, otherLandmarks = null) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const context = canvas.getContext('2d');
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#efe9de';
    landmarks.forEach(({ x, y }) => {
      context.beginPath();
      context.arc(x * canvas.width, y * canvas.height, 4, 0, Math.PI * 2);
      context.fill();
    });
    const thumb = landmarks[4];
    const index = landmarks[8];
    context.strokeStyle = pinching ? '#4cc38a' : '#e5a00d';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(thumb.x * canvas.width, thumb.y * canvas.height);
    context.lineTo(index.x * canvas.width, index.y * canvas.height);
    context.stroke();
    if (otherLandmarks) {
      context.fillStyle = '#7dd3fc';
      otherLandmarks.forEach(({ x, y }) => {
        context.beginPath();
        context.arc(x * canvas.width, y * canvas.height, 4, 0, Math.PI * 2);
        context.fill();
      });
      context.strokeStyle = '#7dd3fc';
      context.beginPath();
      context.moveTo(otherLandmarks[4].x * canvas.width, otherLandmarks[4].y * canvas.height);
      context.lineTo(otherLandmarks[8].x * canvas.width, otherLandmarks[8].y * canvas.height);
      context.stroke();
    }
  };

  const handleLandmarks = useCallback((landmarks, now, otherLandmarks = null) => {
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

    const teach = teachRef.current;
    if (teach && now >= teach.startsAt) {
      const features = handFeatures(landmarks, aspect);
      if (features) teach.samples.push(features);
      setTeaching({ label: teach.label, status: 'recording', percent: Math.round((teach.samples.length / SAMPLES_PER_TEACH) * 100) });
      if (teach.samples.length >= SAMPLES_PER_TEACH) {
        teachRef.current = null;
        setTeaching(null);
        setGestureSamples((current) => addSamples(current, teach.label, teach.samples));
        if (soundsRef.current) playDigitTyped();
      }
    }
    const reach = reachCaptureRef.current;
    if (reach) {
      // Capture the raw hand position so smoothing cannot shrink a person's usable range.
      reach.points.push(point);
      if (now >= reach.until) {
        const zone = computeReachZone(reach.points);
        reachCaptureRef.current = null;
        setReachCapturing(false);
        if (zone) setReachZone(zone);
        setReachMessage(zone ? 'Done. This space now covers your whole screen.' : 'That was a very small movement. Try moving a little further, or check your hand stays in view.');
        if (zone && soundsRef.current) playDigitTyped();
      }
    }
    // Learning from the hand shouldn't also click, type or move the mouse.
    const capturing = Boolean(teachRef.current || reachCaptureRef.current);

    const { movement, pose } = movementRef.current.update(landmarks, { aspect, now, sensitivity: sensitivityRef.current });
    const typing = typingRef.current;
    const poseIsToggle = Boolean(pose) && pose === typingToggleRef.current;
    const poseIsControlToggle = Boolean(pose) && pose === controlToggleRef.current && !typing;
    if (toggleHoldRef.current.update(poseIsToggle && !capturing, now)) setTypingOn((value) => !value);
    if (controlHoldRef.current.update(poseIsControlToggle && !capturing && Boolean(desktop), now)) setControlOn((value) => !value);
    setHolding(toggleHoldRef.current.isHolding() ? 'typing' : controlHoldRef.current.isHolding() ? 'control' : null);
    // Making these poses can bring the index near the thumb, which shouldn't also click.
    // A closing hand reads as a pinch on real photos, so a fist never clicks.
    const poseBlocksClick = pose === 'fist' || poseIsToggle || poseIsControlToggle || Boolean(pose && bindingsRef.current[pose]);
    const { pinching, justPinched } = pinchRef.current.update(typing || capturing || poseBlocksClick ? Infinity : ratio, sensitivityRef.current);
    if (typing && !poseIsToggle && !capturing) {
      // When available, type from the second hand so the cursor hand remains independent.
      const digitLandmarks = otherLandmarks ?? landmarks;
      const { digit, armed } = digitRef.current.update(digitLandmarks, aspect, gestureModelRef.current);
      setArmedDigit(armed);
      if (digit !== null) typeDigit(digit);
    } else {
      digitRef.current.reset();
      setArmedDigit(null);
    }
    const screenPosition = toScreen(smoothed, reachZoneRef.current);
    lastPositionRef.current = screenPosition;

    drawLandmarks(landmarks, pinching, otherLandmarks);
    drawMouth();
    if (cursorRef.current) {
      cursorRef.current.style.left = `${smoothed.x * 100}%`;
      cursorRef.current.style.top = `${smoothed.y * 100}%`;
      cursorRef.current.classList.add('visible');
      cursorRef.current.classList.toggle('pressed', pinching);
    }
    setStrength(Math.max(0, Math.min(100, Math.round((1 - ratio) * 100))));
    setGesture(capturing ? 'Learning your hand' : typing ? 'Typing numbers' : pinching ? 'Tap detected' : 'Hand ready');

    // Number typing must not freeze the cursor hand. With one visible hand it also
    // remains the typing hand, preserving the original single-hand workflow.
    if (desktop && controlRef.current && !capturing) desktop.moveTo(screenPosition);
    if (justPinched) triggerMovement('indexTap', screenPosition);
    if (movement && !capturing) triggerMovement(movement, screenPosition);
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
          setHandsDetected(data.hands?.length ?? (data.landmarks ? 1 : 0));
          if (data.face) onFaceRef.current(data.face);
          const otherHand = data.hands?.[1]?.landmarks ?? null;
          onLandmarksRef.current(data.landmarks, performance.now(), otherHand);
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

  const teachGesture = useCallback((label) => {
    teachRef.current = { label, startsAt: performance.now() + TEACH_COUNTDOWN, samples: [] };
    setTeaching({ label, status: 'ready', percent: 0 });
  }, []);

  const calibrateReach = useCallback(() => {
    reachCaptureRef.current = { until: performance.now() + REACH_CAPTURE_TIME, points: [] };
    setReachCapturing(true);
    setReachMessage('Keep moving your hand around for five seconds…');
  }, []);

  // Runs once, so someone who can't reach the button doesn't need it to get going.
  useEffect(() => {
    if (autoStart) startCamera();
  }, []);

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
          <span className="brand-mark"><Hand size={16} strokeWidth={1.5} /></span>
          <span>HandTap</span>
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
            <CircleHelp size={16} strokeWidth={1.5} />
            <span>Help</span>
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
            <li>If reaching the screen's corners is hard, calibrate your reach so a smaller movement covers the whole screen.</li>
            <li>To type a number, turn on number typing, hold up its fingers until it shows as ready, then close your hand. The chart under Number typing shows each pattern, and you can choose the movement that turns it on and off.</li>
            <li>Keybinds press a keyboard shortcut when you make a movement. A fast cursor move can count as a swipe, so only give swipes a shortcut if you want them.</li>
          </ul>
        </section>
      )}

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Hands-free mouse and keyboard</div>
          <h1>Control your computer with one hand</h1>
          <p>Use your camera to move the mouse with your hand, and tap your thumb and index finger to click. No mouse or touchpad required.</p>
          <div className="how-it-works">
            <div className="step"><kbd>1</kbd><div><strong>Start your camera</strong><small>Allow access when asked</small></div></div>
            <div className="step"><kbd>2</kbd><div><strong>Tap thumb and index</strong><small>Try it on the test button below</small></div></div>
            <div className="step"><kbd>3</kbd><div><strong>Turn on mouse control</strong><small>Your hand now moves the real cursor</small></div></div>
          </div>
        </div>

        <div className="camera-card">
          <div className="camera-header">
            <div><span className={`status-dot ${cameraOn ? 'live' : ''}`} /> {cameraOn ? 'Camera active' : 'Camera preview'}</div>
            <span className="live-label">{cameraOn ? 'Live' : 'Ready'}</span>
          </div>
          <div ref={viewRef} className={`camera-view ${typingOn ? 'mode-typing' : controlOn ? 'mode-control' : ''}`}>
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
                className={`reach-zone ${reachCapturing ? 'capturing' : ''}`}
                aria-hidden="true"
                style={{
                  left: `${reachZone.left * 100}%`,
                  right: `${(1 - reachZone.right) * 100}%`,
                  top: `${reachZone.top * 100}%`,
                  bottom: `${(1 - reachZone.bottom) * 100}%`,
                }}
              />
            )}
            {holding && (
              <div className="hold-indicator" aria-hidden="true">
                <span>{holding === 'typing' ? `Hold to turn ${typingOn ? 'off' : 'on'} number typing` : `Hold to turn ${controlOn ? 'off' : 'on'} mouse control`}</span>
                <i style={{ animationDuration: `${HOLD_MS}ms` }} />
              </div>
            )}
            {modeNotice && <div key={modeNotice.id} className={`mode-notice ${modeNotice.on ? 'on' : ''}`} aria-hidden="true">{modeNotice.text}</div>}
            <div ref={cursorRef} className="fake-cursor" aria-hidden="true"><MousePointer2 size={20} strokeWidth={1.5} /></div>
            {!cameraOn && <div className="camera-placeholder"><div className="camera-icon"><Camera size={16} strokeWidth={1.5} /></div><strong>Your hand will appear here</strong><span>Position your hand clearly in view</span></div>}
            {cameraOn && <div className="tracking-label"><span className="tracking-dot" /> Tracking {handsDetected === 2 ? '2 hands' : 'hand'}{typingOn && handsDetected === 2 ? ' · typing hand ready' : ''}</div>}
          </div>
          {error && <div className="error-message" role="alert"><AlertCircle size={16} strokeWidth={1.5} /> {error}</div>}
          <div className="camera-meta">
            <div className="camera-hint"><MousePointer2 size={16} strokeWidth={1.5} /> The dashed frame maps to your full screen</div>
            <div className={`tongue-status ${tongueActive ? 'active' : ''}`}><span /> Tongue: {!tongueAvailable ? 'unavailable' : tongueActive ? (controlOn ? 'scrolling down' : 'lick detected') : 'ready'} · {tongueLicks} {tongueLicks === 1 ? 'lick' : 'licks'}</div>
          </div>
          <div className="camera-controls">
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
                <Power size={16} strokeWidth={1.5} /> {controlOn ? 'Mouse control is on' : 'Turn on mouse control'}
                {hotkey && <kbd>{hotkey}</kbd>}
              </button>
            ) : (
              <p className="camera-hint">Controlling the real mouse needs the HandTap desktop app</p>
            )}
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Live feedback</p>
            <h2>Make a test click</h2>
          </div>
          <div className="feedback-counts">
            <div className="click-count"><MousePointer2 size={16} strokeWidth={1.5} /> <span key={clicks} className={clicks ? 'count-bump' : ''}>{clicks}</span> {clicks === 1 ? 'click' : 'clicks'}</div>
            <div className="click-count lick-count"><Hand size={16} strokeWidth={1.5} /> <span key={tongueLicks} className={tongueLicks ? 'count-bump' : ''}>{tongueLicks}</span> {tongueLicks === 1 ? 'lick' : 'licks'}</div>
          </div>
        </div>
        <div className="feedback-grid">
          <div className="demo-panel">
            <p className="panel-label">Interaction target</p>
            <button ref={demoButtonRef} className="demo-button" onClick={() => setDemoClicks((value) => value + 1)}>
              {demoClicks > 0
                ? <span key={demoClicks} className="demo-flash"><Check size={16} strokeWidth={1.5} /></span>
                : <MousePointer2 size={16} strokeWidth={1.5} />}
              <span>{demoClicks > 0 ? `Clicked ${demoClicks} ${demoClicks === 1 ? 'time' : 'times'}` : 'Tap thumb and index to press'}</span>
              <small>{controlOn ? 'Move the cursor here, then tap' : 'While mouse control is off, every tap presses this button'}</small>
            </button>
            <div className="success-note"><Check size={16} strokeWidth={1.5} /> Taps stay inside this window until you turn on mouse control</div>
          </div>
          <aside className="status-panel">
            <p className="panel-label">Gesture status</p>
            <div className={`gesture-state ${gesture === 'Tap detected' ? 'detected' : ''}`}>
              <span className="state-icon"><Hand size={16} strokeWidth={1.5} /></span>
              <div aria-live="polite">
                <strong>{gesture}</strong>
                <small>{cameraOn ? 'Keep your hand in frame' : 'Start the camera to begin'}</small>
              </div>
            </div>
            <div className="meter-row"><span>Pinch strength</span><strong>{strength}%</strong></div>
            <div className="meter"><span style={{ transform: `scaleX(${strength / 100})` }} /></div>
            <div className="settings-title"><Settings2 size={16} strokeWidth={1.5} /> Sensitivity <strong>{sensitivity}%</strong></div>
            <input aria-label="Gesture sensitivity" type="range" min="20" max="80" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} />
            {nativeError && <div className="error-message" role="alert"><AlertCircle size={16} strokeWidth={1.5} /> {nativeError}</div>}
          </aside>
        </div>
      </section>

      <SetupPanel
        cameraOn={cameraOn}
        isDesktop={Boolean(desktop)}
        reachCapturing={reachCapturing}
        reachMessage={reachMessage}
        reachIsCustom={reachZone !== REACH_ZONE}
        onCalibrateReach={calibrateReach}
        onResetReach={() => {
          setReachZone(REACH_ZONE);
          setReachMessage('Back to the standard reach.');
        }}
        autoStart={autoStart}
        onChangeAutoStart={setAutoStart}
        controlToggle={controlToggle}
        onChangeControlToggle={setControlToggle}
        typingToggle={typingToggle}
      />

      <NumberTyping
        typingOn={typingOn}
        onToggle={() => setTypingOn((value) => !value)}
        cameraOn={cameraOn}
        controlOn={controlOn}
        isDesktop={Boolean(desktop)}
        hotkey={typingHotkey}
        armedDigit={armedDigit}
        typed={typed}
        typedCount={typedCount}
        onClear={() => setTyped('')}
        typingToggle={typingToggle}
        onChangeToggle={setTypingToggle}
        soundsOn={soundsOn}
        onChangeSounds={setSoundsOn}
        controlToggle={controlToggle}
        gestureSamples={gestureSamples}
        teaching={teaching}
        onTeach={teachGesture}
        onForget={(label) => setGestureSamples((current) => forgetLabel(current, label))}
      />

      <KeybindSection
        bindings={bindings}
        onChange={setBinding}
        lastMovement={lastMovement}
        controlOn={controlOn}
        isDesktop={Boolean(desktop)}
        typingToggle={typingToggle}
        controlToggle={controlToggle}
      />

      <footer><span>HandTap is built for local, hands-free access</span><span>All camera processing stays on this computer</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
