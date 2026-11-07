import React from 'react';

/**
 * Clean editorial section marker in sentence case (replaces [01 // UPPERCASE] sci-fi HUD trope).
 */
export function ModuleIndex({ index, label }) {
  const formattedIndex = String(index).padStart(2, '0');
  return (
    <div className="section-index" aria-label={`Section ${formattedIndex}: ${label}`}>
      <span className="section-index-num">{formattedIndex}</span>
      <span className="section-index-sep" aria-hidden="true">·</span>
      <span className="section-index-label">{label}</span>
    </div>
  );
}
