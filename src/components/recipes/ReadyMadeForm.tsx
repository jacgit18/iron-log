import { useState } from 'react';
import { readyMadeValues } from '../../lib/readyMade.js';
import { MAX_RECIPE_NAME } from '../../shared/recipes.js';
import { useAppStore } from '../../store/useAppStore.js';
import FoodSearch, { type FoodFill } from '../diet/FoodSearch.js';
import type { Recipe } from '../../types.ts';

const str = (n: number | undefined) => (n !== undefined ? String(n) : '');

// A ready-made food (brief recipe-first-diet-log): something bought or frozen that you only heat up. It is a recipe in the Ready-made category with
// no ingredients or steps, so it is listed, searched, logged with Ate this and planned like any recipe. Numbers are per serving, typed from the
// label or filled from the food lookup (still editable).
export default function ReadyMadeForm({ recipe, onDone }: { recipe?: Recipe; onDone: (savedId: string | null) => void }) {
  const [n, setN] = useState(recipe?.n ?? '');
  const [kcal, setKcal] = useState(str(recipe?.kcal));
  const [protein, setProtein] = useState(str(recipe?.p));
  const [carbs, setCarbs] = useState(str(recipe?.c));
  const [fat, setFat] = useState(str(recipe?.f));
  const [note, setNote] = useState(recipe?.note ?? '');
  const [err, setErr] = useState('');
  const fillFrom = (f: FoodFill) => {
    if (!n.trim()) setN(f.n);
    setKcal(String(f.kcal)); setProtein(String(f.p)); setCarbs(str(f.c)); setFat(str(f.f)); setErr('');
  };
  const save = () => {
    const v = readyMadeValues({ n, kcal, p: protein, c: carbs, f: fat });
    if ('error' in v) { setErr(v.error); return; }
    const e = useAppStore.getState().saveRecipe({ ...(recipe ? { id: recipe.id } : {}), n, cat: 'ready', ing: [], steps: [], ...v, note });
    if (e) { setErr(e); return; }
    const list = useAppStore.getState().recipes;
    onDone(recipe?.id ?? list[list.length - 1]?.id ?? null);
  };
  return (
    <form className="rc-form" onSubmit={e => { e.preventDefault(); save(); }} aria-label={recipe ? `Edit ${recipe.n}` : 'New ready-made food'}>
      <h3 tabIndex={-1}>{recipe ? 'Edit ready-made food' : 'New ready-made food'}</h3>
      <div onKeyDown={e => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault(); }}>{/* Enter in the lookup box searches, it does not save the form */}
        <FoodSearch onUse={fillFrom} />
      </div>
      <label>Name
        <input value={n} maxLength={MAX_RECIPE_NAME} onChange={e => { setN(e.target.value); setErr(''); }} autoComplete="off" />
      </label>
      <div className="rc-nutfields">
        <label>Calories per serving<input inputMode="numeric" value={kcal} onChange={e => { setKcal(e.target.value); setErr(''); }} /></label>
        <label>Protein per serving (g)<input inputMode="decimal" value={protein} onChange={e => { setProtein(e.target.value); setErr(''); }} /></label>
        <label>Carbs per serving (g), optional<input inputMode="decimal" value={carbs} onChange={e => { setCarbs(e.target.value); setErr(''); }} /></label>
        <label>Fat per serving (g), optional<input inputMode="decimal" value={fat} onChange={e => { setFat(e.target.value); setErr(''); }} /></label>
      </div>
      <label>Note
        <input value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
      </label>
      {err && <p className="note gerr" role="alert">{err}</p>}
      <div className="rc-actions rc-bar">
        <button type="submit" className="btn primary">Save food</button>
        <button type="button" className="btn ghost" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}
