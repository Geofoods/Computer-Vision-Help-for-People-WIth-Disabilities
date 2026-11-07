import React from 'react';

/**
 * Fluid Functionalism Tactile Button with zero-CLS Y-axis label glide
 * and geometric 1px inset press-collapse (`:active` collapses surface rim rather than rubbery scaling).
 */
export function DualLayerButton({
  children,
  hoverText,
  onClick,
  className = '',
  type = 'button',
  disabled = false,
  active = false,
  ...props
}) {
  const secondaryContent = hoverText || children;
  return (
    <button
      type={type}
      className={`dual-layer-btn ${active ? 'active' : ''} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      <span className="dual-layer-roll">
        <span className="layer-primary">{children}</span>
        <span className="layer-secondary" aria-hidden="true">{secondaryContent}</span>
      </span>
    </button>
  );
}
