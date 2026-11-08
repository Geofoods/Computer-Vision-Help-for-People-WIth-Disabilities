import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, ExternalLink, Film, Sparkles } from 'lucide-react';
import { spring } from '../lib/springs.js';

/**
 * Fluid Functionalism Cinema Modal for the HandTap Launch Film.
 * Designed with Apple Vision Pro / Awwwards aesthetic:
 * - High-refraction blurred backdrop (blur 28px)
 * - Concentric surface framing with Swiss hairline reticles
 * - Autoplay with audio controls, Escape key dismiss, and focus restoration
 */
export function FilmModal({ isOpen, onClose }) {
  const videoRef = useRef(null);
  const closeBtnRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      returnFocusRef.current = document.activeElement;
      closeBtnRef.current?.focus();

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    } else {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      returnFocusRef.current?.focus?.();
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="film-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="film-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="film-modal-card fluid-surface-card"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={spring.moderate}
          >
            {/* Cinematic HUD Header */}
            <div className="film-modal-header">
              <div className="film-modal-title-group">
                <span className="film-icon-badge" aria-hidden="true">
                  <Film size={15} strokeWidth={1.8} />
                </span>
                <div>
                  <h3 id="film-modal-title">HandTap — Spatial Launch Film</h3>
                  <span className="film-subtitle">
                    67s · 1080p 60fps · Spatial Sound
                  </span>
                </div>
              </div>

              <div className="film-modal-actions">
                <a
                  href="docs/launch-film.html"
                  target="_blank"
                  rel="noreferrer"
                  className="film-source-link"
                  title="Open live interactive canvas source"
                >
                  <span>Interactive source</span>
                  <ExternalLink size={13} strokeWidth={1.75} />
                </a>

                <button
                  ref={closeBtnRef}
                  type="button"
                  className="film-close-btn"
                  onClick={onClose}
                  aria-label="Close launch film"
                >
                  <X size={16} strokeWidth={1.8} />
                  <kbd>Esc</kbd>
                </button>
              </div>
            </div>

            {/* Video Player Stage */}
            <div className="film-player-wrap">
              <video
                ref={videoRef}
                src="videos/handtap-launch-film.mp4"
                poster="images/launch-film-poster.png"
                controls
                autoPlay
                playsInline
                className="film-video-element"
              />
            </div>

            {/* Cinematic Feature Badges Footer */}
            <div className="film-modal-footer">
              <div className="film-features-list">
                <span className="film-feature-tag">1€ filter tremor smoothing</span>
                <span className="film-feature-tag">Pinch click & drag</span>
                <span className="film-feature-tag">Personal reach calibration</span>
                <span className="film-feature-tag">Two-hand number typing</span>
                <span className="film-feature-tag">Eye cursor mode</span>
              </div>
              <span className="film-footer-meta">
                <Sparkles size={13} strokeWidth={1.8} /> Local on-device inference
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

