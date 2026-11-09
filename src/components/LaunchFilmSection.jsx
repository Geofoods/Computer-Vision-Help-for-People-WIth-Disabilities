import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ScrollSection } from './ScrollSection.jsx';
import { HudFrame } from './HudFrame.jsx';

/**
 * LaunchFilmSection: inline motion video showcase for HandTap.
 * Inspired by premier B2B software startup and Awwwards landing pages (Linear, Raycast, Stripe).
 * Features an ambient light glow reflection positioned behind the player card,
 * concentric surface chassis (HudFrame), standard HTML5 video controls,
 * calm unslop editorial badge, feature pills, and link to docs/launch-film.html.
 *
 * NOTE: Strictly omits <ModuleIndex> to preserve the 5-module contract (01..05).
 */
export function LaunchFilmSection({ className = '', ...props }) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <ScrollSection
      className={`showcase-section ${className}`.trim()}
      id="launch-film-showcase"
      aria-labelledby="showcase-heading"
      {...props}
    >
      <div className="section-heading showcase-heading-wrap">
        <div>
          <p className="showcase-meta">
            Launch film <span aria-hidden="true">·</span> 67s <span aria-hidden="true">·</span>{' '}
            1080p 60fps <span aria-hidden="true">·</span> Spatial sound
          </p>
          <h2 id="showcase-heading">Watch HandTap in motion</h2>
          <p className="showcase-description">
            Experience natural spatial hand control, sub-millimeter tremor smoothing,
            and effortless hands-free navigation in our cinematic launch film.
          </p>
        </div>
        <a
          href="docs/launch-film.html"
          target="_blank"
          rel="noreferrer"
          className="showcase-source-link"
        >
          <span>Interactive player</span>
          <ArrowUpRight size={14} strokeWidth={1.6} aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>

      <div className={`showcase-stage ${isPlaying ? 'is-playing' : ''}`}>
        <div className="showcase-ambient-glow" aria-hidden="true" />
        <div className="showcase-ambient-reflection" aria-hidden="true" />
        <HudFrame className="showcase-player-card">
          <div className="showcase-player-inner">
            <video
              className="showcase-video"
              src="videos/handtap-launch-film.mp4"
              poster="images/launch-film-poster.png"
              controls
              playsInline
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
          </div>
          <div className="showcase-player-footer">
            <ul className="showcase-features">
              <li>1€ filter tremor smoothing</li>
              <li>Pinch click &amp; drag</li>
              <li>Personal reach calibration</li>
              <li>Two-hand typing</li>
              <li>Eye cursor mode</li>
            </ul>
            <span className="showcase-privacy-note">Local on-device inference</span>
          </div>
        </HudFrame>
      </div>
    </ScrollSection>
  );
}
