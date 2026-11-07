// Saved setup choices. Storage can be empty, blocked or hold anything, so every load has
// a safe answer and nothing here can stop the app from starting.
import { REACH_ZONE } from './tracking.js';
import { TYPING_TOGGLES, hasOwnShortcut } from './keybinds.js';

const REACH_KEY = 'handtap.reachZone';
const AUTO_START_KEY = 'handtap.autoStart';
const CONTROL_TOGGLE_KEY = 'handtap.controlToggle';
const GESTURES_KEY = 'handtap.gestures';

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
export const saveControlToggle = (storage, value) => write(storage, CONTROL_TOGGLE_KEY, value);
export const saveGestureSamples = (storage, samples) => write(storage, GESTURES_KEY, samples);
