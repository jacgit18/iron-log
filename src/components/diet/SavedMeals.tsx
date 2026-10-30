import { useState } from 'react';
import { mealLine, planMeal } from '../../lib/dietMeals.js';
import { MAX_MEAL_NAME } from '../../shared/diet.js';
import { useAppStore } from '../../store/useAppStore.js';
import ArmedButton from '../ArmedButton.jsx';
import './Diet.css';

// Your saved meals in Quick add (brief diet-saved-meals): one tap logs each food of a meal as its own entry on the day shown. Manage renames or deletes (Undo comes from the Removed notice under the list).
// `full` is a day with no room left: the meals can still be managed, only logging one is off.
export default function SavedMeals({ day, full, onAdded }: { day: string; full: boolean; onAdded: (text: string) => void }) {
  const meals = useAppStore(s => s.cfg.diet?.meals) ?? [];
  const [managing, setManaging] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
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
  const rename = (id: string) => {
    const out = useAppStore.getState().renameDietMeal(id, text);
    if (out) { setErr(out); return; }
    setRenaming(null); setErr('');
  };
  return (
    <div className="dt-meals">
      <p className="note" id="dt-meals-h">Saved meals</p>
      <ul className="dt-recents" aria-labelledby="dt-meals-h">
        {meals.map(m => (
          <li key={m.id} className={managing ? 'dt-mealrow' : undefined}>
            {managing && renaming === m.id ? (
              <>
                <label className="field" htmlFor={`dt-mr-${m.id}`}>Meal name
                  <input id={`dt-mr-${m.id}`} value={text} maxLength={MAX_MEAL_NAME} autoComplete="off" onChange={e => { setText(e.target.value); setErr(''); }} />
                </label>
                <button type="button" className="btn sm" onClick={() => { setRenaming(null); setErr(''); }}>Cancel</button>
                <button type="button" className="btn sm primary" onClick={() => rename(m.id)}>Save name</button>
              </>
            ) : managing ? (
              <>
                <span className="dt-name">{mealLine(m)}</span>
                <button type="button" className="btn sm" aria-label={`Rename ${m.n}`} onClick={() => { setRenaming(m.id); setText(m.n); setErr(''); }}>Rename</button>
                <ArmedButton className="btn sm danger" label="Delete" armedLabel="Tap again to delete" aria-label={`Delete ${m.n}`} onConfirm={() => useAppStore.getState().removeDietMeal(m.id)} />
              </>
            ) : (
              <button type="button" className="btn sm" disabled={full} onClick={() => log(m.id)}>{mealLine(m)}</button>
            )}
          </li>
        ))}
      </ul>
      {err && <p className="note" role="alert">{err}</p>}
      <button type="button" className="btn sm ghost" aria-pressed={managing} onClick={() => { setManaging(v => !v); setRenaming(null); setErr(''); }}>{managing ? 'Done' : 'Manage'}</button>
    </div>
  );
}
