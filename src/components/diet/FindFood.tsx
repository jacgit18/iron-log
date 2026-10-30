import { useState } from 'react';
import { entryText } from '../../lib/dietLog.js';
import { findFoods, scaleFood, type Food } from '../../lib/foodMacros.js';
import { useAppStore } from '../../store/useAppStore.js';
import './Diet.css';

// "Find a food" (brief diet-auto-macros): type a name, see what you logged before and your own recipes with their numbers, pick one, set a portion, add it. Nothing is stored for this; it reads the log and the recipes.
export default function FindFood({ day, onAdded }: { day: string; onAdded: (text: string) => void }) {
  const diet = useAppStore(s => s.diet);
  const recipes = useAppStore(s => s.recipes);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const [portion, setPortion] = useState(1);
  const [err, setErr] = useState('');
  const found = picked ? [] : findFoods(diet, recipes, q);
  const nums = picked ? scaleFood(picked, portion) : null;
  const add = () => {
    if (!nums) { setErr('Those numbers are out of range.'); return; }
    const r = useAppStore.getState().addDietEntry({ d: day, n: nums.n, kcal: nums.kcal, p: nums.p, ...(nums.c !== undefined ? { c: nums.c } : {}), ...(nums.f !== undefined ? { f: nums.f } : {}), ...(nums.from ? { from: nums.from } : {}) });
    if (r.error) { setErr(r.error); return; }
    setErr(''); onAdded(`Added ${portion === 1 ? '1 portion' : `${portion} portions`} of ${nums.n}.`); setPicked(null); setQ(''); setPortion(1);
  };
  return (
    <div className="dt-find">
      <label className="field" htmlFor="dt-find-q">Search your past meals and recipes
        <input id="dt-find-q" type="search" value={q} maxLength={80} autoComplete="off" onChange={e => { setQ(e.target.value); setPicked(null); setErr(''); }} />
      </label>
      {found.length > 0 && (
        <ul className="dt-recents" aria-label="Matches">
          {found.map(f => <li key={f.n}><button type="button" className="btn sm" onClick={() => { setPicked(f); setPortion(1); }}>{f.n}{f.from ? ' (recipe)' : ''} · {entryText(f)}</button></li>)}
        </ul>
      )}
      {q.trim() !== '' && !picked && found.length === 0 && <p className="note">No match. Add it below and it shows up here next time.</p>}
      {picked && (
        <div>
          <p className="note">{picked.n}: {nums ? entryText(nums) : 'out of range'}</p>
          <div className="dt-ate">
            <button type="button" className="btn sm" disabled={portion <= 0.5} onClick={() => setPortion(s => Math.max(0.5, s - 0.5))}>Less</button>
            <span role="status">{portion} {portion === 1 ? 'portion' : 'portions'}</span>
            <button type="button" className="btn sm" disabled={portion >= 10} onClick={() => setPortion(s => Math.min(10, s + 0.5))}>More</button>
            <button type="button" className="btn primary" onClick={add}>Add</button>
            <button type="button" className="btn sm" onClick={() => setPicked(null)}>Cancel</button>
          </div>
        </div>
      )}
      {err && <p className="note" role="alert">{err}</p>}
    </div>
  );
}
