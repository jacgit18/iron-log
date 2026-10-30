import { useState } from 'react';
import { entriesOn, entryText } from '../../lib/dietLog.js';
import { MAX_MEAL_NAME } from '../../shared/diet.js';
import { useAppStore } from '../../store/useAppStore.js';
import './Diet.css';

// "Save as meal" (brief diet-saved-meals): tick the foods of the day that made up a meal, name it, save it. The same name replaces the old meal, which is how a meal is changed. The caller keys it by day.
export default function SaveMeal({ day, onSaved }: { day: string; onSaved: (text: string) => void }) {
  const diet = useAppStore(s => s.diet);
  const list = entriesOn(diet, day);
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const flip = (id: string) => { setErr(''); setTicked(t => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const close = () => { setOpen(false); setTicked(new Set()); setName(''); setErr(''); };
  const save = () => {
    const out = useAppStore.getState().saveDietMeal(name, list.filter(e => ticked.has(e.id)).map(e => e.id));
    if (out) { setErr(out); return; }
    onSaved(`Saved ${name.trim().slice(0, MAX_MEAL_NAME)}.`); close();
  };
  if (!open) {
    return (
      <div className="dt-copy">
        <button type="button" className="btn sm" disabled={list.length === 0} onClick={() => setOpen(true)}>Save as meal</button>
      </div>
    );
  }
  return (
    <fieldset className="dt-copy">
      <legend>Save as meal</legend>
      <ul className="dt-copylist">
        {list.map(e => (
          <li key={e.id}>
            <label className="dt-copyrow"><input type="checkbox" checked={ticked.has(e.id)} onChange={() => flip(e.id)} /><span>{e.n} · {entryText(e)}</span></label>
          </li>
        ))}
      </ul>
      <label className="field" htmlFor="dt-meal-n">Meal name
        <input id="dt-meal-n" value={name} maxLength={MAX_MEAL_NAME} autoComplete="off" onChange={e => { setName(e.target.value); setErr(''); }} />
      </label>
      {err && <p className="note" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn sm" onClick={close}>Cancel</button>
        <button type="button" className="btn sm primary" onClick={save}>Save meal</button>
      </div>
    </fieldset>
  );
}
