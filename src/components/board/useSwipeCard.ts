import { useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { HINT, axisOf, followOffset, startsOnControl, swipeAction, swipeCommits, type CardState, type SwipeAction } from '../../lib/swipe.js';
import { motionOK } from '../../lib/motion.js';

/* Swipe a card sideways: right ticks it done, left skips it for the week, and either way on a done or skipped card puts it back
   (rules in lib/swipe.ts). Touch events only, so a mouse (and the desktop HTML5 drag) is never touched. The card owns a swipe that
   starts on its body: it stops the touch from reaching the board's day-swipe. A swipe that starts anywhere else (day heading, gaps)
   still changes day. `act` calls the same store actions as the checkbox and the Skip button, so nothing about them changes. */
export function useSwipeCard({ state, canDone, canSkip = true, act }: { state: CardState; canDone: boolean; canSkip?: boolean; act: (a: SwipeAction) => void }) {
  const g = useRef<{ x: number; y: number; w: number; lock: 'x' | 'y' | null } | null>(null);
  const [drag, setDrag] = useState<{ off: number; action: SwipeAction | null; dir: 'left' | 'right' } | null>(null);

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
      if (s.lock === 'x') {
        const action = swipeAction(dx, state, canDone, canSkip); // a way that does nothing (right on a superset) does not move the card
        setDrag({ off: action && motionOK() ? followOffset(dx, dy) : 0, action, dir: dx < 0 ? 'left' : 'right' });
      }
    },
    onTouchEnd(e: TouchEvent<HTMLElement>) {
      const s = g.current; if (!s) return;
      e.stopPropagation();
      const t = e.changedTouches[0]; const dx = t.clientX - s.x;
      const action = s.lock !== 'y' && swipeCommits(dx, t.clientY - s.y, s.w) ? swipeAction(dx, state, canDone, canSkip) : null;
      end();
      if (action) act(action);
    },
    onTouchCancel() { end(); },
  };
  const style: CSSProperties | undefined = drag && drag.off ? { transform: `translateX(${drag.off}px)` } : undefined;
  const hint = drag?.action ? HINT[drag.action] : undefined;
  return {
    props,
    className: ' swipable' + (drag ? ' swiping' : ''),
    style,
    data: { 'data-hint': hint, 'data-dir': hint ? drag!.dir : undefined, 'data-act': hint ? drag!.action! : undefined },
  };
}
