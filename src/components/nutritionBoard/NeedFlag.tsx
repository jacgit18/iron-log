import { foodItem } from '../../lib/boardStock.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe } from '../../types.ts';
import './AvailableTray.css';

// The "Need to buy" line under a food that Groceries says you do not have (brief nutrition-planned-available-tray, ADR 146): it is on Shopping already (a food you do not have is an Inventory item that is not ticked Have, which is what Need means), so the line says so, and I have it sets the Inventory tick for the current month. Its tick waits until Have. Only a ready-made food is ever flagged (`isNeedFood`).
export default function NeedFlag({ recipe, today }: { recipe: Recipe; today: string }) {
  const items = useAppStore(s => s.grocery.items);
  const item = foodItem(recipe, items);
  return (
    <div className="nf-line">
      <span className="nf-note">On Shopping</span>
      {item && <button type="button" className="btn sm" aria-label={`I have ${recipe.n}`} onClick={() => useAppStore.getState().setGroceryHave(today.slice(0, 7), item.id, true)}>I have it</button>}
    </div>
  );
}
