import { useState } from 'react';
import { ateEntry, ateMax, entryText, hasMacros, oldestDay, packServings, servingNumbers } from '../../lib/dietLog.js';
import { amountText, unitWord, usualStart } from '../../lib/foodUnit.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import Sheet from '../Sheet.js';
import './Diet.css';

// The portion sheet (brief nutrition-quick-log): the compact twin of "Ate this". A food's name, Less and More at its own unit with the numbers live, the Day, and Log it.
// It opens at the usual amount, and Undo removes only the entry it made. It logs through `ateEntry`, the same function Ate this uses. `modal.id` is the recipe, `modal.day` the day the screen shows.
export default function PortionSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const recipe = useAppStore(s => s.recipes.find(r => r.id === modal?.id));
  const today = ymd(useToday(s => s.today));
  const shown = typeof modal?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(modal.day) && modal.day <= today && modal.day >= oldestDay(today) ? modal.day : today;
  const [servings, setServings] = useState(() => (recipe ? usualStart(recipe) : 1));
  const [day, setDay] = useState(shown);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);
  if (!recipe) return <Sheet className="portionsheet"><h2 className="cond">Log a food</h2><p className="note">That food is gone.</p><div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Close</button></div></Sheet>;
  if (!hasMacros(recipe)) {
    return <Sheet className="portionsheet"><h2 className="cond">{recipe.n}</h2><p className="note">Add calories and protein per serving to log this. Open it in Recipes and choose Edit.</p><div className="actions"><button type="button" className="btn primary" onClick={closeModal}>Close</button></div></Sheet>;
  }
  const nums = servingNumbers(recipe, servings);
  const max = ateMax(recipe), pack = packServings(recipe);
  const log = () => {
    if (done) return; // a second tap on Log it never logs twice; Undo then Log it again is a new log
    const made = ateEntry(recipe, servings, day, today);
    if ('error' in made) { setErr(made.error); return; }
    const r = useAppStore.getState().addDietEntry(made.entry);
    if (r.error || !r.id) { setErr(r.error ?? 'Couldn’t log that.'); return; }
    setErr(''); setDone({ id: r.id, text: `Logged ${amountText(servings, recipe)} to ${day === today ? 'today' : day}.` });
  };
  return (
    <Sheet className="portionsheet">
      <h2 className="cond">{recipe.n}</h2>
      <p className="note" role="status">{nums ? entryText(nums) : 'Those numbers are out of range.'} for {amountText(servings, recipe)}</p>
      <div className="dt-ate">
        <button type="button" className="btn sm" disabled={servings <= 0.5 || !!done} onClick={() => setServings(s => Math.max(0.5, s - 0.5))}>Less</button>
        <span>{amountText(servings, recipe)}</span>
        <button type="button" className="btn sm" disabled={servings >= max || !!done} onClick={() => setServings(s => Math.min(max, s + 0.5))}>More</button>
        {pack !== null && pack <= max && <button type="button" className="btn sm" disabled={servings === pack || !!done} onClick={() => setServings(pack)}>Whole pack ({pack})</button>}
      </div>
      <p className="note">Per {unitWord(1, recipe)}: {entryText({ kcal: recipe.kcal!, p: recipe.p!, c: recipe.c, f: recipe.f })}</p>
      <label className="field" htmlFor="dt-portion-day">Day
        <input id="dt-portion-day" type="date" value={day} min={oldestDay(today)} max={today} disabled={!!done} onChange={e => { setDay(e.target.value); setErr(''); }} />
      </label>
      {err && <p className="note" role="alert">{err}</p>}
      {done && (
        <p className="note" role="status">{done.text} <button type="button" className="btn sm ghost" onClick={() => { useAppStore.getState().removeDietEntry(done.id, false); setDone(null); }}>Undo</button></p>
      )}
      <div className="actions">
        <button type="button" className="btn" onClick={closeModal}>{done ? 'Done' : 'Cancel'}</button>
        {!done && <button type="button" className="btn primary" onClick={log}>Log it</button>}
      </div>
    </Sheet>
  );
}
