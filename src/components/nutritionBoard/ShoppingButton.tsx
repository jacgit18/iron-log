import { useMemo } from 'react';
import { addMissingMessage } from '../../lib/recipePantry.js';
import { shoppingDays, shoppingNeed, shoppingRecipeIds } from '../../lib/weekShopping.js';
import { useAppStore } from '../../store/useAppStore.js';

// `today` is YYYY-MM-DD, so its first seven characters are the Shopping month key.
const NO_MONTH = { lines: {}, pulled: [] };

// Week to Shopping (brief week-shopping): one tap puts the missing ingredients of the shown week's planned, uneaten recipes on Shopping. What it added
// comes back with the board's Undo notice (RemovedNotice scope "diet"); a tap that adds nothing says why in the board's message line.
export default function ShoppingButton({ week, today, onMsg }: { week: readonly string[]; today: string; onMsg: (text: string) => void }) {
  const cfg = useAppStore(s => s.cfg);
  const diet = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const grocery = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const days = useMemo(() => shoppingDays(week, today), [week, today]);
  const need = useMemo(() => {
    const ids = shoppingRecipeIds(cfg.diet?.plan ?? {}, days, recipes, diet);
    return shoppingNeed(ids, recipes, grocery, months[today.slice(0, 7)] ?? NO_MONTH);
  }, [cfg.diet?.plan, days, today, recipes, diet, grocery, months]);
  const tap = () => {
    const st = useAppStore.getState();
    const r = st.planToShopping(days);
    if (!r.ids.length) { onMsg(addMissingMessage(r)); return; }
    onMsg('');
    st.noteRemoved('diet', `${r.added} to Shopping${r.already ? `; ${r.already} already there` : ''}`, () => {
      for (const id of r.ids) useAppStore.getState().removeGroceryItem(id, { quiet: true });
      return true;
    }, { verb: 'Added', undone: 'Removed from Shopping' });
    if (r.refused) onMsg(r.refused);
  };
  return <button type="button" className="btn" id="nb-shopping" disabled={need === 0} onClick={tap}>Add missing to Shopping</button>;
}
