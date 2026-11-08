// Dwell clicking: hold the cursor still for a moment and it clicks. It's a standard access
// feature for people who can point but find a pinch or blink tiring, painful or unreliable.
// Paired with the eye cursor, it lets someone use HandTap without their hands or blinking.

export const DWELL_MS = 1000;
// How far the cursor may drift, as a share of the screen, and still count as holding still.
// The hand cursor is already smoothed; gaze jitters more, so the eye cursor gets more room.
export const DWELL_RADIUS_HAND = 0.015;
export const DWELL_RADIUS_EYES = 0.035;

/**
 * `update` takes the cursor position (0 to 1 on each axis) and returns how far the current
 * hold has filled, from 0 to 1, and whether it clicked on this frame. After a click the
 * cursor has to move away before it can click again, so resting on a spot clicks once.
 */
export function createDwellClicker({ dwellMs = DWELL_MS, radius = DWELL_RADIUS_HAND } = {}) {
  let anchor = null;
  let since = 0;
  let clicked = false;

  const reset = () => {
    anchor = null;
    clicked = false;
  };

  return {
    update(point, now, enabled = true) {
      if (!enabled || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        reset();
        return { progress: 0, click: false };
      }
      if (!anchor || Math.hypot(point.x - anchor.x, point.y - anchor.y) > radius) {
        anchor = { x: point.x, y: point.y };
        since = now;
        clicked = false;
        return { progress: 0, click: false };
      }
      if (clicked) return { progress: 0, click: false };
      const progress = Math.min(1, (now - since) / dwellMs);
      if (progress < 1) return { progress, click: false };
      clicked = true;
      return { progress: 1, click: true };
    },
    reset,
  };
}
