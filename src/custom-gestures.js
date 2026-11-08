// Gestures people teach for shortcuts. The built-in movements assume a hand can make certain
// shapes; these slots let someone teach any shape they can hold and bind it to any shortcut.
// They use the same on-device model as taught numbers, but kept apart from it, so a shortcut
// gesture can never be typed as a number.

export const CUSTOM_MOVEMENTS = [
  { id: 'custom1', label: 'Your gesture 1', hint: 'Any hand shape you teach' },
  { id: 'custom2', label: 'Your gesture 2', hint: 'Any hand shape you teach' },
  { id: 'custom3', label: 'Your gesture 3', hint: 'Any hand shape you teach' },
];

const CUSTOM_IDS = new Set(CUSTOM_MOVEMENTS.map(({ id }) => id));

export const isCustomLabel = (label) => CUSTOM_IDS.has(label);

export const customLabel = (label) => CUSTOM_MOVEMENTS.find(({ id }) => id === label)?.label ?? label;

/** Taught samples split into the ones number typing uses and the ones shortcuts use. */
export function splitSamples(samples = {}) {
  const typing = {};
  const custom = {};
  for (const [label, list] of Object.entries(samples)) (isCustomLabel(label) ? custom : typing)[label] = list;
  return { typing, custom };
}

export const CUSTOM_HOLD_MS = 600;
// A taught shape has to be clearly that shape, not just the closest of the three.
const MIN_CONFIDENCE = 0.25;

/**
 * Fires a custom gesture's id once it has been held for `holdMs`. Holding it longer does
 * nothing more; it fires again only after the hand lets go of it, so one hold is one press.
 */
export function createCustomGestureDetector({ holdMs = CUSTOM_HOLD_MS, minConfidence = MIN_CONFIDENCE } = {}) {
  let current = null;
  let since = 0;
  let fired = false;

  return {
    update(match, now) {
      const label = match && isCustomLabel(match.label) && match.confidence >= minConfidence ? match.label : null;
      if (label !== current) {
        current = label;
        since = now;
        fired = false;
        return null;
      }
      if (!label || fired || now - since < holdMs) return null;
      fired = true;
      return label;
    },
    progress(now) {
      if (!current || fired) return 0;
      return Math.min(1, (now - since) / holdMs);
    },
    reset() {
      current = null;
      fired = false;
    },
  };
}
