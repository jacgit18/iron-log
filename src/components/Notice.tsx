import type { ReactNode, Ref } from 'react';

// One notice with its buttons: the text, then the actions in a row (the markup the Board toasts and the "Removed ..." notice share).
export interface NoticeAction {
  label: string;
  onClick: () => void;
  ghost?: boolean; // the quiet button: Dismiss and its kin
  btnRef?: Ref<HTMLButtonElement>;
}

export default function Notice({ className, innerRef, actions, children }: {
  className?: string; // 'movewarn' etc., added to .notice
  innerRef?: Ref<HTMLDivElement>;
  actions: (NoticeAction | false | null | undefined)[]; // a false entry is skipped, so a button can be conditional
  children: ReactNode;
}) {
  return (
    <div className={className ? `notice ${className}` : 'notice'} role="status" ref={innerRef}>
      <div>{children}</div>
      <div className="actions">
        {actions.map(a => a && <button type="button" key={a.label} className={a.ghost ? 'btn sm ghost' : 'btn sm'} ref={a.btnRef} onClick={a.onClick}>{a.label}</button>)}
      </div>
    </div>
  );
}
