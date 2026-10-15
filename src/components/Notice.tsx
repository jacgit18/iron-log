import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import './Notice.css';

/* One notice with its buttons: the text, then the actions in a row.
   Four kinds, each with one meaning:
     undo        something just happened and can be taken back (unchecked, skipped, removed, applied)
     suggestion  the app proposes a change and waits for yes or no (the Back-to-back day order)
     warning     something you did has a catch (the move Heads-up)
     info        a plain fact
   Buttons: the main action is a short verb, a revert is always "Undo", and closing is always "Dismiss" (quiet, last).
   A notice that only reports something (undo, info) can `expire`; one that asks for an answer (suggestion, warning) never does. */
export type NoticeKind = 'undo' | 'suggestion' | 'warning' | 'info';
const ICON: Record<NoticeKind, string> = { undo: '↶', suggestion: '✦', warning: '⚠', info: 'ℹ' };

export interface NoticeAction {
  label: string;
  onClick: () => void;
  ghost?: boolean; // the quiet button: Dismiss
  title?: string; // the longer name for a short label, e.g. "Undo" -> "Move back to Day 3"
  btnRef?: Ref<HTMLButtonElement>;
}

// How long a notice that can be undone stays, in ms. The clock stops while the pointer or focus is on it, while the page is in the
// background and while the notice is not on screen (queued behind others).
export const UNDO_MS = 10_000;
const TICK_MS = 500;

export default function Notice({ kind, className, silent, expire, actions, children }: {
  kind: NoticeKind;
  className?: string; // extra class on .notice (e.g. removednote)
  silent?: boolean; // no role=status: something else announces it (the Toaster's live region)
  expire?: { ms: number; onExpire: () => void; key?: unknown }; // `key` restarts the clock when a new message replaces this one
  actions: (NoticeAction | false | null | undefined)[]; // a false entry is skipped, so a button can be conditional
  children: ReactNode;
}) {
  const own = useRef<HTMLDivElement | null>(null);
  const [held, setHeld] = useState(false);
  const ms = expire?.ms, key = expire?.key, onExpire = useRef(expire?.onExpire);
  useEffect(() => { onExpire.current = expire?.onExpire; });
  useEffect(() => {
    if (ms == null || held) return;
    let left = ms;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || !own.current || getComputedStyle(own.current).visibility === 'hidden') return;
      left -= TICK_MS;
      if (left <= 0) { clearInterval(id); onExpire.current?.(); }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [ms, key, held]);
  return (
    <div className={className ? `notice ${className}` : 'notice'} data-kind={kind} role={silent ? undefined : 'status'} ref={own}
      onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false); }}>
      <div className="nbody"><span className="nicon" aria-hidden="true">{ICON[kind]}</span><div className="ntext">{children}</div></div>
      {actions.some(Boolean) && (
        <div className="actions">
          {actions.map(a => a && <button type="button" key={a.label} className={a.ghost ? 'btn sm ghost' : 'btn sm'} ref={a.btnRef} aria-label={a.title ? `${a.label}: ${a.title}` : undefined} onClick={a.onClick}>{a.label}</button>)}
        </div>
      )}
    </div>
  );
}
