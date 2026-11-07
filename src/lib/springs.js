// Perceptual spring tiers from Fluid Functionalism (fluidfunctionalism.com).
// Authored in visualDuration + bounce so choreography reads consistently across distances.

function withExit(config, exitDuration) {
  return Object.assign(config, {
    exit: {
      type: 'tween',
      duration: exitDuration,
      ease: [0.4, 0, 1, 1],
    },
  });
}

export const spring = {
  /** Press feedback, hover highlights, toggles — immediate response, zero overshoot. */
  fast: withExit(
    {
      type: 'spring',
      visualDuration: 0.08,
      bounce: 0,
    },
    0.06,
  ),

  /** Segmented pills, filter switches, accordion panels — settled spatial travel. */
  moderate: withExit(
    {
      type: 'spring',
      visualDuration: 0.16,
      bounce: 0,
    },
    0.12,
  ),

  /** Hero stage transitions, floating spatial pills, drawer entrances — subtle cushion. */
  slow: withExit(
    {
      type: 'spring',
      visualDuration: 0.24,
      bounce: 0.12,
    },
    0.16,
  ),
};

export const fontWeights = {
  normal: "'opsz' 14, 'wght' 400",
  medium: "'opsz' 14, 'wght' 520",
  semibold: "'opsz' 14, 'wght' 560",
  bold: "'opsz' 14, 'wght' 680",
};

