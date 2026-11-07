import type { Chip } from '../../lib/groceryChips.js';
import './GroceryStoreChips.css';

// The store chips over the Shopping list (brief groceries-store-chips-owes): All and one chip per store, each with how many rows are still to get. A chip is a filter,
// not a screen, so it has no address. A scrolling row, so a long store list or a large text size never makes the page scroll sideways.
export default function GroceryStoreChips({ chips, value, onChange }: { chips: Chip[]; value: string; onChange: (key: string) => void }) {
  return (
    <div className="gstorechips" role="group" aria-label="Store">
      {chips.map(c => (
        <button key={c.key} type="button" className={`gstorechip${value === c.key ? ' on' : ''}`} aria-pressed={value === c.key} onClick={() => onChange(c.key)}>{c.label} {c.count}</button>
      ))}
    </div>
  );
}
