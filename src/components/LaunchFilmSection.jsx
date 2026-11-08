import React, { useState } from 'react';
import { Film, ExternalLink, Sparkles } from 'lucide-react';
import { ScrollSection } from './ScrollSection.jsx';
import { HudFrame } from './HudFrame.jsx';

/**
 * LaunchFilmSection — Inline motion video showcase for HandTap.
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
          <div className="showcase-badge" aria-label="Launch film motion showcase">
            <Film size={12} strokeWidth={1.8} />
            <span>Launch film</span>
            <span className="showcase-badge-sep" aria-hidden="true">·</span>
            <span className="showcase-badge-meta">62s · 1080p 60fps</span>
          </div>
          <h2 id="showcase-heading">Watch HandTap in motion</h2>
          <p className="showcase-description">
            Experience natural spatial hand control, sub-millimeter tremor smoothing,
            and effortless hands-free navigation in our cinematic launch film.
          </p>
        </div>
        <div className="showcase-header-actions">
          <span className="showcase-tag">
            <Sparkles size={12} strokeWidth={1.75} />
            Spatial sound
          </span>
          <a
            href="docs/launch-film.html"
            target="_blank"
            rel="noreferrer"
            className="showcase-source-link"
            title="Open interactive canvas player"
          >
            <span>Interactive player</span>
            <ExternalLink size={12} strokeWidth={1.75} />
          </a>
        </div>
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
            <div className="showcase-feature-pills">
              <span className="showcase-feature-pill">1€ filter tremor smoothing</span>
              <span className="showcase-feature-pill">Pinch click & drag</span>
              <span className="showcase-feature-pill">Personal reach calibration</span>
              <span className="showcase-feature-pill">Two-hand typing</span>
              <span className="showcase-feature-pill">Eye cursor mode</span>
            </div>
            <span className="showcase-privacy-note">
              <Sparkles size={12} strokeWidth={1.75} /> Local on-device inference
            </span>
          </div>
        </HudFrame>
      </div>
    </ScrollSection>
  );
}
