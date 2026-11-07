import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * Fluid Functionalism Segmented Control ("Sliding Pill").
 * Uses a single spring-gliding elevated surface indicator (--surface-4 / --shadow-4)
 * measured from the active button's exact DOM geometry so uneven label lengths align pixel-perfectly,
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
  const containerRef = useRef(null);
  const optionRefs = useRef([]);
  const [metric, setMetric] = useState(null);

  const activeIndex = Math.max(0, options.findIndex((opt) => opt.id === value));
  const total = options.length;
  const pillWidthPercent = total > 0 ? 100 / total : 100;
  const pillOffsetPercent = total > 0 ? activeIndex * 100 : 0;

  useLayoutEffect(() => {
    const updateMetric = () => {
      const btn = optionRefs.current[activeIndex];
      if (!btn) return;
      const left = btn.offsetLeft;
      const width = btn.offsetWidth;
      if (width > 0) {
        setMetric((prev) =>
          prev && prev.left === left && prev.width === width ? prev : { left, width },
        );
      }
    };

    updateMetric();

    const container = containerRef.current;
    let observer = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateMetric);
      observer.observe(container);
      optionRefs.current.forEach((el) => {
        if (el) observer.observe(el);
      });
    }

    let cancelled = false;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) updateMetric();
      });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [activeIndex, options, compact]);

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

  const indicatorStyle = metric
    ? {
        left: 0,
        width: `${metric.width}px`,
        transform: `translateX(${metric.left}px)`,
      }
    : {
        width: `calc(${pillWidthPercent}% - 6px)`,
        transform: `translateX(calc(${pillOffsetPercent}% + ${activeIndex * (6 / Math.max(1, total))}px))`,
      };

  return (
    <div
      ref={containerRef}
      className={`sliding-pill-container ${compact ? 'compact' : ''} ${className}`.trim()}
      role="radiogroup"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="sliding-pill-indicator" style={indicatorStyle} aria-hidden="true" />
      {options.map((option, idx) => {
        const isSelected = option.id === value;
        return (
          <button
            key={String(option.id)}
            ref={(el) => {
              optionRefs.current[idx] = el;
            }}
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
