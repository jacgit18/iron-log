import { useMemo } from 'react';
import { withoutUsed } from '../../lib/grocery.js';
import { foodItem, foodMarks, NOT_TRACKED, pinValue } from '../../lib/boardStock.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import type { Recipe } from '../../types.ts';
import StockPill from './StockPill.js';
import './FoodAtHome.css';

// The At home item of a ready-made food (brief ready-made-have-gate): which Groceries Inventory item says whether you have it. Matched by name unless pinned to another item or set to Not tracked.
export default function AtHomeItem({ recipe }: { recipe: Recipe }) {
  const groceryAll = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const today = ymd(useToday(s => s.today));
  const items = useMemo(() => withoutUsed(groceryAll, months).items.slice().sort((a, b) => a.n.localeCompare(b.n, undefined, { sensitivity: 'base' })), [groceryAll, months]);
  const stock = useMemo(() => foodMarks([recipe], today, groceryAll, months).get(recipe.id) ?? null, [recipe, today, groceryAll, months]);
  if (!items.length) return null; // nothing on Inventory to tie it to
  const byName = foodItem({ n: recipe.n }, items);
  const value = pinValue(recipe, items);
  return (
    <div className="rc-athome">
      <label className="field" htmlFor="rc-athome-sel">At home item
        <select id="rc-athome-sel" value={value} onChange={e => useAppStore.getState().setRecipeHome(recipe.id, e.target.value || null)}>
          <option value="">{byName ? `Match by name (${byName.n})` : 'Match by name (none found)'}</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.n}</option>)}
          <option value={NOT_TRACKED}>Not tracked</option>
        </select>
      </label>
      <p className="rc-athomestate" role="status">{value === NOT_TRACKED ? 'Not tracked: the board shows no mark for it.' : stock ? <>It counts as&nbsp;<StockPill stock={stock} />&nbsp;from Groceries.</> : 'No item matches, so no mark.'}</p>
    </div>
  );
}
