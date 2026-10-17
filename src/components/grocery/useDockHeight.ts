import { useEffect, type RefObject } from 'react';

/**
 * Keeps the editing dock clear of a running rest or hold timer, and tells the page how much room it takes. The timer bar is fixed at the
 * same bottom edge, so the dock lifts by the bar's height while one is up (`--lift` on the dock), and `--gdock-top` on the page is the
 * distance from the bottom bar to the dock's top edge: the list's padding and the undo notice clear it with that.
 */
export default function useDockHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dock = ref.current;
    if (!dock) return;
    const root = document.documentElement;
    let bar: Element | null = null;
    const update = () => {
      const lift = bar ? Math.ceil(bar.getBoundingClientRect().height) : 0;
      dock.style.setProperty('--lift', `${lift}px`);
      root.style.setProperty('--gdock-top', `${lift + Math.ceil(dock.getBoundingClientRect().height)}px`);
    };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    ro?.observe(dock);
    const find = () => {
      const next = document.querySelector('.timerbar');
      if (next === bar) return;
      if (bar) ro?.unobserve(bar);
      bar = next;
      if (bar) ro?.observe(bar);
      update();
    };
    const mo = new MutationObserver(find); // the timer bar mounts and unmounts as a timer starts and ends
    mo.observe(document.body, { childList: true, subtree: true });
    find(); update();
    return () => { ro?.disconnect(); mo.disconnect(); root.style.removeProperty('--gdock-top'); };
  }, [ref]);
}
