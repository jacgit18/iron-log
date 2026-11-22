import { entryFromFood } from '../../lib/dietLog.js';
import { mealLine, planMeal } from '../../lib/dietMeals.js';
import { runInstantLog } from '../../lib/instantLog.js';
import { quickRows, savedMealsNote } from '../../lib/quickMeals.js';
import { stampMeal } from '../../lib/stampMeal.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useLegacyMeals } from '../../store/useLegacyMeals.js';
import type { PlanSlot } from '../../types.ts';
import './Diet.css';

// Your meals in Quick add (briefs diet-saved-meals, saved-meals-into-recipes): the meals in Recipes (built from foods, or saved from what you logged, or moved here from the old saved-meals list; the old list is read only for a meal that could not move yet). One tap logs each food of a meal as its own entry
// on the day shown. They are renamed, edited and deleted in Recipes. `full` is a day with no room left: logging one is off.
export default function SavedMeals({ day, slot, full, onAdded }: { day: string; slot?: PlanSlot; full: boolean; onAdded: (text: string) => void }) { // `slot`: the meal pressed on today, which every entry is logged into
  const recipes = useAppStore(s => s.recipes);
  const { held } = useLegacyMeals();
  const meals = quickRows(recipes, held); // the old list is read only while a saved meal could not move (300 recipes); then it stays listed so none seems to vanish
  if (meals.length === 0) return null;
  const log = (id: string) => {
    const m = meals.find(x => x.id === id);
    if (!m) return;
    const st = useAppStore.getState();
    const plan = planMeal(st.diet, day, m);
    onAdded(runInstantLog(stampMeal(st, slot).addDietEntry, plan.add.map(f => entryFromFood(day, f)), { from: m.n, left: plan.left }).text);
  };
  return (
    <div className="dt-meals">
      <p className="note" id="dt-meals-h">Saved meals</p>
      <ul className="dt-recents" aria-labelledby="dt-meals-h">
        {meals.map(m => <li key={m.id}><button type="button" className="btn sm" disabled={full} onClick={() => log(m.id)}>{mealLine(m)}</button></li>)}
      </ul>
      <p className="note">{savedMealsNote(held, recipes.length)}</p>
    </div>
  );
}
