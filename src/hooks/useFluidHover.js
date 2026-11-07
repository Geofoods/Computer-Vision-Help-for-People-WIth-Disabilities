import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pure geometry solver for Fluid Functionalism's proximity hover.
 * Exported so 1D ('x', 'y') and 2D ('xy') nearest-cell selection can be unit tested.
 */
export function pickNearest(entries, x, y, axis = 'xy') {
  let best = null;
  let bestDist = Infinity;

  for (const [id, rect] of entries) {
    const dx =
      axis === 'y'
        ? 0
        : x < rect.left
          ? rect.left - x
          : x > rect.right
            ? x - rect.right
            : 0;
    const dy =
      axis === 'x'
        ? 0
        : y < rect.top
          ? rect.top - y
          : y > rect.bottom
            ? y - rect.bottom
            : 0;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }

  return best;
}

/**
 * Tracks a single shared hover highlight across sibling items inside a container.
 * Entering from outside fades in cleanly; moving between items glides on `spring.fast`.
 */
export function useFluidHover(options = {}) {
  const { axis = 'xy', nearest = false, enterInset = 0 } = options;

  const containerRef = useRef(null);
  const itemsRef = useRef(new Map());
  const sessionCounterRef = useRef(0);
  const insideRef = useRef(false);
  const activeIdRef = useRef(null);

  const [hover, setHover] = useState(null);

  const measureItem = useCallback((id) => {
    const container = containerRef.current;
    const el = itemsRef.current.get(id);
    if (!container || !el) return null;
    const cRect = container.getBoundingClientRect();
    const iRect = el.getBoundingClientRect();
    return {
      x: iRect.left - cRect.left,
      y: iRect.top - cRect.top,
      width: iRect.width,
      height: iRect.height,
    };
  }, []);

  const activate = useCallback(
    (id) => {
      if (id === null || id === undefined) return;
      const rect = measureItem(id);
      if (!rect) return;
      if (!insideRef.current) {
        insideRef.current = true;
        sessionCounterRef.current += 1;
      }
      activeIdRef.current = id;
      const session = sessionCounterRef.current;
      setHover((prev) => {
        if (
          prev &&
          prev.id === id &&
          prev.session === session &&
          Math.abs(prev.rect.x - rect.x) < 0.5 &&
          Math.abs(prev.rect.y - rect.y) < 0.5 &&
          Math.abs(prev.rect.width - rect.width) < 0.5 &&
          Math.abs(prev.rect.height - rect.height) < 0.5
        ) {
          return prev;
        }
        return { id, rect, session };
      });
    },
    [measureItem],
  );

  const clear = useCallback(() => {
    insideRef.current = false;
    activeIdRef.current = null;
    setHover(null);
  }, []);

  const registerItem = useCallback(
    (id) => ({
      ref: (el) => {
        if (el) itemsRef.current.set(id, el);
        else itemsRef.current.delete(id);
      },
      onPointerEnter: (event) => {
        if (event.pointerType === 'touch') return;
        if (!nearest) activate(id);
      },
      onFocus: () => activate(id),
    }),
    [activate, nearest],
  );

  const handlePointerMove = useCallback(
    (event) => {
      if (!nearest || event.pointerType === 'touch') return;
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      if (
        enterInset > 0 &&
        !insideRef.current &&
        (event.clientX < cRect.left + enterInset ||
          event.clientX > cRect.right - enterInset ||
          event.clientY < cRect.top + enterInset ||
          event.clientY > cRect.bottom - enterInset)
      ) {
        return;
      }
      const entries = [];
      for (const [id, el] of itemsRef.current.entries()) {
        entries.push([id, el.getBoundingClientRect()]);
      }
      const best = pickNearest(entries, event.clientX, event.clientY, axis);
      if (best !== null && best !== activeIdRef.current) {
        activate(best);
      }
    },
    [activate, axis, enterInset, nearest],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (activeIdRef.current !== null) {
        const rect = measureItem(activeIdRef.current);
        if (rect) {
          setHover((prev) => (prev ? { ...prev, rect } : null));
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [measureItem]);

  const containerProps = {
    ref: containerRef,
    onPointerMove: nearest ? handlePointerMove : undefined,
    onPointerLeave: clear,
    onBlur: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        clear();
      }
    },
  };

  return { containerProps, registerItem, hover, clear };
}

