import { useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { axisOf, followOffset, hintFor, startsOnControl, swipeCommits } from '../../lib/swipe.js';
import { motionOK } from '../../lib/motion.js';

/* Swipe a card sideways to tick it off or undo it (admin-only `swipeDone`). Touch events only, so a mouse (and the desktop HTML5 drag)
   is never touched. The card owns a swipe that starts on its body: it stops the touch from reaching the board's day-swipe. A swipe that
   starts anywhere else (day heading, gaps, a card without a card checkbox) still changes day. It calls `toggle`, the same store action
   the checkbox uses, so nothing about the check-off changes. */
export function useSwipeDone({ enabled, done, toggle }: { enabled: boolean; done: boolean; toggle: (on: boolean) => void }) {
  const g = useRef<{ x: number; y: number; w: number; lock: 'x' | 'y' | null } | null>(null);
  const [drag, setDrag] = useState<{ off: number; hint: 'Done' | 'Undo' } | null>(null);
  if (!enabled) return { props: {}, className: '', style: undefined, hint: undefined };

  const end = () => { g.current = null; setDrag(null); };
  const props = {
    onTouchStart(e: TouchEvent<HTMLElement>) {
      if (e.touches.length !== 1 || startsOnControl(e.target as Element)) { g.current = null; return; }
      e.stopPropagation(); // a touch on the card body is the card's, not the day-swipe's
      const t = e.touches[0];
      g.current = { x: t.clientX, y: t.clientY, w: e.currentTarget.getBoundingClientRect().width, lock: null };
    },
    onTouchMove(e: TouchEvent<HTMLElement>) {
      const s = g.current; if (!s) return;
      const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
      if (!s.lock) { const a = axisOf(dx, dy); if (a !== 'none') s.lock = a; }
      if (s.lock === 'y') { end(); return; } // the page is scrolling: let go
      if (s.lock === 'x') setDrag({ off: motionOK() ? followOffset(dx, dy) : 0, hint: hintFor(done) });
    },
    onTouchEnd(e: TouchEvent<HTMLElement>) {
      const s = g.current; if (!s) return;
      e.stopPropagation();
      const t = e.changedTouches[0];
      const commit = s.lock !== 'y' && swipeCommits(t.clientX - s.x, t.clientY - s.y, s.w);
      end();
      if (commit) toggle(!done);
    },
    onTouchCancel() { end(); },
  };
  const style: CSSProperties | undefined = drag && drag.off ? { transform: `translateX(${drag.off}px)` } : undefined;
  return { props, className: ' swipable' + (drag ? ' swiping' : ''), style, hint: drag?.hint };
}
