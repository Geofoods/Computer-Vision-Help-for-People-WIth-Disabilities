import { EventEmitter } from 'node:events';

/**
 * In-memory Mock Storage implementation for testing persistence
 */
export function createMockStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  let failOnGet = false;
  let failOnSet = false;

  return {
    getItem(key) {
      if (failOnGet) throw new Error('Storage getItem blocked');
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (failOnSet) throw new Error('Storage setItem blocked');
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    setFailOnGet(fail) {
      failOnGet = fail;
    },
    setFailOnSet(fail) {
      failOnSet = fail;
    },
    has(key) {
      return data.has(key);
    },
  };
}

/**
 * Mock Child Process for testing Electron mouse/keyboard PowerShell helper
 */
export function createMockSpawn() {
  const writes = [];
  const events = new EventEmitter();

  const mockStdin = {
    write(chunk) {
      writes.push(chunk.toString());
      return true;
    },
    end() {
      writes.push('[STDIN_END]');
    },
    on(event, cb) {
      events.on(`stdin:${event}`, cb);
    },
  };

  const mockChild = {
    stdin: mockStdin,
    on(event, cb) {
      events.on(event, cb);
    },
    kill() {
      events.emit('exit', 0);
    },
  };

  const spawnFn = () => mockChild;
  spawnFn.writes = writes;
  spawnFn.events = events;
  spawnFn.child = mockChild;

  return spawnFn;
}

/**
 * Generates synthetic MediaPipe hand landmarks for testing geometry
 */
export function createSyntheticHand({ scale = 1, gap = 0.5, wristX = 0.5, wristY = 0.7 } = {}) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  landmarks[0] = { x: wristX, y: wristY }; // WRIST
  landmarks[9] = { x: wristX, y: wristY - 0.2 * scale }; // MIDDLE_KNUCKLE
  landmarks[4] = { x: wristX, y: wristY - 0.3 * scale }; // THUMB_TIP
  landmarks[8] = { x: wristX + gap * 0.2 * scale, y: wristY - 0.3 * scale }; // INDEX_TIP
  landmarks[5] = { x: wristX - 0.05 * scale, y: wristY - 0.2 * scale }; // INDEX_KNUCKLE
  landmarks[12] = { x: wristX, y: wristY - 0.32 * scale }; // MIDDLE_TIP
  landmarks[16] = { x: wristX + 0.05 * scale, y: wristY - 0.3 * scale }; // RING_TIP
  landmarks[20] = { x: wristX + 0.08 * scale, y: wristY - 0.25 * scale }; // PINKY_TIP
  return landmarks;
}

/**
 * Generates synthetic high-frequency noise around a mean value
 */
export function generateNoisySignal({ mean = 0.5, amplitude = 0.05, steps = 50, frequency = 2 } = {}) {
  const signal = [];
  for (let i = 0; i < steps; i++) {
    const noise = Math.sin(i * frequency) * amplitude;
    signal.push({ timeMs: i * 33.3, value: mean + noise });
  }
  return signal;
}

/**
 * Relative luminance calculation for WCAG contrast verification
 */
function parseHexColor(hex) {
  if (typeof hex !== 'string') throw new Error('Invalid color: must be string');
  let cleaned = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(cleaned)) {
    throw new Error('Invalid hex color format');
  }
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('');
  }
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function sRGBToLin(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function calculateLuminance(hex) {
  const [r, g, b] = parseHexColor(hex).map(sRGBToLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function calculateContrastRatio(hex1, hex2) {
  const l1 = calculateLuminance(hex1);
  const l2 = calculateLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Expected Fluid Functionalism Design System Specification Constants
 */
export const DESIGN_SPECS = {
  colors: {
    deepest: '#07080d',
    bg: '#0b0d14',
    card: '#11141c',
    raised: '#1a1e28',
    accentEmerald: '#4cc38a',
    accentCobalt: '#3186ff',
    textPrimary: '#eef0f5',
    textSecondary: '#a3a9b8',
    textMuted: '#7a8296',
  },
  hairline: '1px solid rgba(238, 240, 245, 0.08)',
  reticleGlyph: '+',
  hudBrackets: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
  },
  filterProfiles: {
    steady: { id: 'steady', label: 'Tremor Dampened', minCutoff: 0.6, beta: 0.02, derivativeCutoff: 0.8 },
    balanced: { id: 'balanced', label: 'Balanced', minCutoff: 1.2, beta: 0.05, derivativeCutoff: 1.0 },
    agile: { id: 'agile', label: 'High Speed / Agile', minCutoff: 2.0, beta: 0.12, derivativeCutoff: 1.5 },
  },
};
