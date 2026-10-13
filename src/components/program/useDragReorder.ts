import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { haptic } from '../../lib/haptics.js';

/** Where a drag is now: the row picked up, the index it would land on, how far it has been dragged and the room it takes (px). */
export type DragState = { from: number; to: number; dy: number; size: number };

const EDGE = 80; // px from the top or bottom of the window where a drag starts scrolling the page (clears the phone tab bar)
const SLOW = 150; // px per second at the inner edge of that zone
const FAST = 900; // px per second at the window's edge
const SLOP = 6; // px the pointer must move before the page scrolls, so grabbing a row near an edge does not scroll by itself

/** Page scroll speed (px per second, negative is up) for a pointer at `y` in a window `height` tall: none in the middle, faster the nearer an edge. */
export function edgeSpeed(y: number, height: number): number {
  const speed = (depth: number) => SLOW + (FAST - SLOW) * Math.min(1, Math.max(0, depth));
  if (y < EDGE) return -speed((EDGE - y) / EDGE);
  if (y > height - EDGE) return speed((y - (height - EDGE)) / EDGE);
  return 0;
}

/** How far row `i` slides to make room while row `from` is dragged to `to`. */
export function shiftOf(d: DragState | null, i: number): number {
  if (!d || i === d.from) return 0;
  if (d.from < i && i <= d.to) return -d.size;
  if (d.to <= i && i < d.from) return d.size;
  return 0;
}

/** The index a row lands on: how many of the other rows have their middle above the dragged row's middle. */
export function dropIndex(mids: number[], from: number, center: number): number {
  return mids.reduce((n, m, j) => (j !== from && m < center ? n + 1 : n), 0);
}

/**
 * Drag to reorder a vertical list with a handle, using pointer events so it works with a mouse, a pen and a finger
 * (HTML drag and drop does not fire on most phones). Positions are kept in page coordinates, so the page can scroll
 * under the drag; it scrolls by itself near the window's edges. Escape or a cancelled pointer puts the row back.
 */
export function useDragReorder(count: number, onDrop: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);
  const stop = useRef<(() => void) | null>(null);
  const drop = useRef(onDrop);

  useEffect(() => { drop.current = onDrop; }, [onDrop]);
  useEffect(() => () => stop.current?.(), []);

  const start = (from: number, e: ReactPointerEvent) => {
    if (e.button !== 0 || stop.current) return;
    e.preventDefault(); // no text selection, no scroll from this touch
    const mids = rows.current.slice(0, count).map(el => { if (!el) return Infinity; const r = el.getBoundingClientRect(); return r.top + r.height / 2 + window.scrollY; });
    const el = rows.current[from];
    const size = el ? el.offsetHeight + (parseFloat(getComputedStyle(el.parentElement ?? el).rowGap) || 0) : 0; // the row plus the list's gap
    const startY = e.clientY + window.scrollY;
    let y = e.clientY; let to = from; let frame = 0; let moved = false; let lastTs = 0;

    const update = () => {
      const dy = y + window.scrollY - startY;
      const next = dropIndex(mids, from, mids[from] + dy);
      if (next !== to) haptic(6); // a tick each time the row passes a neighbour
      to = next;
      setDrag({ from, to, dy, size });
    };
    // Scrolls by the time since the last frame, so the speed is the same on a 60 and a 120 Hz screen.
    const scroll = (ts: number) => {
      const dt = lastTs ? Math.min(ts - lastTs, 50) : 0; lastTs = ts;
      const v = moved ? edgeSpeed(y, window.innerHeight) : 0;
      if (v && dt) { window.scrollBy(0, v * dt / 1000); update(); }
      frame = requestAnimationFrame(scroll);
    };
    const move = (ev: PointerEvent) => { y = ev.clientY; if (Math.abs(y + window.scrollY - startY) > SLOP) moved = true; update(); };
    const end = (commit: boolean) => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      stop.current = null;
      setDrag(null);
      if (commit && to !== from) { haptic(10); drop.current(from, to); }
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false); } };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    stop.current = () => end(false);
    frame = requestAnimationFrame(scroll);
    setDrag({ from, to, dy: 0, size });
    haptic(12); // picked up
  };

  return {
    drag,
    /** Ref for row `i`, so the hook can measure it. */
    rowRef: (i: number) => (el: HTMLElement | null) => { rows.current[i] = el; },
    /** Props for row `i`'s drag handle. */
    handleProps: (i: number) => ({
      onPointerDown: (e: ReactPointerEvent) => start(i, e),
      onContextMenu: (e: { preventDefault(): void }) => e.preventDefault(), // a long press on Android would open a menu and cancel the drag
    }),
  };
}
