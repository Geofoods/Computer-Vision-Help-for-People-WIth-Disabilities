import React from 'react';

export function CrosshairReticle({ position = 'top-left', className = '' }) {
  return (
    <span className={`grid-crosshair ${position} ${className}`} aria-hidden="true">
      +
    </span>
  );
}
