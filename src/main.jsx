import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Hand,
  Camera,
  MousePointer2,
  Settings2,
  CircleHelp,
  Check,
  AlertCircle,
  Power,
  Sparkles,
} from 'lucide-react';
import {
  FILTER_PROFILES,
  HOLD_MS,
  REACH_ZONE,
  computeReachZone,
  createDigitDetector,
  createDoubleBlinkDetector,
  createFaceGestureDetector,
  createHoldDetector,
  createMovementDetector,
  createOneEuroFilter,
  createPinchDetector,
  cursorPoint,
  eyeGazePoint,
  faceGestures,
  headPitch,
  headPitchStrength,
  headTilt,
  isLicking,
  pinchProgress,
  pinchRatio,
  toScreen,
} from './tracking.js';
import {
  MOVEMENTS,
  loadBindings,
  loadSoundsOn,
  loadTypingToggle,
  saveBindings,
  saveTypingPreferences,
} from './keybinds.js';
import {
  playControlOff,
  playControlOn,
  playDigitTyped,
  playTypingOff,
  playTypingOn,
} from './sounds.js';
import {
  SAMPLES_PER_TEACH,
  addSamples,
  createGestureModel,
  forgetLabel,
  handFeatures,
} from './gesture-model.js';
import {
  loadAutoStart,
  loadControlToggle,
  loadEyeTracking,
  loadFilterProfile,
  loadGestureSamples,
  loadOverlayEnabled,
  loadReachZone,
  loadSensitivity,
  loadShape,
  loadTheme,
  saveAutoStart,
  saveControlToggle,
  saveEyeTracking,
  saveFilterProfile,
  saveGestureSamples,
  saveOverlayEnabled,
  saveReachZone,
  saveSensitivity,
  saveShape,
  saveTheme,
} from './preferences.js';
import { KeybindSection } from './KeybindSection.jsx';
import { NumberTyping } from './NumberTyping.jsx';
import { SetupPanel } from './SetupPanel.jsx';
import { GravityField } from './GravityField.jsx';
import { HudFrame } from './components/HudFrame.jsx';
import { ModuleIndex } from './components/ModuleIndex.jsx';
import { DualLayerButton } from './components/DualLayerButton.jsx';
import { TelemetryHud } from './components/TelemetryHud.jsx';
import { VisionAura } from './components/VisionAura.jsx';
import { ScrollSection } from './components/ScrollSection.jsx';
import { FluidHoverHighlight } from './components/FluidHoverHighlight.jsx';
import { useFluidHover } from './hooks/useFluidHover.js';
import { spring } from './lib/springs.js';
import './styles.css';

const CLICK_COOLDOWN = 500;
const SCROLL_COOLDOWN = 1200;
const CONTROL_TOGGLE_HOLD = 1000;
const TYPED_DISPLAY_LENGTH = 24;
const TEACH_COUNTDOWN = 1500;
const MODE_NOTICE_TIME = 1600;
// Heads move naturally while people talk and look around, so a tilt has to be held.
const HEAD_TILT_HOLD = 400;
const REACH_CAPTURE_TIME = 5000;
// A timer rather than requestAnimationFrame, which stops when the window is hidden
// and would freeze the mouse the moment another app covers this one.
const FRAME_INTERVAL = 33;
const OVERLAY_SYNC_INTERVAL = 85;
const UI_STATUS_INTERVAL = 66;
const desktop = window.handtapDesktop;

const HERO_STEPS = [
  { key: '1', title: 'Start your camera', detail: 'Runs locally on your device' },
  { key: '2', title: 'Tap thumb and index', detail: 'Feel the spatial aura respond' },
  { key: '3', title: 'Engage mouse control', detail: 'Move and click in any window' },
];

// Starts the detection worker and resolves once its model has loaded.
function createWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('hand-worker.js', window.location.href));
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') resolve({ worker, delegate: data.delegate || 'GPU' });
      else if (data.type === 'error') reject(new Error(data.message));
    };
    worker.onerror = (event) =>
      reject(new Error(event.message || 'The hand tracking worker failed to start.'));
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
  if (error.name === 'NotAllowedError') {
    return 'Camera permission was denied. Allow camera access and try again.';
  }
  if (error.name === 'NotFoundError') {
    return 'No camera was found. Connect a camera and try again, or restart HandTap if one is already connected.';
  }
  if (error.name === 'NotReadableError') {
    return 'Another app is using the camera. Close it and try again.';
  }
  return 'We could not start the camera. Check camera permissions and try again.';
}

