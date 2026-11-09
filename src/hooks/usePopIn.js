import { useEffect } from 'react';

// Section headings and panels below the hero pop in once as they first scroll into view.
const POP_SELECTOR = [
  '.workspace > .section-heading',
  '.workspace .fluid-surface-card:not(.showcase-player-card)',
].join(',');
const STAGGER_MS = 70;

/**
 * Adds a one-time pop-in to existing elements without touching their markup or styling:
 * it only sets a `data-pop` attribute (React never manages it) that the CSS animates.
 * Also scrubs the launch film player from 94% to full size as it scrolls into view.
 * Under reduced motion it does nothing, so the page renders exactly as authored.
 */
export function usePopIn() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (!('IntersectionObserver' in window)) return undefined;

    const root = document.documentElement;
    root.setAttribute('data-pop-ready', '');

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          // Siblings that arrive together pop in a short left-to-right sequence.
          const siblings = Array.from(el.parentElement?.children ?? []).filter(
            (node) => node.getAttribute('data-pop') === 'wait',
          );
          const order = Math.max(0, siblings.indexOf(el));
          el.style.setProperty('--pop-delay', `${order * STAGGER_MS}ms`);
          el.setAttribute('data-pop', 'in');
          io.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );

    const track = (scope) => {
      scope.querySelectorAll(POP_SELECTOR).forEach((el) => {
        if (el.hasAttribute('data-pop')) return;
        // Anything already on screen at load stays put; only content below the fold pops.
        if (el.getBoundingClientRect().top < window.innerHeight) return;
        el.setAttribute('data-pop', 'wait');
        io.observe(el);
      });
    };
    track(document);

    // Launch film: the player grows to full size as it rises into view (scroll-linked, no pin).
    const film = document.querySelector('.showcase-stage');
    let frame = 0;
    const scrubFilm = () => {
      frame = 0;
      if (!film) return;
      const rect = film.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 when its top meets the bottom of the screen, 1 once its top reaches 35% from the top.
      const p = Math.min(1, Math.max(0, (vh - rect.top) / (vh * 0.65)));
      film.style.setProperty('--film-enter', p.toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(scrubFilm);
    };
    if (film) {
      film.setAttribute('data-film-scrub', '');
      scrubFilm();
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
    }

    return () => {
      io.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      root.removeAttribute('data-pop-ready');
      document.querySelectorAll('[data-pop]').forEach((el) => el.removeAttribute('data-pop'));
      film?.removeAttribute('data-film-scrub');
    };
  }, []);
}
