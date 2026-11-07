import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Hand, Camera, MousePointer2, Settings2, CircleHelp, Check, AlertCircle, Sparkles } from 'lucide-react';
import './styles.css';

const PINCH_THRESHOLD = 0.105;
const RELEASE_THRESHOLD = 0.15;
const CLICK_COOLDOWN = 500;

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const workerRef = useRef(null);
  const captureRef = useRef(null);
  const processingRef = useRef(false);
  const captureFrameRef = useRef(null);
  const cursorRef = useRef(null);
  const lastMoveRef = useRef(0);
  const pinchRef = useRef(false);
  const lastClickRef = useRef(0);
  const demoButtonRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gesture, setGesture] = useState('Waiting for camera');
  const [confidence, setConfidence] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [sensitivity, setSensitivity] = useState(50);
  const [nativeError, setNativeError] = useState('');
  const [workerReady, setWorkerReady] = useState(false);

  const moveCursor = useCallback((position) => {
    if (!window.handtapDesktop?.isDesktop) return;
    const now = performance.now();
    if (now - lastMoveRef.current < 30) return;
    lastMoveRef.current = now;
    window.handtapDesktop.moveAt(position).catch((moveError) => {
      setNativeError(moveError.message || 'The desktop cursor could not be moved.');
    });
  }, []);

  const stopCamera = useCallback(() => {
    if (captureRef.current) clearInterval(captureRef.current);
    workerRef.current?.terminate();
    workerRef.current = null;
    setWorkerReady(false);
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
    setGesture('Camera paused');
    setConfidence(0);
    pinchRef.current = false;
    cursorRef.current?.classList.remove('visible');
  }, []);

  const triggerClick = useCallback(async (position) => {
    const now = performance.now();
    if (now - lastClickRef.current < CLICK_COOLDOWN) return;
    lastClickRef.current = now;
    setNativeError('');
    setClicks((value) => value + 1);
    try {
      if (window.handtapDesktop?.isDesktop) {
        await window.handtapDesktop.clickAt(position);
      } else {
        demoButtonRef.current?.click();
      }
    } catch (clickError) {
      setNativeError(clickError.message || 'The desktop click could not be completed.');
    }
  }, []);

  const drawLandmarks = useCallback((landmarks) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#9b8cff';
    landmarks.forEach(({ x, y }) => {
      context.beginPath();
      context.arc(x * canvas.width, y * canvas.height, 5, 0, Math.PI * 2);
      context.fill();
    });
    const thumb = landmarks[4];
    const index = landmarks[8];
    if (thumb && index) {
      if (cursorRef.current) {
        cursorRef.current.style.left = `${(1 - index.x) * 100}%`;
        cursorRef.current.style.top = `${index.y * 100}%`;
        cursorRef.current.classList.add('visible');
      }
      context.strokeStyle = pinchRef.current ? '#67e8a4' : '#f2b84b';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(thumb.x * canvas.width, thumb.y * canvas.height);
      context.lineTo(index.x * canvas.width, index.y * canvas.height);
      context.stroke();
    }
  }, []);

  const handleLandmarks = useCallback((landmarks) => {
    if (landmarks) {
      drawLandmarks(landmarks);
      const thumb = landmarks[4];
      const index = landmarks[8];
      const target = { x: 1 - index.x, y: index.y };
      const previous = cursorRef.current?.dataset.position
        ? JSON.parse(cursorRef.current.dataset.position)
        : target;
      const screenPosition = {
        x: previous.x + (target.x - previous.x) * 0.35,
        y: previous.y + (target.y - previous.y) * 0.35,
      };
      if (cursorRef.current) cursorRef.current.dataset.position = JSON.stringify(screenPosition);
      moveCursor(screenPosition);
      const distance = Math.hypot(thumb.x - index.x, thumb.y - index.y);
      const threshold = PINCH_THRESHOLD + (sensitivity - 50) * 0.0007;
      const isPinching = pinchRef.current
        ? distance < RELEASE_THRESHOLD + (sensitivity - 50) * 0.0007
        : distance < threshold;
      setConfidence(Math.max(0, Math.min(100, Math.round((1 - distance / 0.3) * 100))));
      setGesture(isPinching ? 'Tap detected' : 'Hand ready');
      if (isPinching && !pinchRef.current) {
        triggerClick(screenPosition);
      }
      pinchRef.current = isPinching;
    } else {
      setGesture('Show one hand to camera');
      setConfidence(0);
      cursorRef.current?.classList.remove('visible');
      canvasRef.current?.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [drawLandmarks, moveCursor, sensitivity, triggerClick]);

  const captureFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !workerRef.current || !workerReady || processingRef.current || video.readyState < 2) return;
    processingRef.current = true;
    try {
      const bitmap = await createImageBitmap(video);
      workerRef.current.postMessage({ type: 'frame', bitmap, timestamp: performance.now() }, [bitmap]);
    } catch {
      processingRef.current = false;
    }
  }, [workerReady]);
  captureFrameRef.current = captureFrame;

  const startCamera = async () => {
    setLoading(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const worker = new Worker(new URL('./hand-worker.js', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (event) => {
        if (event.data.type === 'ready') {
          setWorkerReady(true);
          setGesture('Show one hand to camera');
        } else if (event.data.type === 'result') {
          processingRef.current = false;
          handleLandmarks(event.data.landmarks);
        } else if (event.data.type === 'error') {
          setError(`Hand tracking could not start: ${event.data.message}`);
        }
      };
      worker.postMessage({ type: 'init' });
      setCameraOn(true);
      setGesture('Loading hand tracking');
      captureRef.current = setInterval(() => captureFrameRef.current?.(), 33);
    } catch (cameraError) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setError(cameraError.name === 'NotAllowedError'
        ? 'Camera permission was denied. Allow camera access in your browser and try again.'
        : 'We could not start the camera. Check camera permissions and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark"><Hand size={21} strokeWidth={2.5} /></span>
          <span>hand<span>tap</span></span>
        </a>
        <div className="topbar-actions">
          <span className="privacy-pill"><span className="privacy-dot" /> Camera stays on this device</span>
          <button className="icon-button" aria-label="Help"><CircleHelp size={20} /></button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={15} /> Accessible interaction</div>
          <h1>Click with a<br /><em>simple tap.</em></h1>
          <p>Use your camera to turn a thumb-and-index finger tap into a click. No mouse or touchpad required.</p>
          <div className="how-it-works">
            <div className="step"><span>1</span><div><strong>Start your camera</strong><small>Allow access when asked</small></div></div>
            <div className="step"><span>2</span><div><strong>Tap thumb + index</strong><small>Hold briefly, then release</small></div></div>
            <div className="step"><span>3</span><div><strong>See it click</strong><small>Works on the demo below</small></div></div>
          </div>
        </div>

        <div className="camera-card">
          <div className="camera-header">
            <div><span className={`status-dot ${cameraOn ? 'live' : ''}`} /> {cameraOn ? 'Camera active' : 'Camera preview'}</div>
            <span className="live-label">{cameraOn ? 'LIVE' : 'READY'}</span>
          </div>
          <div className="camera-view">
            <video ref={videoRef} className={cameraOn ? 'visible' : ''} playsInline muted />
            <canvas ref={canvasRef} />
            <div ref={cursorRef} className="fake-cursor" aria-hidden="true"><MousePointer2 size={26} /></div>
            {!cameraOn && <div className="camera-placeholder"><div className="camera-icon"><Camera size={28} /></div><strong>Your hand will appear here</strong><span>Position your hand clearly in view</span></div>}
            {cameraOn && <div className="tracking-label"><span className="tracking-dot" /> Tracking hand</div>}
          </div>
          {error && <div className="error-message"><AlertCircle size={16} /> {error}</div>}
          <div className="camera-hint"><MousePointer2 size={14} /> Your real cursor follows your index finger across the screen</div>
          <button className={`camera-button ${cameraOn ? 'stop' : ''}`} onClick={cameraOn ? stopCamera : startCamera} disabled={loading}>
            {loading ? 'Loading hand tracking…' : cameraOn ? 'Pause camera' : 'Start camera'}
          </button>
        </div>
      </section>

      <section className="workspace">
        <div className="section-heading"><div><p className="eyebrow">Live feedback</p><h2>Make a test click</h2></div><div className="click-count"><MousePointer2 size={16} /> {clicks} clicks</div></div>
        <div className="feedback-grid">
          <div className="demo-panel">
            <p className="panel-label">Interaction area</p>
            <button ref={demoButtonRef} className="demo-button" onClick={() => undefined}>
              <MousePointer2 size={23} />
              <span>Tap here with your fingers</span>
              <small>The button will activate when you pinch</small>
            </button>
            <div className="success-note"><Check size={16} /> Pinch once to click wherever the cursor is pointing</div>
          </div>
          <aside className="status-panel">
            <p className="panel-label">Gesture status</p>
            <div className={`gesture-state ${gesture === 'Tap detected' ? 'detected' : ''}`}><span className="state-icon"><Hand size={22} /></span><div><strong>{gesture}</strong><small>{cameraOn ? 'Keep your hand in frame' : 'Start the camera to begin'}</small></div></div>
            <div className="meter-row"><span>Pinch strength</span><strong>{confidence}%</strong></div>
            <div className="meter"><span style={{ width: `${confidence}%` }} /></div>
            <div className="settings-title"><Settings2 size={15} /> Sensitivity <strong>{sensitivity}%</strong></div>
            <input aria-label="Gesture sensitivity" type="range" min="20" max="80" value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} />
            {nativeError && <div className="error-message"><AlertCircle size={16} /> {nativeError}</div>}
          </aside>
        </div>
      </section>

      <footer><span>handtap is designed for privacy and ease of use.</span><span>Processing happens locally on this computer.</span></footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
