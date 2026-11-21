import { NEED_TEXT } from '../../lib/boardStock.js';
import { waitingText } from '../../lib/haveOnly.js';
import Icon from '../Icon.js';
import './WaitingChip.css';

// The chip under a day's meters (brief ready-made-have-gate): "3 waiting on inventory", the ready-made foods the board tucked away because Groceries says you need them. One button with aria-expanded, like the Keep handy tray; tapping it shows those foods in place (WaitingRow), for this visit only. Nothing shows when none wait.
export default function WaitingChip({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  if (!count) return null;
  return (
    <button type="button" className="wc-chip" aria-expanded={open} aria-label={`${waitingText(count)}, ${open ? 'hide' : 'show'}`} onClick={onToggle}>
      <span>{waitingText(count)}</span><Icon name={open ? 'chevron-up' : 'chevron-down'} />
    </button>
  );
}

/** A revealed food: dimmed, its name and the Need pill, and nothing to tap (stock and shopping stay on Groceries). */
export function WaitingRow({ name, portion }: { name: string; portion: number }) {
  return <div className="wc-row"><span className="wc-name">{name}{portion !== 1 ? ` × ${portion}` : ''}</span><span className="wb-stock shopping">{NEED_TEXT}</span></div>;
}
