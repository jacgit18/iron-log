import type { Chip } from '../../lib/groceryChips.js';
import { haveMonthText } from '../../lib/groceryChips.js';
import { RailStores } from './GroceryRail.js';
import './InventoryRail.css';

// The desktop right rail on Inventory (brief groceries-bought-inventory-lists), from 1100 px: how many items you have this month, and the stores with their item counts, which pick the chip.
// Inventory has no summary tiles, so the card is one line. Not shown while editing.
export default function InventoryRail({ have, total, chips, value, onChange }: { have: number; total: number; chips: Chip[]; value: string; onChange: (key: string) => void }) {
  return (
    <aside className="grail" aria-label="Inventory">
      <p className="ginvhave" id="groc-inv-have">{haveMonthText(have, total)}</p>
      <RailStores chips={chips} value={value} onChange={onChange} />
    </aside>
  );
}
