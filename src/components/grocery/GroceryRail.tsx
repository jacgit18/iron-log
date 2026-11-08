import type { Chip } from '../../lib/groceryChips.js';
import { tally } from '../../lib/grocery.js';
import GrocerySummary from './GrocerySummary.js';
import './GroceryRail.css';

// The desktop right rail on Shopping and Bought (brief groceries-store-chips-owes), shown from 1100 px: the summary tiles stacked, and the stores with how many rows each has.
// A store here picks the chip, on Shopping, Bought and Inventory. At this width the rail's card is the page's summary (the status region), so it is the only one drawn.
// The Stores list: each store with its count; with `onChange` a store is a button that picks the chip (and pressing it again goes back to All).
export function RailStores({ chips, value, onChange }: { chips: Chip[]; value?: string; onChange?: (key: string) => void }) {
  const stores = chips.filter(c => c.key !== chips[0]?.key);
  if (!stores.length) return null;
  return (
    <nav className="grailstores" aria-label="Stores">
      <b>Stores</b>
      {stores.map(c => onChange
        ? <button key={c.key} type="button" className={`grailstore${value === c.key ? ' on' : ''}`} aria-pressed={value === c.key} onClick={() => onChange(value === c.key ? chips[0]!.key : c.key)}><span>{c.label}</span><span>{c.count}</span></button>
        : <p key={c.key} className="grailstore"><span>{c.label}</span><span>{c.count}</span></p>)}
    </nav>
  );
}

export default function GroceryRail({ t, view, empty, chips, value, onChange }: { t: ReturnType<typeof tally>; view: 'shopping' | 'bought'; empty: string; chips: Chip[]; value?: string; onChange?: (key: string) => void }) {
  return (
    <aside className="grail" aria-label="This month">
      <GrocerySummary t={t} view={view} empty={empty} rail />
      <RailStores chips={chips} value={value} onChange={onChange} />
    </aside>
  );
}
