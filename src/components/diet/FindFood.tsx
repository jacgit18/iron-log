import { useState } from 'react';
import { entryText } from '../../lib/dietLog.js';
import { findFoods } from '../../lib/foodMacros.js';
import { foodTypeOf } from '../../lib/foodType.js';
import { FOOD_TYPE_LABEL } from '../../shared/recipes.js';
import { useAppStore } from '../../store/useAppStore.js';
import FoodSearch, { type FoodFill, type ScanResume } from './FoodSearch.js';
import './Diet.css';

// "Find a food" (brief diet-auto-macros): type a name, see what you logged before and your own recipes with their numbers, pick one. A recipe opens the shared LogControl (brief log-or-plan-control: portion, day, Log or Plan); a food you logged before has no recipe to plan, so it keeps the small inline Less / More / Add. Nothing is stored for this; it reads the log and the recipes.
// The same words also go to the USDA food search (brief diet-food-lookup) so one box finds both; a USDA pick fills the Quick add form below, like the Look up nutrition box.
export default function FindFood({ day, onFood, reopen, resume }: { day: string; /** Unused since 4c (the portion sheet reports for itself); kept optional so the add sheet's call stays as it is. */ onAdded?: (text: string) => void; onFood: (fill: FoodFill) => void; reopen?: (r: ScanResume) => void; resume?: ScanResume }) {
  const diet = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const [q, setQ] = useState('');
  const found = findFoods(diet, recipes, q);
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
                <button type="button" className="btn sm" id={`dt-find-${f.from ?? f.n}`} onClick={() => useAppStore.getState().openModal(rec ? { type: 'portion', id: rec.id, day } : { type: 'portion', food: f, day })}>{f.n}{rec ? ` (${type ? FOOD_TYPE_LABEL[type] : 'recipe'})` : ''} · {entryText(f)}</button>
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
