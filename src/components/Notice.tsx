import type { ReactNode, Ref } from 'react';
import './Notice.css';

/* One notice with its buttons: the text, then the actions in a row.
   Four kinds, each with one meaning:
     undo        something just happened and can be taken back (unchecked, skipped, removed, applied)
     suggestion  the app proposes a change and waits for yes or no (the Back-to-back day order)
     warning     something you did has a catch (the move Heads-up)
     info        a plain fact
   Buttons: the main action is a short verb, a revert is always "Undo", and closing is always "Dismiss" (quiet, last). */
export type NoticeKind = 'undo' | 'suggestion' | 'warning' | 'info';
const ICON: Record<NoticeKind, string> = { undo: '↶', suggestion: '✦', warning: '⚠', info: 'ℹ' };

export interface NoticeAction {
  label: string;
  onClick: () => void;
  ghost?: boolean; // the quiet button: Dismiss
  title?: string; // the longer name for a short label, e.g. "Undo" -> "Move back to Day 3"
  btnRef?: Ref<HTMLButtonElement>;
}

export default function Notice({ kind, className, innerRef, silent, actions, children }: {
  kind: NoticeKind;
  className?: string; // extra class on .notice (e.g. removednote)
  innerRef?: Ref<HTMLDivElement>;
  silent?: boolean; // no role=status: something else announces it (the Toaster's live region)
  actions: (NoticeAction | false | null | undefined)[]; // a false entry is skipped, so a button can be conditional
  children: ReactNode;
}) {
  return (
    <div className={className ? `notice ${className}` : 'notice'} data-kind={kind} role={silent ? undefined : 'status'} ref={innerRef}>
      <div className="nbody"><span className="nicon" aria-hidden="true">{ICON[kind]}</span><div className="ntext">{children}</div></div>
      {actions.some(Boolean) && (
        <div className="actions">
          {actions.map(a => a && <button type="button" key={a.label} className={a.ghost ? 'btn sm ghost' : 'btn sm'} ref={a.btnRef} aria-label={a.title ? `${a.label}: ${a.title}` : undefined} onClick={a.onClick}>{a.label}</button>)}
        </div>
      )}
    </div>
  );
}