function App() {
  const videoRef = useRef(null);
  const viewRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const workerRef = useRef(null);
  const busyRef = useRef(false);
  const onLandmarksRef = useRef(() => {});
  const onFaceRef = useRef(() => {});
  const timerRef = useRef(null);
  const lastVideoTimeRef = useRef(0);
  const cursorRef = useRef(null);
  const lastClickRef = useRef(0);
  const demoButtonRef = useRef(null);
  const pinchRef = useRef(createPinchDetector());
  const movementRef = useRef(createMovementDetector());
  const digitRef = useRef(createDigitDetector());
  const toggleHoldRef = useRef(createHoldDetector());
  const controlHoldRef = useRef(createHoldDetector({ holdMs: CONTROL_TOGGLE_HOLD }));
  const teachRef = useRef(null);
  const reachCaptureRef = useRef(null);
  const lastScrollRef = useRef(0);
  const lastPositionRef = useRef(null);
  const lastNativePositionRef = useRef(null);
  const pointerNormRef = useRef({ x: 0.5, y: 0.36 });
  const tongueRef = useRef(false);
  const headTiltRef = useRef(null);
  const headTiltHoldRef = useRef(createHoldDetector({ holdMs: HEAD_TILT_HOLD }));
  const headScrollRef = useRef({ id: null, last: 0 });
  const faceGestureRef = useRef(createFaceGestureDetector());
  const doubleBlinkRef = useRef(createDoubleBlinkDetector());
  const faceLandmarksRef = useRef(null);
  const eyeFilterXRef = useRef(createOneEuroFilter());
  const eyeFilterYRef = useRef(createOneEuroFilter());
  const lastResultAtRef = useRef(0);
  const fpsEmaRef = useRef(0);
  const inferenceEmaRef = useRef(0);
  const lastTelemetryCommitRef = useRef(0);
  const lastOverlaySyncRef = useRef(0);
  const auraCounterRef = useRef(0);
  const lastUiStatusCommitRef = useRef(0);
  const lastUiStatusRef = useRef({ holding: null, strength: 0, gesture: '', dwell: { progress: 0, label: '' } });

  const [theme, setTheme] = useState(() => loadTheme(window.localStorage));
  const [shape, setShape] = useState(() => loadShape(window.localStorage));
  const [overlayEnabled, setOverlayEnabled] = useState(() =>
    loadOverlayEnabled(window.localStorage),
  );
  const [filterProfile, setFilterProfile] = useState(() =>
    loadFilterProfile(window.localStorage),
  );
  const filterXRef = useRef(
    createOneEuroFilter(FILTER_PROFILES[loadFilterProfile(window.localStorage)]),
  );
  const filterYRef = useRef(
    createOneEuroFilter(FILTER_PROFILES[loadFilterProfile(window.localStorage)]),
  );

  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gesture, setGesture] = useState('Waiting for camera');
  const [strength, setStrength] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [sensitivity, setSensitivity] = useState(() => loadSensitivity(window.localStorage));
  const [nativeError, setNativeError] = useState('');
  const [controlOn, setControlOn] = useState(false);
  const controlDesiredRef = useRef(false);
  const [eyeTracking, setEyeTracking] = useState(() => loadEyeTracking(window.localStorage));
  const [dragging, setDragging] = useState(false);
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
  const [seenDigit, setSeenDigit] = useState(null);
  const [seenTaught, setSeenTaught] = useState(false);
  // The number typing readout, where what the AI is reading is shown as it reads it.
  const readoutRef = useRef(null);
  const [typed, setTyped] = useState('');
  const [typedCount, setTypedCount] = useState(0);
  const [holding, setHolding] = useState(null);
  const [modeNotice, setModeNotice] = useState(null);
  const [controlToggle, setControlToggle] = useState(() =>
    loadControlToggle(window.localStorage, typingToggle, bindings),
  );
  const [autoStart, setAutoStart] = useState(() => loadAutoStart(window.localStorage));
  const [reachZone, setReachZone] = useState(() => loadReachZone(window.localStorage));
  const [reachCapturing, setReachCapturing] = useState(false);
  const [reachMessage, setReachMessage] = useState('');
  const [gestureSamples, setGestureSamples] = useState(() =>
    loadGestureSamples(window.localStorage),
  );
  const [handsDetected, setHandsDetected] = useState(0);
  const [teaching, setTeaching] = useState(null);
  const [handPoint, setHandPoint] = useState(null);

  // Real measured telemetry & VisionOS spatial aura states
  const [liveFps, setLiveFps] = useState(0);
  const [inferenceMs, setInferenceMs] = useState(0);
  const [delegateName, setDelegateName] = useState('GPU');
  const [auraEvent, setAuraEvent] = useState(null);
  const [pulseCount, setPulseCount] = useState(0);
  const [dwellState, setDwellState] = useState({ progress: 0, label: '' });

  const stepsHover = useFluidHover({ axis: 'x', nearest: true });
  const gestureModel = useMemo(() => createGestureModel(gestureSamples), [gestureSamples]);

  const sensitivityRef = useRef(sensitivity);
  sensitivityRef.current = sensitivity;
  const controlRef = useRef(controlOn);
  controlRef.current = controlOn;
  const eyeTrackingRef = useRef(eyeTracking);
  eyeTrackingRef.current = eyeTracking;
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
  const overlayEnabledRef = useRef(overlayEnabled);
  overlayEnabledRef.current = overlayEnabled;
  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  const fireAura = useCallback(({ x, y, kind = 'click', label = 'Action', detail = '' }) => {
    auraCounterRef.current += 1;
    const target = {
      x: Number.isFinite(x) ? x : lastPositionRef.current?.x ?? pointerNormRef.current.x,
      y: Number.isFinite(y) ? y : lastPositionRef.current?.y ?? pointerNormRef.current.y,
    };
    const payload = {
      id: auraCounterRef.current,
      x: target.x,
      y: target.y,
      kind,
      label,
      detail,
    };
    setAuraEvent(payload);
    setPulseCount((c) => c + 1);
    if (desktop && overlayEnabledRef.current && controlRef.current) {
      desktop.emitAura({ x: target.x, y: target.y, kind, label });
    }
  }, []);

  const enableMouseControl = useCallback(() => {
    if (streamRef.current && desktop) {
      controlDesiredRef.current = true;
      setControlOn(true);
    }
  }, []);

  const disableMouseControl = useCallback(() => {
    controlDesiredRef.current = false;
    setControlOn(false);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      pointerNormRef.current = { x: e.clientX / w, y: e.clientY / h };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // Synchronize Fluid Functionalism theme & concentric shape attributes on <html>
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    saveTheme(window.localStorage, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.shape = shape;
    saveShape(window.localStorage, shape);
  }, [shape]);

  useEffect(() => {
    saveOverlayEnabled(window.localStorage, overlayEnabled);
    if (!overlayEnabled) {
      desktop?.syncOverlay?.({ visible: false });
    }
  }, [overlayEnabled]);

  const setBinding = useCallback((id, combo) => {
    setBindings((current) => ({ ...current, [id]: combo }));
  }, []);

  useEffect(() => saveBindings(window.localStorage, bindings), [bindings]);
  useEffect(
    () => saveTypingPreferences(window.localStorage, typingToggle, soundsOn),
    [typingToggle, soundsOn],
  );
  useEffect(() => saveControlToggle(window.localStorage, controlToggle), [controlToggle]);
  useEffect(() => saveAutoStart(window.localStorage, autoStart), [autoStart]);
  useEffect(
    () => saveReachZone(window.localStorage, reachZone === REACH_ZONE ? null : reachZone),
    [reachZone],
  );
  useEffect(() => saveGestureSamples(window.localStorage, gestureSamples), [gestureSamples]);
  useEffect(() => saveSensitivity(window.localStorage, sensitivity), [sensitivity]);
  useEffect(() => saveEyeTracking(window.localStorage, eyeTracking), [eyeTracking]);
  useEffect(() => saveFilterProfile(window.localStorage, filterProfile), [filterProfile]);
  useEffect(() => {
    const profile = FILTER_PROFILES[filterProfile] || FILTER_PROFILES.balanced;
    filterXRef.current = createOneEuroFilter(profile);
    filterYRef.current = createOneEuroFilter(profile);
  }, [filterProfile]);

  const wasTypingRef = useRef(typingOn);
  useEffect(() => {
    if (wasTypingRef.current === typingOn) return;
    wasTypingRef.current = typingOn;
    if (soundsRef.current) (typingOn ? playTypingOn : playTypingOff)();
    setModeNotice({
      text: typingOn ? 'Number typing on' : 'Number typing off',
      on: typingOn,
      id: performance.now(),
    });
    fireAura({
      kind: 'toggle',
      label: typingOn ? 'Number typing on' : 'Number typing paused',
      detail: typingOn ? 'Hold fingers to arm' : 'Cursor ready',
    });
  }, [typingOn, fireAura]);

  const wasControlRef = useRef(controlOn);
  useEffect(() => {
    if (!controlOn && controlDesiredRef.current && streamRef.current && desktop) {
      setControlOn(true);
      return;
    }
    if (wasControlRef.current === controlOn) return;
    wasControlRef.current = controlOn;
    if (soundsRef.current) (controlOn ? playControlOn : playControlOff)();
    if (!controlOn && draggingRef.current) {
      desktop?.releaseDrag?.();
      setDragging(false);
    }
    if (!controlOn) {
      desktop?.syncOverlay?.({ visible: false });
    }
    setModeNotice({
      text: controlOn ? 'Mouse control on' : 'Mouse control off',
      on: controlOn,
      id: performance.now(),
    });
    fireAura({
      kind: 'toggle',
      label: controlOn ? 'Mouse control active' : 'Mouse control off',
      detail: controlOn ? 'Desktop cursor live' : 'In-window practice mode',
    });
  }, [controlOn, fireAura]);

  useEffect(() => {
    if (cameraOn && controlDesiredRef.current && !controlOn) setControlOn(true);
  }, [cameraOn, controlOn]);

  useEffect(() => {
    if (!modeNotice) return undefined;
    const timer = setTimeout(() => setModeNotice(null), MODE_NOTICE_TIME);
    return () => clearTimeout(timer);
  }, [modeNotice]);

  // Which digit is being read changes rarely, so it goes through state. How sure the reading
  // is changes every frame, so it goes straight to CSS variables without a React render.
  const showReading = (reading) => {
    setSeenDigit(reading?.seen ?? null);
    setSeenTaught(reading?.confidence != null);
    const readout = readoutRef.current;
    if (!readout) return;
    readout.style.setProperty('--certainty', reading?.certainty ?? 0);
    readout.style.setProperty('--confidence', reading?.confidence ?? 1);
    const value = readout.querySelector('.match-value');
    if (value) value.textContent = reading?.confidence != null ? `${Math.round(reading.confidence * 100)}%` : '';
  };

  const resetTracking = () => {
    pinchRef.current.reset();
    movementRef.current.reset();
    digitRef.current.reset();
    toggleHoldRef.current.reset();
    controlHoldRef.current.reset();
    setArmedDigit(null);
    showReading(null);
    cursorRef.current?.style.setProperty('--pinch', 0);
    setHandPoint(null);
    setDwellState({ progress: 0, label: '' });
    setHolding(null);
    cursorRef.current?.classList.remove('pressed');
    filterXRef.current.reset();
    filterYRef.current.reset();
    cursorRef.current?.classList.remove('visible');
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setStrength(0);
    lastUiStatusCommitRef.current = 0;
    lastUiStatusRef.current = { holding: null, strength: 0, gesture: '', dwell: { progress: 0, label: '' } };
    setDwellState({ progress: 0, label: '' });
    setHandPoint(null);
    lastNativePositionRef.current = null;
  };

  const stopCamera = useCallback(() => {
    clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    lastVideoTimeRef.current = 0;
    lastResultAtRef.current = 0;
    fpsEmaRef.current = 0;
    inferenceEmaRef.current = 0;
    busyRef.current = false;
    if (draggingRef.current) {
      desktop?.releaseDrag?.();
      setDragging(false);
    }
    desktop?.syncOverlay?.({ visible: false });
    setCameraOn(false);
    setHandsDetected(0);
    setTypingOn(false);
    setLiveFps(0);
    setInferenceMs(0);
    setGesture('Camera paused');
    setTongueActive(false);
    tongueRef.current = false;
    headTiltRef.current = null;
    headTiltHoldRef.current.reset();
    headScrollRef.current = { id: null, last: 0 };
    faceGestureRef.current.reset();
    doubleBlinkRef.current.reset();
    eyeFilterXRef.current.reset();
    eyeFilterYRef.current.reset();
    faceLandmarksRef.current = null;
    teachRef.current = null;
    setTeaching(null);
    reachCaptureRef.current = null;
    setReachCapturing(false);
    resetTracking();
  }, []);

  const triggerClick = useCallback(
    async (position) => {
      const now = performance.now();
      if (now - lastClickRef.current < CLICK_COOLDOWN) return;
      lastClickRef.current = now;
      setNativeError('');
      setClicks((value) => value + 1);
      showClickRipple(viewRef.current, cursorRef.current);
      fireAura({
        x: position?.x,
        y: position?.y,
        kind: 'click',
        label: 'Left click',
        detail: controlRef.current ? 'Desktop' : 'Practice target',
      });
      try {
        if (desktop && controlRef.current) {
          await desktop.clickAt(position);
        } else {
          demoButtonRef.current?.click();
        }
      } catch (clickError) {
        setNativeError(clickError.message || 'The desktop click could not be completed.');
      }
    },
    [fireAura],
  );

  const triggerMovement = useCallback(
    async (id, position, intensity = 1) => {
      if (teachRef.current || reachCaptureRef.current) return;
      if (typingRef.current && !id.startsWith('swipe')) return;
      setLastMovement({ id, at: performance.now() });

      if (id === typingToggleRef.current) {
        if (id.startsWith('swipe')) setTypingOn((value) => !value);
        return;
      }
      if (id === controlToggleRef.current) {
        if (id.startsWith('swipe') && desktop && !typingRef.current) {
          enableMouseControl();
        }
        return;
      }

      const combo = bindingsRef.current[id];
      if (typingRef.current || !combo) return;

      const target = position ?? lastPositionRef.current ?? { x: 0.5, y: 0.5 };

      if (combo === 'Left Click') {
        triggerClick(target);
        return;
      }

      const movementLabel = MOVEMENTS.find((m) => m.id === id)?.label ?? id;

      if (!desktop || !controlRef.current) {
        fireAura({
          x: target.x,
          y: target.y,
          kind: 'shortcut',
          label: combo,
          detail: `${movementLabel} · practice`,
        });
        return;
      }

      setNativeError('');
      try {
        if (combo === 'Right Click') {
          fireAura({ x: target.x, y: target.y, kind: 'click', label: 'Right click' });
          await desktop.rightClickAt(target);
        } else if (combo === 'Double Click') {
          fireAura({ x: target.x, y: target.y, kind: 'click', label: 'Double click' });
          await desktop.doubleClickAt(target);
        } else if (combo === 'Toggle Drag') {
          const result = await desktop.toggleDragAt(target);
          const nextDrag = typeof result === 'boolean' ? result : Boolean(result?.dragging);
          setDragging(nextDrag);
          fireAura({
            x: target.x,
            y: target.y,
            kind: 'drag',
            label: nextDrag ? 'Drag locked' : 'Drag released',
            detail: nextDrag ? 'Move hand to drag' : 'Button released',
          });
        } else if (combo === 'Scroll Down' || combo === 'Scroll Up') {
          const direction = combo === 'Scroll Down' ? -1 : 1;
          const sensitivityFactor = 0.25 + (sensitivityRef.current / 100) * 0.75;
          const amount = direction * Math.max(8, Math.round(48 * sensitivityFactor));
          fireAura({
            x: target.x,
            y: target.y,
            kind: 'scroll',
            label: combo === 'Scroll Down' ? 'Scroll down' : 'Scroll up',
          });
          if (intensity < 1 || id === 'headTiltUp' || id === 'headTiltDown') {
            await desktop.scrollBy(amount);
          } else if (combo === 'Scroll Down') {
            await desktop.scrollDown();
          } else if (desktop.scrollUp) {
            await desktop.scrollUp();
          } else {
            await desktop.scrollBy(amount);
          }
        } else {
          fireAura({
            x: target.x,
            y: target.y,
            kind: 'shortcut',
            label: combo,
            detail: movementLabel,
          });
          await desktop.pressKeys(combo);
        }
      } catch (keyError) {
        setNativeError(keyError.message || 'The shortcut could not be pressed.');
      }
    },
    [enableMouseControl, fireAura, triggerClick],
  );

  const typeDigit = useCallback(
    async (digit) => {
      setTyped((value) => (value + digit).slice(-TYPED_DISPLAY_LENGTH));
      setTypedCount((value) => value + 1);
      if (soundsRef.current) playDigitTyped();
      fireAura({
        x: lastPositionRef.current?.x,
        y: lastPositionRef.current?.y,
        kind: 'digit',
        label: `Typed ${digit}`,
        detail: controlRef.current ? 'Sent to active window' : 'Practice buffer',
      });
      if (!desktop || !controlRef.current) return;
      setNativeError('');
      try {
        await desktop.pressKeys(digit);
      } catch (keyError) {
        setNativeError(keyError.message || 'The number could not be typed.');
      }
    },
    [fireAura],
  );

  const handleFace = useCallback(
    ({ landmarks, blendshapes }) => {
      const licking = isLicking(blendshapes);
      faceLandmarksRef.current = landmarks;
      const now = performance.now();
      if (eyeTrackingRef.current) {
        const gaze = eyeGazePoint(landmarks);
        if (gaze) {
          const gazePoint = {
            x: Math.min(1, Math.max(0, eyeFilterXRef.current.filter(gaze.x, now))),
            y: Math.min(1, Math.max(0, eyeFilterYRef.current.filter(gaze.y, now))),
          };
          const screenPosition = toScreen(gazePoint, reachZoneRef.current);
          lastPositionRef.current = screenPosition;
          if (cursorRef.current) {
            cursorRef.current.style.left = `${gazePoint.x * 100}%`;
            cursorRef.current.style.top = `${gazePoint.y * 100}%`;
            cursorRef.current.classList.add('visible');
          }
          if (desktop && controlRef.current) desktop.moveTo(screenPosition);
        }
      }
      if (doubleBlinkRef.current.update(faceGestures(blendshapes).blink, now)) {
        triggerClick(lastPositionRef.current);
      }
      const pitch = headPitchStrength(landmarks);
      const tilt = headTilt(landmarks) ?? pitch?.id ?? null;
      if (tilt !== headTiltRef.current) {
        headTiltRef.current = tilt;
        headTiltHoldRef.current.reset();
      }
      if (headTiltHoldRef.current.update(Boolean(tilt), now)) {
        triggerMovement(tilt, undefined, pitch?.intensity ?? 1);
      }
      if (pitch && headTiltHoldRef.current.hasFired() && now - headScrollRef.current.last >= 120) {
        headScrollRef.current = { id: pitch.id, last: now };
        triggerMovement(pitch.id, undefined, pitch.intensity);
      }
      for (const faceGesture of faceGestureRef.current.update(blendshapes)) {
        triggerMovement(faceGesture);
      }
      setTongueActive(licking);
      if (licking && !tongueRef.current) {
        setTongueLicks((value) => value + 1);
        if (desktop && controlRef.current && now - lastScrollRef.current > SCROLL_COOLDOWN) {
          lastScrollRef.current = now;
          triggerMovement('tongueLick');
        } else if (!controlRef.current) {
          fireAura({
            kind: 'scroll',
            label: 'Tongue gesture',
            detail: 'Turn on mouse control to scroll',
          });
        }
      }
      tongueRef.current = licking;
    },
    [enableMouseControl, fireAura, triggerClick, triggerMovement],
  );
  onFaceRef.current = handleFace;

  const drawMouth = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const landmarks = faceLandmarksRef.current;
    if (!canvas || !video || !landmarks) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    const [upperLip, lowerLip, leftCorner, rightCorner] = [13, 14, 61, 291].map(
      (index) => landmarks[index],
    );
    const context = canvas.getContext('2d');
    context.strokeStyle = tongueRef.current ? '#4cc38a' : '#6b97ff';
    context.lineWidth = 3.5;
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
    context.fillStyle = '#f4f6fa';
    landmarks.forEach(({ x, y }) => {
      context.beginPath();
      context.arc(x * canvas.width, y * canvas.height, 3.8, 0, Math.PI * 2);
      context.fill();
    });
    const thumb = landmarks[4];
    const index = landmarks[8];
    context.strokeStyle = pinching ? '#4cc38a' : '#6b97ff';
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

  const handleLandmarks = useCallback(
    (landmarks, now, otherLandmarks = null) => {
      const video = videoRef.current;
      if (!landmarks) {
        setGesture('Show one hand to camera');
        resetTracking();
        drawMouth();
        if (desktop && overlayEnabledRef.current && controlRef.current) {
          desktop.syncOverlay({
            visible: true,
            controlOn: true,
            typingOn: typingRef.current,
            dragging: draggingRef.current,
            armedDigit: null,
            holdProgress: 0,
            gesture: 'Hand out of view',
          });
        }
        return;
      }

      const point = cursorPoint(landmarks);
      const smoothed = {
        x: filterXRef.current.filter(point.x, now),
        y: filterYRef.current.filter(point.y, now),
      };
      const aspect = video.videoWidth / video.videoHeight;
      const ratio = pinchRatio(landmarks, aspect);

      const teach = teachRef.current;
      if (teach && now >= teach.startsAt) {
        const features = handFeatures(landmarks, aspect);
        if (features) teach.samples.push(features);
        setTeaching({
          label: teach.label,
          status: 'recording',
          percent: Math.round((teach.samples.length / SAMPLES_PER_TEACH) * 100),
        });
        if (teach.samples.length >= SAMPLES_PER_TEACH) {
          teachRef.current = null;
          setTeaching(null);
          setGestureSamples((current) => addSamples(current, teach.label, teach.samples));
          if (soundsRef.current) playDigitTyped();
          fireAura({
            x: smoothed.x,
            y: smoothed.y,
            kind: 'digit',
            label: 'Hand shape learned',
          });
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
          setReachMessage(
            zone
              ? 'Done. This space now covers your whole screen.'
              : 'That was a very small movement. Try moving a little further, or check your hand stays in view.',
          );
          if (zone && soundsRef.current) playDigitTyped();
          if (zone) {
            fireAura({
              x: smoothed.x,
              y: smoothed.y,
              kind: 'toggle',
              label: 'Reach calibrated',
            });
          }
        }
      }
      const capturing = Boolean(teachRef.current || reachCaptureRef.current);

      const { movement, pose } = movementRef.current.update(landmarks, {
        aspect,
        now,
        sensitivity: sensitivityRef.current,
      });
      const typing = typingRef.current;
      const poseIsToggle = Boolean(pose) && pose === typingToggleRef.current;
      const poseIsControlToggle =
        Boolean(pose) && pose === controlToggleRef.current && !typing;

      if (toggleHoldRef.current.update(poseIsToggle && !capturing, now)) {
        setTypingOn((value) => !value);
      }
      if (
        controlHoldRef.current.update(
          poseIsControlToggle && !capturing && Boolean(desktop),
          now,
        ) &&
        !controlRef.current
      ) {
        enableMouseControl();
      }
      const nextHolding = toggleHoldRef.current.isHolding()
        ? 'typing'
        : controlHoldRef.current.isHolding()
          ? 'control'
          : null;

      const poseBlocksClick =
        pose === 'fist' ||
        poseIsToggle ||
        poseIsControlToggle ||
        Boolean(pose && bindingsRef.current[pose]);
      const clickBlocked = typing || capturing || poseBlocksClick;
      const { pinching, justPinched } = pinchRef.current.update(
        clickBlocked ? Infinity : ratio,
        sensitivityRef.current,
      );

      let currentArmed = null;
      if (typing && !poseIsToggle && !capturing) {
        // When available, type from the second hand so the cursor hand remains independent.
        const digitLandmarks = otherLandmarks ?? landmarks;
        const reading = digitRef.current.update(digitLandmarks, aspect, gestureModelRef.current);
        currentArmed = reading.armed;
        setArmedDigit(reading.armed);
        showReading(reading);
        if (reading.digit !== null) typeDigit(reading.digit);
      } else {
        digitRef.current.reset();
        setArmedDigit(null);
        showReading(null);
      }

      // Compute continuous VisionOS dwell progress across active hold detectors
      const toggleProg = toggleHoldRef.current.progress(now);
      const ctrlProg = controlHoldRef.current.progress(now);
      const tiltProg = headTiltHoldRef.current.progress(now);
      const digitProg = typing ? digitRef.current.progress() : { ratio: 0, candidate: null };

      let activeDwell = 0;
      let activeDwellLabel = '';
      if (toggleProg > activeDwell) {
        activeDwell = toggleProg;
        activeDwellLabel = typing ? 'Pause typing' : 'Number typing';
      }
      if (ctrlProg > activeDwell) {
        activeDwell = ctrlProg;
        activeDwellLabel = controlRef.current ? 'Mouse control on' : 'Engage mouse control';
      }
      if (tiltProg > activeDwell) {
        activeDwell = tiltProg;
        activeDwellLabel = 'Head shortcut';
      }
      if (digitProg.ratio > activeDwell && digitProg.candidate) {
        activeDwell = digitProg.ratio;
        activeDwellLabel = `Arming ${digitProg.candidate}`;
      }
      const screenPosition = toScreen(smoothed, reachZoneRef.current);
      lastPositionRef.current = screenPosition;

      drawLandmarks(landmarks, pinching, otherLandmarks);
      drawMouth();
      if (cursorRef.current && !eyeTrackingRef.current) {
        cursorRef.current.style.left = `${smoothed.x * 100}%`;
        cursorRef.current.style.top = `${smoothed.y * 100}%`;
        cursorRef.current.classList.add('visible');
        cursorRef.current.classList.toggle('pressed', pinching);
        // The ring closes in as the fingers approach a tap, so people can see how close they are.
        cursorRef.current.style.setProperty(
          '--pinch',
          clickBlocked ? 0 : pinchProgress(ratio, sensitivityRef.current).toFixed(3),
        );
      }
      const nextGestureLabel = capturing
        ? 'Learning your hand'
        : typing
          ? 'Typing numbers'
          : draggingRef.current
            ? 'Dragging item'
            : pinching
              ? 'Tap detected'
              : 'Hand ready';
      // Keep tracking and native input at full rate, but throttle React-only status
      // updates. These values are visual feedback and do not affect gesture decisions.
      if (now - lastUiStatusCommitRef.current >= UI_STATUS_INTERVAL) {
        lastUiStatusCommitRef.current = now;
        const nextStrength = Math.max(0, Math.min(100, Math.round((1 - ratio) * 100)));
        const previous = lastUiStatusRef.current;
        if (previous.holding !== nextHolding) setHolding(nextHolding);
        if (previous.strength !== nextStrength) setStrength(nextStrength);
        if (previous.gesture !== nextGestureLabel) setGesture(nextGestureLabel);
        if (previous.dwell.progress !== activeDwell || previous.dwell.label !== activeDwellLabel) {
          setDwellState({ progress: activeDwell, label: activeDwellLabel });
        }
        lastUiStatusRef.current = {
          holding: nextHolding,
          strength: nextStrength,
          gesture: nextGestureLabel,
          dwell: { progress: activeDwell, label: activeDwellLabel },
        };
        setHandPoint(smoothed);
      }

      // Number typing must not freeze the cursor hand. With one visible hand it also
      // remains the typing hand, preserving the original single-hand workflow.
      if (desktop && controlRef.current && !capturing && !eyeTrackingRef.current) {
        const previousNativePosition = lastNativePositionRef.current;
        if (
          !previousNativePosition ||
          Math.abs(screenPosition.x - previousNativePosition.x) >= 0.001 ||
          Math.abs(screenPosition.y - previousNativePosition.y) >= 0.001
        ) {
          lastNativePositionRef.current = screenPosition;
          desktop.moveTo(screenPosition);
        }
      }
      if (justPinched) triggerMovement('indexTap', screenPosition);
      if (movement && !capturing) triggerMovement(movement, screenPosition);

      if (
        desktop &&
        overlayEnabledRef.current &&
        controlRef.current &&
        now - lastOverlaySyncRef.current >= OVERLAY_SYNC_INTERVAL
      ) {
        lastOverlaySyncRef.current = now;
        desktop.syncOverlay({
          visible: true,
          controlOn: true,
          typingOn: typing,
          dragging: draggingRef.current,
          armedDigit: currentArmed,
          holdProgress: activeDwell,
          gesture: nextGestureLabel,
        });
      }
    },
    [fireAura, triggerMovement, typeDigit],
  );
  onLandmarksRef.current = handleLandmarks;

  const scheduleFrame = useCallback(() => {
    timerRef.current = setTimeout(async () => {
      const video = videoRef.current;
      const worker = workerRef.current;
      if (
        video &&
        worker &&
        !busyRef.current &&
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current
      ) {
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
        const { worker, delegate } = await createWorker();
        setDelegateName(delegate);
        worker.onmessage = ({ data }) => {
          if (data.type === 'face-unavailable' || data.type === 'error') {
            setTongueAvailable(false);
          }
          if (data.type !== 'result') return;
          busyRef.current = false;
          if (!streamRef.current) return;
          const now = performance.now();
          if (lastResultAtRef.current > 0) {
            const dt = now - lastResultAtRef.current;
            if (dt > 4 && dt < 2000) {
              const instFps = 1000 / dt;
              fpsEmaRef.current =
                fpsEmaRef.current > 0 ? fpsEmaRef.current * 0.8 + instFps * 0.2 : instFps;
            }
          }
          lastResultAtRef.current = now;
          if (typeof data.inferenceMs === 'number') {
            inferenceEmaRef.current =
              inferenceEmaRef.current > 0
                ? inferenceEmaRef.current * 0.78 + data.inferenceMs * 0.22
                : data.inferenceMs;
          }
          if (data.delegate) setDelegateName(data.delegate);
          if (now - lastTelemetryCommitRef.current >= 280) {
            lastTelemetryCommitRef.current = now;
            setLiveFps(Math.round(fpsEmaRef.current));
            setInferenceMs(Math.round(inferenceEmaRef.current * 10) / 10);
          }

          setHandsDetected(data.hands?.length ?? (data.landmarks ? 1 : 0));
          if (data.face) onFaceRef.current(data.face);
          const otherHand = data.hands?.[1]?.landmarks ?? null;
          onLandmarksRef.current(data.landmarks, now, otherHand);
        };
        workerRef.current = worker;
      }
      if (!streamRef.current) return;
      setCameraOn(true);
      setGesture('Show one hand to camera');
      scheduleFrame();
    } catch (modelError) {
      console.error(modelError);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(
        `Hand tracking could not load (${modelError.message}). Restart HandTap and try again.`,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(
    () => () => {
      stopCamera();
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    [stopCamera],
  );

  const teachGesture = useCallback((label) => {
    teachRef.current = {
      label,
      startsAt: performance.now() + TEACH_COUNTDOWN,
      samples: [],
    };
    setTeaching({ label, status: 'ready', percent: 0 });
  }, []);

  const calibrateReach = useCallback(() => {
    reachCaptureRef.current = { until: performance.now() + REACH_CAPTURE_TIME, points: [] };
    setReachCapturing(true);
    setReachMessage('Keep moving your hand around for five seconds…');
  }, []);

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
      enableMouseControl();
    });
  }, [enableMouseControl]);

  const handleDemoClick = (event) => {
    setDemoClicks((value) => value + 1);
    const rect = event.currentTarget.getBoundingClientRect();
    const winW = window.innerWidth || 1280;
    const winH = window.innerHeight || 800;
    const cx =
      event.clientX && event.clientX > 0
        ? event.clientX / winW
        : (rect.left + rect.width * 0.5) / winW;
    const cy =
      event.clientY && event.clientY > 0
        ? event.clientY / winH
        : (rect.top + rect.height * 0.5) / winH;
    fireAura({
      x: cx,
      y: cy,
      kind: 'click',
      label: 'Target clicked',
      detail: `${demoClicks + 1} total`,
    });
  };

  const activeFilterLabel =
    FILTER_PROFILES[filterProfile]?.id === 'steady'
      ? 'Steady'
      : FILTER_PROFILES[filterProfile]?.id === 'agile'
        ? 'Agile'
        : 'Balanced';

  return (
    <MotionConfig reducedMotion="user">
      <div className="fluid-canvas-frame">
        <VisionAura
          auraEvent={auraEvent}
          dwellProgress={dwellState.progress}
          dwellLabel={dwellState.label}
          focusPoint={lastPositionRef.current ?? handPoint}
          dragging={dragging}
        />

        <main className="app-shell">
          <header className="topbar">
            <div className="brand">
              <span className="brand-mark">
                <Hand size={15} strokeWidth={1.75} />
              </span>
              <span>HandTap</span>
            </div>
            <div className="topbar-actions">
              <span className="privacy-pill">
                <span className="privacy-dot" /> Camera stays on this device
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Help"
                aria-expanded={helpOpen}
                aria-controls="help-panel"
                onClick={() => setHelpOpen((value) => !value)}
              >
                <CircleHelp size={15} strokeWidth={1.6} />
                <span>Guide</span>
              </button>
            </div>
          </header>

          <TelemetryHud
            cameraOn={cameraOn}
            fps={liveFps}
            inferenceMs={inferenceMs}
            delegate={delegateName}
            filterMode={activeFilterLabel}
            dragging={dragging}
            theme={theme}
            onToggleTheme={() => setTheme((cur) => (cur === 'dark' ? 'light' : 'dark'))}
            shape={shape}
            onChangeShape={setShape}
          />

          <AnimatePresence>
            {helpOpen && (
              <motion.section
                id="help-panel"
                className="help-panel"
                aria-label="Help"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6, transition: spring.fast.exit }}
                transition={spring.moderate}
              >
                <h2>Getting comfortable results</h2>
                <ul>
                  <li>
                    Sit about an arm&apos;s length from the camera, with your hand in clear light.
                  </li>
                  <li>
                    Moving your hand inside the dashed reach frame moves the cursor across your
                    whole screen.
                  </li>
                  <li>
                    If taps are missed, raise the sensitivity. If clicks happen too easily, lower
                    it.
                  </li>
                  <li>
                    To get the regular mouse back, lower your hand out of view
                    {hotkey ? ` or press ${hotkey}` : ''}.
                  </li>
                  <li>
                    Bind any movement to Left click, Right click, Double click, Hold or release
                    drag, Scroll up/down, or keyboard shortcuts.
                  </li>
                  <li>
                    If reaching screen corners feels tiring, calibrate your reach so a gentle
                    movement covers the entire display.
                  </li>
                  <li>
                    In Number typing mode, hold up fingers until a digit arms, then close your hand
                    to type it.
                  </li>
                </ul>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Awwwards Staged Spatial Hero — Gravity Field framed as an interactive optical instrument */}
          <section className="hero-stage-shell">
            <GravityField
              handPoint={handPoint}
              pinching={gesture === 'Tap detected' || dragging}
              cameraOn={cameraOn}
              pulseKey={pulseCount}
              theme={theme}
            />
            <div className="hero-stage-scrim" aria-hidden="true" />

            <div className="hero">
              <div className="hero-copy">
                <ModuleIndex index={1} label="Spatial hand control" />
                <h1>Control your computer with one hand</h1>
                <p>
                  Move your cursor naturally through space and tap your thumb and index finger to
                  click. Sweep across the interactive field—every gesture responds with tactile
                  spatial feedback.
                </p>

                <div className="hero-visual-stage">
                  <img
                    src="images/hero-hand.jpg"
                    alt="Studio-lit hand performing a thumb and index finger pinch gesture with optical tracking arcs"
                    className="hero-optical-image"
                    width="640"
                    height="360"
                  />
                  <span className="callout-tag callout-pinch">Thumb + index · Pinch click</span>
                  <span className="callout-tag callout-filter">1€ filter · Tremor smoothed</span>
                  <span className="callout-tag callout-wasm">
                    <Sparkles size={12} strokeWidth={1.75} /> Spatial aura feedback
                  </span>
                </div>

                <div className="fluid-steps-wrap" {...stepsHover.containerProps}>
                  <FluidHoverHighlight hover={stepsHover.hover} className="step-hover-pill" />
                  <div className="how-it-works">
                    {HERO_STEPS.map((item) => (
                      <div
                        key={item.key}
                        className="step"
                        {...stepsHover.registerItem(item.key)}
                      >
                        <kbd>{item.key}</kbd>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <HudFrame active={cameraOn} className="camera-card">
                <div className="camera-header">
                  <div>
                    <span className={`status-dot ${cameraOn ? 'live' : ''}`} />{' '}
                    {cameraOn ? 'Camera active' : 'Camera preview'}
                  </div>
                  <span className="live-label">{cameraOn ? 'Live' : 'Standby'}</span>
                </div>
                <div
                  ref={viewRef}
                  className={`camera-view ${typingOn ? 'mode-typing' : controlOn ? 'mode-control' : ''}`}
                >
                  <video
                    ref={videoRef}
                    className={cameraOn ? 'visible' : ''}
                    playsInline
                    muted
                    onResize={({ currentTarget: { videoWidth, videoHeight } }) => {
                      if (viewRef.current && videoWidth && videoHeight) {
                        viewRef.current.style.aspectRatio = `${videoWidth} / ${videoHeight}`;
                      }
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
                      <span>
                        {holding === 'typing'
                          ? `Hold to turn ${typingOn ? 'off' : 'on'} number typing`
                          : `Hold to turn ${controlOn ? 'off' : 'on'} mouse control`}
                      </span>
                      <i style={{ animationDuration: `${HOLD_MS}ms` }} />
                    </div>
                  )}
                  {modeNotice && (
                    <div
                      key={modeNotice.id}
                      className={`mode-notice ${modeNotice.on ? 'on' : ''}`}
                      aria-hidden="true"
                    >
                      {modeNotice.text}
                    </div>
                  )}
                  <div ref={cursorRef} className="fake-cursor" aria-hidden="true">
                    <span className="pinch-ring" />
                    <MousePointer2 size={20} strokeWidth={1.6} />
                  </div>
                  {!cameraOn && (
                    <div className="camera-placeholder">
                      <div className="camera-icon">
                        <Camera size={18} strokeWidth={1.6} />
                      </div>
                      <strong>Your hand will appear here</strong>
                      <span>Position one hand comfortably in frame</span>
                    </div>
                  )}
                  {cameraOn && (
                    <div className="tracking-label">
                      <span className="tracking-dot" />{' '}
                      {handsDetected === 2
                        ? `Tracking 2 hands${typingOn ? ' · typing hand ready' : ` · ${gesture}`}`
                        : gesture}
                    </div>
                  )}
                </div>
                {error && (
                  <div className="error-message" role="alert">
                    <AlertCircle size={16} strokeWidth={1.6} /> {error}
                  </div>
                )}
                <div className="camera-meta">
                  <div className="camera-hint">
                    <MousePointer2 size={15} strokeWidth={1.6} /> Dashed area maps to your full
                    screen
                  </div>
                  <div className={`tongue-status ${tongueActive ? 'active' : ''}`}>
                    <span /> Tongue:{' '}
                    {!tongueAvailable
                      ? 'unavailable'
                      : tongueActive
                        ? controlOn
                          ? 'scrolling down'
                          : 'lick detected'
                        : 'ready'}{' '}
                    · {tongueLicks} {tongueLicks === 1 ? 'lick' : 'licks'}
                  </div>
                </div>
                <div className="camera-controls">
                  <DualLayerButton
                    className={`camera-button ${cameraOn ? 'stop' : 'primary'}`}
                    onClick={cameraOn ? stopCamera : startCamera}
                    disabled={loading}
                    hoverText={
                      loading
                        ? 'Loading models…'
                        : cameraOn
                          ? 'Pause camera'
                          : 'Start camera'
                    }
                  >
                    {loading
                      ? 'Loading hand tracking…'
                      : cameraOn
                        ? 'Pause camera'
                        : 'Start camera'}
                  </DualLayerButton>
                  {desktop ? (
                    <DualLayerButton
                      className={`control-button ${controlOn ? 'active' : ''}`}
                      aria-pressed={controlOn}
                      disabled={!cameraOn}
                      onClick={controlOn ? disableMouseControl : enableMouseControl}
                      hoverText={controlOn ? 'Pause mouse control' : 'Engage mouse control'}
                    >
                      <Power size={15} strokeWidth={1.6} />{' '}
                      {controlOn ? 'Mouse control is on' : 'Turn on mouse control'}
                      {hotkey && <kbd>{hotkey}</kbd>}
                    </DualLayerButton>
                  ) : (
                    <p className="camera-hint">
                      Controlling the OS cursor requires the HandTap desktop app
                    </p>
                  )}
                </div>
              </HudFrame>
            </div>
          </section>

          <ScrollSection aria-labelledby="practice-heading">
            <div className="section-heading">
              <div>
                <ModuleIndex index={2} label="Practice and aura feedback" />
                <h2 id="practice-heading">Make a test click</h2>
              </div>
              <div className="feedback-counts">
                <div className="click-count">
                  <MousePointer2 size={15} strokeWidth={1.6} />{' '}
                  <span key={clicks} className={clicks ? 'count-bump' : ''}>
                    {clicks}
                  </span>{' '}
                  {clicks === 1 ? 'pinch' : 'pinches'}
                </div>
                <div className="click-count lick-count">
                  <Hand size={15} strokeWidth={1.6} />{' '}
                  <span key={tongueLicks} className={tongueLicks ? 'count-bump' : ''}>
                    {tongueLicks}
                  </span>{' '}
                  {tongueLicks === 1 ? 'lick' : 'licks'}
                </div>
              </div>
            </div>

            <div className="feedback-grid">
              <HudFrame className="demo-panel">
                <p className="panel-label">Interactive aura target</p>
                <button
                  ref={demoButtonRef}
                  type="button"
                  className="demo-button"
                  onClick={handleDemoClick}
                >
                  {demoClicks > 0 ? (
                    <span key={demoClicks} className="demo-flash">
                      <Check size={18} strokeWidth={1.75} />
                    </span>
                  ) : (
                    <MousePointer2 size={18} strokeWidth={1.6} />
                  )}
                  <span>
                    {demoClicks > 0
                      ? `Clicked ${demoClicks} ${demoClicks === 1 ? 'time' : 'times'}`
                      : 'Tap thumb and index—or click here to preview the aura'}
                  </span>
                  <small>
                    {controlOn
                      ? 'Move your hand cursor here, then pinch to click'
                      : 'While mouse control is off, every pinch presses this target safely'}
                  </small>
                </button>
                <div className="success-note">
                  <Check size={15} strokeWidth={1.6} /> Taps stay inside this window until you turn
                  on mouse control
                </div>
              </HudFrame>

              <HudFrame className="status-panel">
                <p className="panel-label">Live gesture state</p>
                <div
                  className={`gesture-state ${
                    gesture === 'Tap detected' || dragging ? 'detected' : ''
                  }`}
                >
                  <span className="state-icon">
                    <Hand size={16} strokeWidth={1.6} />
                  </span>
                  <div aria-live="polite">
                    <strong>{gesture}</strong>
                    <small>
                      {cameraOn ? 'Keep your hand comfortably in view' : 'Start the camera to begin'}
                    </small>
                  </div>
                </div>
                <div className="meter-row">
                  <span>Pinch proximity</span>
                  <strong>{strength}%</strong>
                </div>
                <div className="meter">
                  <span style={{ transform: `scaleX(${strength / 100})` }} />
                </div>
                <div className="settings-title">
                  <Settings2 size={15} strokeWidth={1.6} /> Pinch sensitivity{' '}
                  <strong>{sensitivity}%</strong>
                </div>
                <input
                  aria-label="Gesture sensitivity"
                  type="range"
                  min="20"
                  max="80"
                  value={sensitivity}
                  onChange={(event) => setSensitivity(Number(event.target.value))}
                />
                {nativeError && (
                  <div className="error-message" role="alert">
                    <AlertCircle size={16} strokeWidth={1.6} /> {nativeError}
                  </div>
                )}
              </HudFrame>
            </div>
          </ScrollSection>

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
            filterProfile={filterProfile}
            onChangeFilterProfile={setFilterProfile}
            overlayEnabled={overlayEnabled}
            onChangeOverlayEnabled={setOverlayEnabled}
            eyeTracking={eyeTracking}
            onChangeEyeTracking={setEyeTracking}
          />

          <NumberTyping
            typingOn={typingOn}
            onToggle={() => setTypingOn((value) => !value)}
            cameraOn={cameraOn}
            controlOn={controlOn}
            isDesktop={Boolean(desktop)}
            hotkey={typingHotkey}
            armedDigit={armedDigit}
            seenDigit={seenDigit}
            seenTaught={seenTaught}
            readoutRef={readoutRef}
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
            onForget={(label) =>
              setGestureSamples((current) => forgetLabel(current, label))
            }
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

          <footer>
            <span>HandTap — local, adaptive hands-free access</span>
            <span>All camera inference stays on this device</span>
          </footer>
        </main>
      </div>
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')).render(<App />);
