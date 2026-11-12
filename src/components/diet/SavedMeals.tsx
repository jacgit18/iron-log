import { entryFromFood } from '../../lib/dietLog.js';
import { mealLine, planMeal } from '../../lib/dietMeals.js';
import { runInstantLog } from '../../lib/instantLog.js';
import { quickRows } from '../../lib/quickMeals.js';
import { useAppStore } from '../../store/useAppStore.js';
import './Diet.css';

// Your meals in Quick add (briefs diet-saved-meals, saved-meals-into-recipes): the meals in Recipes (built from foods, or saved from what you logged, or moved here from the old saved-meals list). One tap logs each food of a meal as its own entry
// on the day shown. They are renamed, edited and deleted in Recipes. `full` is a day with no room left: logging one is off.
export default function SavedMeals({ day, full, onAdded }: { day: string; full: boolean; onAdded: (text: string) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const saved = useAppStore(s => s.cfg.diet?.meals) ?? [];
  const moved = useAppStore(s => s.cfg.diet?.mealsMoved) ?? {};
  const meals = quickRows(recipes, saved, moved); // a saved meal still waiting to move into Recipes stays listed, so none seems to vanish
  if (meals.length === 0) return null;
  const log = (id: string) => {
    const m = meals.find(x => x.id === id);
    if (!m) return;
    const st = useAppStore.getState();
    const plan = planMeal(st.diet, day, m);
    onAdded(runInstantLog(st.addDietEntry, plan.add.map(f => entryFromFood(day, f)), { from: m.n, left: plan.left }).text);
  };
  return (
    <div className="dt-meals">
      <p className="note" id="dt-meals-h">Saved meals</p>
      <ul className="dt-recents" aria-labelledby="dt-meals-h">
        {meals.map(m => <li key={m.id}><button type="button" className="btn sm" disabled={full} onClick={() => log(m.id)}>{mealLine(m)}</button></li>)}
      </ul>
      <p className="note">{meals.some(m => m.waiting) ? 'Some saved meals move into Recipes when there is room for them. Rename or edit a meal in Recipes.' : 'Rename or edit a meal in Recipes.'}</p>
    </div>
  );
}
