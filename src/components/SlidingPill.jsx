import React from 'react';

/**
 * Fluid Functionalism Segmented Control ("Sliding Pill").
 * Uses a single spring-gliding elevated surface indicator (--surface-4 / --shadow-4)
 * and a hidden ghost span at semibold optical weight so active weight shifts cause zero layout reflow.
 */
export function SlidingPill({
  options = [],
  value,
  onChange,
  className = '',
  ariaLabel = 'Segmented option selector',
  compact = false,
}) {
  const activeIndex = Math.max(0, options.findIndex((opt) => opt.id === value));
  const total = options.length;
  const pillWidthPercent = total > 0 ? 100 / total : 100;
  const pillOffsetPercent = total > 0 ? activeIndex * 100 : 0;

  const handleKeyDown = (e) => {
    if (total === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = Math.min(total - 1, activeIndex + 1);
      onChange(options[nextIndex].id);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = Math.max(0, activeIndex - 1);
      onChange(options[prevIndex].id);
    }
  };

  return (
    <div
      className={`sliding-pill-container ${compact ? 'compact' : ''} ${className}`.trim()}
      role="radiogroup"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        className="sliding-pill-indicator"
        style={{
          width: `calc(${pillWidthPercent}% - 6px)`,
          transform: `translateX(calc(${pillOffsetPercent}% + ${activeIndex * (6 / Math.max(1, total))}px))`,
        }}
        aria-hidden="true"
      />
      {options.map((option) => {
        const isSelected = option.id === value;
        return (
          <button
            key={String(option.id)}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={-1}
            className={`sliding-pill-option ${isSelected ? 'active' : ''}`}
            onClick={() => onChange(option.id)}
          >
            <span className="ghost-weight-wrap">
              <span className="ghost-weight-reserve" aria-hidden="true">
                {option.icon}
                {option.label}
              </span>
              <span className="ghost-weight-live">
                {option.icon}
                {option.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
