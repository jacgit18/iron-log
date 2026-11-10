import { useState } from 'react';
import { NO_NUTRITION } from '../../lib/recipeNutrition.js';
import { ateEntry, ateMax, entryText, hasMacros, oldestDay, packServings } from '../../lib/dietLog.js';
import { amountText, unitWord, usualStart } from '../../lib/foodUnit.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import PairSuggestion from './PairSuggestion.js';
import type { Recipe } from '../../types.ts';
import './Diet.css';

// "Ate this" on a recipe (ADR 086): logs the recipe's calories and protein per serving to a day (today unless the Day field is changed), as a snapshot. Only your own recipes with both numbers.
export default function AteThis({ recipe, mine, onEdit }: { recipe: Recipe; mine: boolean; onEdit: () => void }) {
  const [servings, setServings] = useState(() => usualStart(recipe)); // the usual amount of a ready-made food (brief usual-amount-and-unit), else 1
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);
  const [err, setErr] = useState('');
  const today = ymd(useToday(s => s.today)); // the shared "today" (it moves at midnight), not a Date read during render
  const [day, setDay] = useState(today);
  if (!mine) return <p className="note">{recipe.kcal === undefined && recipe.p === undefined ? NO_NUTRITION : 'Add this recipe to Mine first, then log it.'}</p>;
  if (!hasMacros(recipe)) {
    return <div className="dt-ate"><p className="note">Add calories and protein per serving to log this recipe.</p><button type="button" className="btn sm" onClick={onEdit}>Add them</button></div>;
  }
  const max = ateMax(recipe), pack = packServings(recipe);
  const log = () => {
    const made = ateEntry(recipe, servings, day, today);
    if ('error' in made) { setErr(made.error); return; }
    const r = useAppStore.getState().addDietEntry(made.entry);
    if (r.error || !r.id) { setErr(r.error ?? 'Couldn’t log that.'); return; }
    setErr(''); setDone({ id: r.id, text: `Logged ${amountText(servings, recipe)} of ${recipe.n} to ${day === today ? 'today' : day}.` });
  };
  return (
    <div>
      <p className="note">Per {unitWord(1, recipe)}: {entryText({ kcal: recipe.kcal!, p: recipe.p!, c: recipe.c, f: recipe.f })}</p>
      <label className="field" htmlFor="dt-ate-day">Day
        <input id="dt-ate-day" type="date" value={day} min={oldestDay(today)} max={today} onChange={e => { setDay(e.target.value); setErr(''); setDone(null); }} />
      </label>
      <div className="dt-ate">
        <button type="button" className="btn sm" disabled={servings <= 0.5} onClick={() => setServings(s => Math.max(0.5, s - 0.5))}>Less</button>
        <span role="status">{amountText(servings, recipe)}</span>
        <button type="button" className="btn sm" disabled={servings >= max} onClick={() => setServings(s => Math.min(max, s + 0.5))}>More</button>
        {pack !== null && pack <= max && <button type="button" className="btn sm" disabled={servings === pack} onClick={() => setServings(pack)}>Whole pack ({pack})</button>}
        <button type="button" className="btn primary" onClick={log}>Ate this</button>
      </div>
      {pack !== null && pack > max && <p className="note">A whole pack ({pack} servings) is more than one entry can hold. Log it in parts, up to {max} portions at a time.</p>}
      {err && <p className="note" role="alert">{err}</p>}
      {done && (
        <p className="note" role="status">{done.text} <button type="button" className="btn sm ghost" onClick={() => { useAppStore.getState().removeDietEntry(done.id, false); setDone(null); }}>Undo</button></p>
      )}
      {done && <PairSuggestion key={done.id} recipe={recipe} day={day} today={today} />}
    </div>
  );
}
