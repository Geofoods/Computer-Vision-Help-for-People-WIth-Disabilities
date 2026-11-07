import React from 'react';

/**
 * Fluid Functionalism Surface Card (--surface-2 / --shadow-2 with concentric border radii).
 * Replaces artificial sci-fi HUD corner brackets with quiet tactile elevation.
 */
export function HudFrame({ children, className = '', active = false, ...props }) {
  return (
    <div className={`fluid-surface-card ${active ? 'active' : ''} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
