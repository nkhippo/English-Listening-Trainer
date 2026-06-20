import { useEffect, useRef } from 'react';

const DEFAULT_THRESHOLD = 48;

/**
 * Vertical swipe on touch devices (iOS Safari needs non-passive touchmove + preventDefault).
 */
export function useVerticalSwipe({ onSwipeUp, onSwipeDown, threshold = DEFAULT_THRESHOLD, enabled = true }) {
  const ref = useRef(null);
  const startRef = useRef(null);
  const onSwipeUpRef = useRef(onSwipeUp);
  const onSwipeDownRef = useRef(onSwipeDown);

  useEffect(() => { onSwipeUpRef.current = onSwipeUp; }, [onSwipeUp]);
  useEffect(() => { onSwipeDownRef.current = onSwipeDown; }, [onSwipeDown]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;

    function onStart(e) {
      const t = e.touches[0];
      if (!t) return;
      startRef.current = { y: t.clientY, x: t.clientX };
    }

    function onMove(e) {
      const start = startRef.current;
      if (!start) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
        e.preventDefault();
      }
    }

    function onEnd(e) {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      if (Math.abs(dy) < threshold || Math.abs(dy) < Math.abs(dx)) return;
      if (dy < 0) onSwipeUpRef.current?.();
      else onSwipeDownRef.current?.();
    }

    function onCancel() {
      startRef.current = null;
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, threshold]);

  return ref;
}
