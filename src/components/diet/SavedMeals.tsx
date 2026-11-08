import { mealLine, planMeal } from '../../lib/dietMeals.js';
import { mealItems, quickMeals } from '../../lib/quickMeals.js';
import { useAppStore } from '../../store/useAppStore.js';
import './Diet.css';

// Your meals in Quick add (briefs diet-saved-meals, saved-meals-into-recipes): the meals in Recipes (built from foods, or saved from what you logged, or moved here from the old saved-meals list). One tap logs each food of a meal as its own entry
// on the day shown. They are renamed, edited and deleted in Recipes. `full` is a day with no room left: logging one is off.
export default function SavedMeals({ day, full, onAdded }: { day: string; full: boolean; onAdded: (text: string) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const meals = quickMeals(recipes).map(r => ({ id: r.id, n: r.n, items: mealItems(r, recipes) })).filter(m => m.items.length > 0);
  if (meals.length === 0) return null;
  const log = (id: string) => {
    const m = meals.find(x => x.id === id);
    if (!m) return;
    const st = useAppStore.getState();
    const plan = planMeal(st.diet, day, m);
    let done = 0, stopped: string | null = null;
    for (const f of plan.add) {
      stopped = st.addDietEntry({ d: day, n: f.n, kcal: f.kcal, p: f.p, ...(f.c !== undefined ? { c: f.c } : {}), ...(f.f !== undefined ? { f: f.f } : {}), ...(f.from ? { from: f.from } : {}) }).error;
      if (stopped) break;
      done++;
    }
    onAdded(`Added ${done} from ${m.n}.${stopped ? ` ${stopped}` : plan.left > 0 ? ` ${plan.left} left out: 20 a day is the limit.` : ''}`);
  };
  return (
    <div className="dt-meals">
      <p className="note" id="dt-meals-h">Saved meals</p>
      <ul className="dt-recents" aria-labelledby="dt-meals-h">
        {meals.map(m => <li key={m.id}><button type="button" className="btn sm" disabled={full} onClick={() => log(m.id)}>{mealLine(m)}</button></li>)}
      </ul>
      <p className="note">Rename or edit a meal in Recipes.</p>
    </div>
  );
}
