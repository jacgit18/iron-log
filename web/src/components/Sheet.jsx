import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { input } from '../hooks/useFocusKeeper.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// Modal dialog sheet over a scrim. The page behind is inert while it's open, Tab stays inside, and
// closing returns focus to the control that opened it. Clicking the scrim closes it only when the
// press also started on the scrim, so a text selection dragged out of the sheet doesn't close it.
export default function Sheet({ as: Tag = 'div', className = '', children, ...rest }) {
  const closeModal = useAppStore(s => s.closeModal);
  const downOnScrim = useRef(false);
  const ref = useRef(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const opener = document.activeElement; const openerId = opener && opener.id;
    const bg = [...document.querySelectorAll('.wrap, .timer-region, .skip')];
    bg.forEach(el => { el.inert = true; });
    const h = ref.current.querySelector('h2');
    if (h) { h.id = h.id || titleId; ref.current.setAttribute('aria-labelledby', h.id); }
    return () => {
      bg.forEach(el => { el.inert = false; });
      const back = opener && opener.isConnected ? opener : (openerId && document.getElementById(openerId));
      if (back) back.focus({ preventScroll: !input.keyboard });
    };
  }, [titleId]);

  // Sheets that focus their own first field do it in their effect; otherwise focus the first control.
  useEffect(() => {
    if (!ref.current.contains(document.activeElement)) (ref.current.querySelector(FOCUSABLE) || ref.current).focus();
  }, []);

  const trap = e => {
    if (e.key !== 'Tab') return;
    const f = [...ref.current.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div
      className="scrim"
      onPointerDown={e => { downOnScrim.current = e.target === e.currentTarget; }}
      onClick={e => { if (e.target === e.currentTarget && downOnScrim.current) closeModal(); }}
    >
      {Tag === 'form' ? (
        <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1} className={`sheet ${className}`.trim()} onKeyDown={trap}>
          <form className="sheetform" onSubmit={rest.onSubmit} noValidate={rest.noValidate}>{children}</form>
        </div>
      ) : (
        <Tag ref={ref} role="dialog" aria-modal="true" tabIndex={-1} className={`sheet ${className}`.trim()} onKeyDown={trap} {...rest}>{children}</Tag>
      )}
    </div>
  );
}
