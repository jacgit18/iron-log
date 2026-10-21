import { money } from '../../lib/grocery.js';
import { monthOwes, purchasesOf } from '../../lib/grocerySettle.js';
import type { Grocery, GroceryMonth } from '../../types.ts';
import Icon from '../Icon.jsx';
import SplitSummary from './SplitSummary.js';
import './SplitSection.css';

// "Splitting this month" folded away at the bottom of To get: the header says what is still outstanding (or All settled) and opens the cards in place.
// It starts closed each time (the owner's call, 2026-10-21); the money line over the list opens it too.
export default function SplitSection({ g, month, mk, open, onToggle }: { g: Grocery; month: GroceryMonth; mk: string; open: boolean; onToggle: (open: boolean) => void }) {
  if (!purchasesOf(g, month).length) return null; // nothing bought, nothing to split
  const { owed, youOwe } = monthOwes(g, month);
  const outstanding = owed + youOwe;
  const bodyId = `groc-split-body-${mk}`;
  return (
    <div className="gsplitsection" id={`groc-split-${mk}`}>
      <button type="button" className="gsplittoggle" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(!open)}>
        <span className="gsplittitle"><b>Splitting this month</b><small className={outstanding > 0 ? 'gsplitowed' : 'gsplitdone'}>{outstanding > 0 ? `Outstanding ${money(outstanding)}` : 'All settled ✓'}</small></span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} />
      </button>
      {open && <div id={bodyId}><SplitSummary g={g} month={month} mk={mk} /></div>}
    </div>
  );
}
