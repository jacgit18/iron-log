import { useEffect, type RefObject } from 'react';

/** Smallest bottom tab bar (px): its default height, which the CSS falls back to before this runs. */
const MIN_TABBAR = 58;

/**
 * Publishes the fixed bottom tab bar's height as `--tabbar`, so the page padding, the timer bar, the Rest timer button and
 * the scroll padding all clear it. At a larger text size the labels get taller and can wrap to a second row, so the height can't
 * be a constant. The device's safe-area inset is left out, because the CSS adds it separately. Never below the default height,
 * so nothing moves at the normal text size.
 */
export default function useTabbarHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      // Only a fixed bar across the bottom counts. On wide screens the tabs sit in the header, and a side rail is not a bottom bar.
      if (cs.position !== 'fixed' || rect.width < window.innerWidth / 2) { root.style.removeProperty('--tabbar'); return; }
      const inset = Math.max(0, (parseFloat(cs.paddingBottom) || 0) - 6); // 6 is the bar's own bottom padding
      root.style.setProperty('--tabbar', `${Math.max(MIN_TABBAR, Math.ceil(rect.height - inset))}px`);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--tabbar'); };
  }, [ref]);
}
