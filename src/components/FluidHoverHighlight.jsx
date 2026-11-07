import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { spring } from '../lib/springs.js';

/**
 * Shared gliding background highlight for Fluid Functionalism lists and grids.
 * Keyed by `hover.session` so entering from outside fades in without sliding from stale coordinates,
 * while moving between sibling items glides smoothly via GPU transforms.
 */
export function FluidHoverHighlight({ hover, className = '' }) {
  const prefersReduced = useReducedMotion();

  return (
    <AnimatePresence>
      {hover && (
        <motion.div
          key={hover.session}
          aria-hidden="true"
          className={`fluid-hover-highlight ${className}`}
          initial={{
            opacity: 0,
            x: hover.rect.x,
            y: hover.rect.y,
            width: hover.rect.width,
            height: hover.rect.height,
          }}
          animate={{
            opacity: 1,
            x: hover.rect.x,
            y: hover.rect.y,
            width: hover.rect.width,
            height: hover.rect.height,
          }}
          exit={{
            opacity: 0,
            transition: prefersReduced ? { duration: 0 } : spring.fast.exit,
          }}
          transition={
            prefersReduced
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.12, ease: [0.22, 1, 0.36, 1] },
                  x: spring.fast,
                  y: spring.fast,
                  width: spring.fast,
                  height: spring.fast,
                }
          }
        />
      )}
    </AnimatePresence>
  );
}

