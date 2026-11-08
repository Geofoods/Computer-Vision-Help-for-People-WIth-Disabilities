import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { spring } from '../lib/springs.js';

/**
 * Scroll-linked spatial section reveal following Fluid Functionalism's spring.slow tier.
 */
export function ScrollSection({ children, className = '', ...props }) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return (
      <section className={`workspace ${className}`.trim()} {...props}>
        {children}
      </section>
    );
  }

  return (
    <motion.section
      className={`workspace ${className}`.trim()}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.04 }}
      transition={{
        opacity: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
        y: spring.slow,
      }}
      {...props}
    >
      {children}
    </motion.section>
  );
}

