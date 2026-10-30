import { useState } from 'react';
import { entryText, hasMacros, servingNumbers } from '../../lib/dietLog.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe } from '../../types.ts';
import './Diet.css';

// "Ate this" on a recipe (ADR 086): logs the recipe's calories and protein per serving to today, as a snapshot. Only your own recipes with both numbers.
export default function AteThis({ recipe, mine, onEdit }: { recipe: Recipe; mine: boolean; onEdit: () => void }) {
  const [servings, setServings] = useState(1);
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);
  const [err, setErr] = useState('');
  if (!mine) return <p className="note">Add this recipe to Mine first, then add its calories and protein to log it.</p>;
  if (!hasMacros(recipe)) {
    return <div className="dt-ate"><p className="note">Add calories and protein per serving to log this recipe.</p><button type="button" className="btn sm" onClick={onEdit}>Add them</button></div>;
  }
  const nums = servingNumbers(recipe, servings);
  const log = () => {
    if (!nums) { setErr('Those numbers are out of range.'); return; }
    const r = useAppStore.getState().addDietEntry({ d: ymd(new Date()), n: recipe.n, kcal: nums.kcal, p: nums.p, ...(nums.c !== undefined ? { c: nums.c } : {}), ...(nums.f !== undefined ? { f: nums.f } : {}), from: recipe.id });
    if (r.error || !r.id) { setErr(r.error ?? 'Couldn’t log that.'); return; }
    setErr(''); setDone({ id: r.id, text: `Logged ${servings === 1 ? '1 portion' : `${servings} portions`} of ${recipe.n} to today.` });
  };
  return (
    <div>
      <p className="note">Per portion: {entryText({ kcal: recipe.kcal!, p: recipe.p!, c: recipe.c, f: recipe.f })}</p>
      <div className="dt-ate">
        <button type="button" className="btn sm" disabled={servings <= 0.5} onClick={() => setServings(s => Math.max(0.5, s - 0.5))}>Less</button>
        <span role="status">{servings} {servings === 1 ? 'portion' : 'portions'}</span>
        <button type="button" className="btn sm" disabled={servings >= 10} onClick={() => setServings(s => Math.min(10, s + 0.5))}>More</button>
        <button type="button" className="btn primary" onClick={log}>Ate this</button>
      </div>
      {err && <p className="note" role="alert">{err}</p>}
      {done && (
        <p className="note" role="status">{done.text} <button type="button" className="btn sm ghost" onClick={() => { useAppStore.getState().removeDietEntry(done.id, false); setDone(null); }}>Undo</button></p>
      )}
    </div>
  );
}
