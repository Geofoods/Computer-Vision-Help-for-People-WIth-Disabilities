// What the always-on-top corner window should show. Kept free of React so the
// text rules stay easy to read and test.

const MAX_LENGTH = 80;

const clip = (value, fallback) =>
  (typeof value === 'string' && value.trim() ? value.trim() : fallback).slice(0, MAX_LENGTH);

/** The gesture and mode line the overlay should display for the current state. */
export function overlayStatus({ gesture, cameraOn, controlOn, typingOn }) {
  const mode = controlOn
    ? 'Mouse control on'
    : typingOn
      ? 'Number typing on'
      : cameraOn
        ? 'Camera on'
        : 'Camera off';
  return {
    gesture: clip(gesture, 'Waiting for camera'),
    mode,
    live: Boolean(cameraOn),
  };
}
