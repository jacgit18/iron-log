import { useEffect, useRef } from 'react';
import './Pill.css';
import './SubNav.css';

// The second-level switch of a screen (brief subnav-pill-row-and-wording-table): a row of the shared pill, one pill per view or group. It scrolls sideways inside its own box on a phone and wraps on a desktop.
// `state` says how the chosen pill is marked for assistive tech: a choice between views is pressed, the group being read in a jump bar is current. `id` on an item keeps the id a view's button had.
export interface SubNavItem { key: string; label: string; id?: string }

export default function SubNav({ label, items, value, onChange, state = 'pressed', as = 'div', className }: {
  label: string; items: readonly SubNavItem[]; value: string; onChange: (key: string) => void; state?: 'pressed' | 'current'; as?: 'div' | 'nav'; className?: string;
}) {
  const box = useRef<HTMLElement | null>(null);
  // On a phone the row scrolls: keep the group being read in view inside the row (the row's own scroll only, never the page's).
  useEffect(() => {
    const row = box.current; const el = state === 'current' ? row?.querySelector<HTMLElement>('[aria-current="true"]') : null;
    if (!row || !el || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect(); const b = el.getBoundingClientRect();
    if (b.left < r.left) row.scrollLeft -= r.left - b.left + 8; else if (b.right > r.right) row.scrollLeft += b.right - r.right + 8;
  }, [value, state]);
  const buttons = items.map(it => {
    const on = it.key === value;
    return <button key={it.key} type="button" id={it.id} className="pillbtn" onClick={() => onChange(it.key)} {...(state === 'current' ? { 'aria-current': on ? ('true' as const) : undefined } : { 'aria-pressed': on })}>{it.label}</button>;
  });
  const cls = `subnav${className ? ` ${className}` : ''}`;
  return as === 'nav' ? <nav ref={el => { box.current = el; }} className={cls} aria-label={label}>{buttons}</nav> : <div ref={el => { box.current = el; }} className={cls} role="group" aria-label={label}>{buttons}</div>;
}
