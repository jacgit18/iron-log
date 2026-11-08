import type { GroceryItem } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import './ReceiptRename.css';

// The receipt names of one item in its edit row (brief receipt-rename-memory): the receipt texts the person renamed to it, each with Forget. Nothing is shown when it has none.
// Forget uses the standard removal notice with Undo (the Removed notice at the foot of the list).
export default function ReceiptNames({ item }: { item: Pick<GroceryItem, 'id' | 'n' | 'aliases'> }) {
  if (!item.aliases?.length) return null;
  return (
    <div className="rcnames" role="group" aria-label={`Receipt names for ${item.n}`}>
      <span className="rcnameshead">Receipt names<small>A receipt line with one of these goes to {item.n}.</small></span>
      <ul>
        {item.aliases.map(a => (
          <li key={a}>
            <span className="rcnamestext">{a}</span>
            <button type="button" className="rcforget" aria-label={`Forget ${a}`} onClick={() => useAppStore.getState().forgetGroceryAlias(item.id, a)}>Forget</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
