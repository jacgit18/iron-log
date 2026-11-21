import { useMemo } from 'react';
import { addMissingMessage } from '../../lib/recipePantry.js';
import { plannedShoppingIds, shoppingBarText, shoppingDays, shoppingNeed } from '../../lib/weekShopping.js';
import { useAppStore } from '../../store/useAppStore.js';
import './ShoppingButton.css';

// `today` is YYYY-MM-DD, so its first seven characters are the Shopping month key.
const NO_MONTH = { lines: {}, pulled: [] };

// Week to Shopping (brief week-shopping): one tap puts the missing ingredients of the shown week's planned, uneaten recipes and listed daily snacks on Shopping. What it added
// comes back with the board's Undo notice (RemovedNotice scope "diet"); a tap that adds nothing says why in the message line of whoever holds it. On a phone it is a bar above the day, drawn only when something is missing (`bar`); elsewhere it is the toolbar button.
export default function ShoppingButton({ week, today, onMsg, onAdded, bar }: { week: readonly string[]; today: string; onMsg: (text: string) => void; onAdded?: () => void; bar?: boolean }) {
  const cfg = useAppStore(s => s.cfg);
  const diet = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const grocery = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const days = useMemo(() => shoppingDays(week, today), [week, today]);
  const need = useMemo(() => {
    const ids = plannedShoppingIds(cfg.diet, days, today, recipes, diet);
    return shoppingNeed(ids, recipes, grocery, months[today.slice(0, 7)] ?? NO_MONTH);
  }, [cfg.diet, days, today, recipes, diet, grocery, months]);
  const tap = () => {
    const st = useAppStore.getState();
    const r = st.planToShopping(days, today.slice(0, 7), today); // the same month the count above read
    if (!r.ids.length) { onMsg(addMissingMessage(r)); return; }
    onMsg('');
    st.noteRemoved('diet', `${r.added} to Shopping${r.already ? `; ${r.already} already there` : ''}`, () => {
      for (const id of r.ids) useAppStore.getState().removeGroceryItem(id, { quiet: true });
      return true;
    }, { verb: 'Added', undone: 'Removed from Shopping' });
    if (r.refused) { onMsg(r.refused); return; } // the reason shows where the tap was: the Manage sheet stays open so its note is read, and the board's Undo notice waits behind it
    onAdded?.(); // the Manage sheet closes so the board's Undo notice is the thing on screen
  };
  if (bar) {
    const text = shoppingBarText(need);
    return text ? <div className="nb-shopbar" role="group" aria-label="Shopping"><span>{text}</span><button type="button" className="btn" id="nb-shopping" onClick={tap}>Add to Shopping</button></div> : null; // nothing to add: nothing drawn
  }
  return <button type="button" className="btn" id="nb-shopping" disabled={need === 0} onClick={tap}>Add missing to Shopping</button>;
}
