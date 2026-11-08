// Saved setup choices. Storage can be empty, blocked or hold anything, so every load has
// a safe answer and nothing here can stop the app from starting.
import { REACH_ZONE } from './tracking.js';
import { TYPING_TOGGLES, hasOwnShortcut } from './keybinds.js';

const REACH_KEY = 'handtap.reachZone';
const AUTO_START_KEY = 'handtap.autoStart';
const CONTROL_TOGGLE_KEY = 'handtap.controlToggle';
const GESTURES_KEY = 'handtap.gestures';
const SENSITIVITY_KEY = 'handtap.sensitivity';
const PROFILE_KEY = 'handtap.filterProfile';
const THEME_KEY = 'handtap.theme';
const SHAPE_KEY = 'handtap.shape';
const OVERLAY_KEY = 'handtap.overlayEnabled';
const SCROLL_SENSITIVITY_KEY = 'handtap.scrollSensitivity';
const EYE_TRACKING_KEY = 'handtap.eyeTracking';
const DWELL_CLICK_KEY = 'handtap.dwellClick';

function read(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch (error) {
    return null;
  }
}

function write(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key}.`, error);
  }
}

const inRange = (value) => Number.isFinite(value) && value >= 0 && value <= 1;

export function loadReachZone(storage) {
  const zone = read(storage, REACH_KEY);
  const valid = zone && [zone.left, zone.right, zone.top, zone.bottom].every(inRange) && zone.left < zone.right && zone.top < zone.bottom;
  return valid ? zone : REACH_ZONE;
}

export function loadAutoStart(storage) {
  return read(storage, AUTO_START_KEY) === true;
}

export function loadScrollSensitivity(storage) {
  const value = read(storage, SCROLL_SENSITIVITY_KEY);
  return Number.isFinite(value) && value >= 10 && value <= 100 ? value : 30;
}

export function loadEyeTracking(storage) {
  return read(storage, EYE_TRACKING_KEY) === true;
}

/** Defaults to a thumb tap that nothing else is using, or to no movement if neither is free. */
export function loadControlToggle(storage, typingToggle, bindings) {
  const stored = read(storage, CONTROL_TOGGLE_KEY);
  if (stored === '') return '';
  if (TYPING_TOGGLES.some(({ id }) => id === stored) && stored !== typingToggle) return stored;
  return ['middleTap', 'ringTap'].find((id) => id !== typingToggle && !hasOwnShortcut(bindings, id)) ?? '';
}

export function loadGestureSamples(storage) {
  const saved = read(storage, GESTURES_KEY);
  if (!saved || typeof saved !== 'object') return {};
  return Object.fromEntries(Object.entries(saved).filter(([, list]) => (
    Array.isArray(list) && list.every((features) => Array.isArray(features) && features.length === 40 && features.every(Number.isFinite))
  )));
}

export const saveReachZone = (storage, zone) => write(storage, REACH_KEY, zone);
export const saveAutoStart = (storage, value) => write(storage, AUTO_START_KEY, value);
export const saveScrollSensitivity = (storage, value) => write(storage, SCROLL_SENSITIVITY_KEY, value);
export const saveEyeTracking = (storage, value) => write(storage, EYE_TRACKING_KEY, Boolean(value));
export const loadDwellClick = (storage) => read(storage, DWELL_CLICK_KEY) === true;
export const saveDwellClick = (storage, value) => write(storage, DWELL_CLICK_KEY, Boolean(value));
export const saveControlToggle = (storage, value) => write(storage, CONTROL_TOGGLE_KEY, value);
export const saveGestureSamples = (storage, samples) => write(storage, GESTURES_KEY, samples);

export function loadSensitivity(storage) {
  try {
    const raw = storage.getItem(SENSITIVITY_KEY);
    if (raw === null || raw === undefined) return 50;
    const val = Number(raw);
    return Number.isFinite(val) && val >= 0 && val <= 100 ? val : 50;
  } catch {
    return 50;
  }
}

export function saveSensitivity(storage, val) {
  try {
    storage.setItem(SENSITIVITY_KEY, String(val));
  } catch (error) {
    console.warn(`Could not save ${SENSITIVITY_KEY}.`, error);
  }
}

export function loadFilterProfile(storage) {
  try {
    const val = storage.getItem(PROFILE_KEY);
    return ['steady', 'balanced', 'agile'].includes(val) ? val : 'balanced';
  } catch {
    return 'balanced';
  }
}

export function saveFilterProfile(storage, profile) {
  try {
    storage.setItem(PROFILE_KEY, profile);
  } catch (error) {
    console.warn(`Could not save ${PROFILE_KEY}.`, error);
  }
}

export function loadTheme(storage) {
  try {
    const val = storage.getItem(THEME_KEY);
    return val === 'light' || val === 'dark' ? val : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(storage, theme) {
  try {
    storage.setItem(THEME_KEY, theme === 'light' ? 'light' : 'dark');
  } catch (error) {
    console.warn(`Could not save ${THEME_KEY}.`, error);
  }
}

export function loadShape(storage) {
  try {
    const val = storage.getItem(SHAPE_KEY);
    return ['rounded', 'pill', 'sharp'].includes(val) ? val : 'rounded';
  } catch {
    return 'rounded';
  }
}

export function saveShape(storage, shape) {
  try {
    if (['rounded', 'pill', 'sharp'].includes(shape)) storage.setItem(SHAPE_KEY, shape);
  } catch (error) {
    console.warn(`Could not save ${SHAPE_KEY}.`, error);
  }
}

export function loadOverlayEnabled(storage) {
  const val = read(storage, OVERLAY_KEY);
  return val === false ? false : true;
}

export const saveOverlayEnabled = (storage, enabled) => write(storage, OVERLAY_KEY, Boolean(enabled));
