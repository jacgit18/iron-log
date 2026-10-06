import { useEffect, useId, useLayoutEffect, useRef, type ElementType, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore.js';
import { input } from '../hooks/useFocusKeeper.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

// Modal dialog sheet over a scrim. The page behind is inert while it's open, Tab stays inside, and
// closing returns focus to the control that opened it. Clicking the scrim closes it only when the
// press also started on the scrim, so a text selection dragged out of the sheet doesn't close it.
type Props = { as?: ElementType; className?: string; children?: ReactNode; onSubmit?: (e: FormEvent<HTMLFormElement>) => void; noValidate?: boolean; [attr: string]: unknown };
export default function Sheet({ as: Tag = 'div', className = '', children, ...rest }: Props) {
  const closeModal = useAppStore(s => s.closeModal);
  const downOnScrim = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    const opener = document.activeElement; const openerId = opener && opener.id;
    const bg = [...document.querySelectorAll('.wrap, .timer-region, .skip')];
    bg.forEach(el => { (el as HTMLElement).inert = true; });
    const el = ref.current!;
    const h = el.querySelector('h2');
    if (h) { h.id = h.id || titleId; el.setAttribute('aria-labelledby', h.id); }
    return () => {
      bg.forEach(el => { (el as HTMLElement).inert = false; });
      const back = (opener && opener.isConnected ? opener : (openerId && document.getElementById(openerId))) as HTMLElement | null | false | '';
      if (back) back.focus({ preventScroll: !input.keyboard });
    };
  }, [titleId]);

  // Forms start on their first field (or the one they focus themselves). Other sheets start on the
  // dialog itself, so reading begins at the top and focus never lands on a destructive button.
  useEffect(() => {
    const el = ref.current!;
    if (el.contains(document.activeElement)) return;
    const first = Tag === 'form' && el.querySelector<HTMLElement>(FOCUSABLE);
    (first || el).focus();
  }, [Tag]);

  const trap = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const f = [...ref.current!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
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
