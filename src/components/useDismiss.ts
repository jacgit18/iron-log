import { useEffect, useRef, type RefObject } from 'react';
import { dismissFor } from '../lib/dismiss.js';

// Closes an open popover on a press outside `box` and, unless `escape: false`, on Escape (document level), then calls `returnFocus` after an Escape so focus goes back to the opener.
// `onClose` and `returnFocus` are held in a ref, so a re-render while the popover is open does not re-attach the listeners. A popover that handles Escape itself passes `escape: false`.
export function useDismiss(open: boolean, box: RefObject<HTMLElement | null>, onClose: () => void, opts: { returnFocus?: () => void; escape?: boolean } = {}) {
  const latest = useRef({ onClose, returnFocus: opts.returnFocus });
  latest.current = { onClose, returnFocus: opts.returnFocus };
  const escape = opts.escape !== false;
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (dismissFor({ type: 'pointerdown', inside: !!box.current?.contains(e.target as Node) })) latest.current.onClose(); };
    const key = (e: KeyboardEvent) => { if (dismissFor({ type: 'keydown', key: e.key }) === 'escape') { latest.current.onClose(); latest.current.returnFocus?.(); } };
    document.addEventListener('pointerdown', away);
    if (escape) document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open, box, escape]);
}
