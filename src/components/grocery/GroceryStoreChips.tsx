import { asDropdown, chipOptionText, chipToValue, valueToChip } from '../../lib/groceryChips.js';
import type { Chip } from '../../lib/groceryChips.js';
import FilterSelect from '../FilterSelect.js';
import './GroceryStoreChips.css';

// The store filter over the Shopping list (brief groceries-store-chips-owes, filter-dropdowns): All and one chip per store, each with how many rows are still to get. Up to four options stay chips;
// more (All plus 4 or more stores) become one dropdown with the counts in the option text. A filter is not a screen, so it has no address. The chip row scrolls inside itself, so a large text size never makes the page scroll sideways.
export default function GroceryStoreChips({ chips, value, onChange, label = 'Store' }: { chips: Chip[]; value: string; onChange: (key: string) => void; label?: string }) {
  if (asDropdown(chips)) {
    return (
      <div className="gstorechips gstoredrop">
        <FilterSelect label={label} value={chipToValue(value)} onChange={v => onChange(valueToChip(v))}>
          {chips.map(c => <option key={c.key} value={chipToValue(c.key)}>{chipOptionText(c)}</option>)}
        </FilterSelect>
      </div>
    );
  }
  return (
    <div className="gstorechips" role="group" aria-label={label}>
      {chips.map(c => (
        <button key={c.key} type="button" className={`gstorechip${value === c.key ? ' on' : ''}`} aria-pressed={value === c.key} onClick={() => onChange(c.key)}>{c.label} {c.count}</button>
      ))}
    </div>
  );
}
