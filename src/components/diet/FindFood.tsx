import { useState } from 'react';
import { entryText, hasMacros } from '../../lib/dietLog.js';
import { logFoodAtUsual, logRecipeAtUsual } from '../../lib/logAtUsual.js';
import type { Say } from '../../lib/eatenStep.js';
import { findFoods } from '../../lib/foodMacros.js';
import { foodTypeOf } from '../../lib/foodType.js';
import { FOOD_TYPE_LABEL } from '../../shared/recipes.js';
import { useAppStore } from '../../store/useAppStore.js';
import FoodSearch, { type FoodFill, type ScanResume } from './FoodSearch.js';
import './Diet.css';

// "Find a food" (brief diet-auto-macros): type a name, see what you logged before and your own recipes with their numbers, pick one. A pick logs at once at the usual portion on today or an earlier day (brief nutrition-log-first-portion-row); a day ahead opens the portion sheet (brief log-or-plan-control), and a food with no recipe behind it is log only. Nothing is stored for this; it reads the log and the recipes.
// The same words also go to the USDA food search (brief diet-food-lookup) so one box finds both; a USDA pick fills the Quick add form below, like the Look up nutrition box.
export default function FindFood({ day, today, onFood, onMsg, reopen, resume }: { day: string; today: string; onFood: (fill: FoodFill) => void; onMsg: Say; reopen?: (r: ScanResume) => void; resume?: ScanResume }) {
  const diet = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const [q, setQ] = useState('');
  const found = findFoods(diet, recipes, q);
  const st = () => useAppStore.getState();
  // Today or an earlier day: one tap logs at the usual portion (brief nutrition-log-first-portion-row), the sheet stays open and the status line says what was logged with Undo. A day ahead opens the portion sheet, which plans.
  const pick = (f: (typeof found)[number], rec: (typeof recipes)[number] | undefined) => {
    if (day > today || (rec && !hasMacros(rec))) { st().openModal(rec ? { type: 'portion', id: rec.id, day } : { type: 'portion', food: f, day }); return; }
    const m = rec ? logRecipeAtUsual(st(), rec, day, today) : logFoodAtUsual(st(), f, day, today);
    if (m.ok) onMsg(m.text, m.undo); else onMsg(m.error);
  };
  return (
    <div className="dt-find">
      <label className="field" htmlFor="dt-find-q">Search your past meals and recipes
        <input id="dt-find-q" type="search" value={q} maxLength={80} autoComplete="off" onChange={e => setQ(e.target.value)} />
      </label>
      {found.length > 0 && (
        <ul className="dt-recents" aria-label="Matches">
          {found.map(f => {
            const rec = f.from ? recipes.find(r => r.id === f.from) : undefined;
            const type = rec ? foodTypeOf(rec) : null;
            return (
              <li key={f.n}>
                <button type="button" className="btn sm" id={`dt-find-${f.from ?? f.n}`} onClick={() => pick(f, rec)}>{f.n}{rec ? ` (${type ? FOOD_TYPE_LABEL[type] : 'recipe'})` : ''} · {entryText(f)}</button>
              </li>
            );
          })}
        </ul>
      )}
      {q.trim() !== '' && found.length === 0 && <p className="note">Nothing in your meals or recipes matches.</p>}
      <FoodSearch text={q} onUse={f => { setQ(''); onFood(f); }} {...(reopen ? { reopen } : {})} {...(resume ? { resume } : {})} />
    </div>
  );
}
