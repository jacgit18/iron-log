import { useState } from 'react';
import { MAX_INGREDIENTS, MAX_RECIPE_NAME, RECIPE_CATEGORIES, RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { sameName, stepsFromText } from '../../lib/recipeList.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe, RecipeCategory } from '../../types.ts';

// The recipe form (ADR 084): a new recipe, or one of yours to change. Steps are typed one per line.
export default function RecipeForm({ recipe, onDone }: { recipe?: Recipe; onDone: (savedId: string | null) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const [n, setN] = useState(recipe?.n ?? '');
  const [cat, setCat] = useState<RecipeCategory>(recipe?.cat ?? 'other');
  const [servings, setServings] = useState(recipe?.servings ? String(recipe.servings) : '');
  const [minutes, setMinutes] = useState(recipe?.minutes ? String(recipe.minutes) : '');
  const [ing, setIng] = useState(recipe?.ing.length ? recipe.ing.map(i => ({ ...i })) : [{ n: '', amt: '' }]);
  const [steps, setSteps] = useState(recipe?.steps.join('\n') ?? '');
  const [note, setNote] = useState(recipe?.note ?? '');
  const [err, setErr] = useState('');
  const whole = (t: string) => (/^\d{1,4}$/.test(t.trim()) ? Number(t) : undefined);

  const save = () => {
    if (servings.trim() && !(whole(servings) && whole(servings)! <= 99)) { setErr('Servings must be a whole number from 1 to 99.'); return; }
    if (minutes.trim() && !(whole(minutes) && whole(minutes)! <= 1440)) { setErr('Minutes must be a whole number from 1 to 1440.'); return; }
    const keep = ing.filter(i => i.n.trim()).map(i => ({ n: i.n, ...(i.amt?.trim() ? { amt: i.amt } : {}), ...(i.home ? { home: i.home } : {}) }));
    const e = useAppStore.getState().saveRecipe({ ...(recipe ? { id: recipe.id } : {}), n, cat, ing: keep, steps: stepsFromText(steps), servings: whole(servings), minutes: whole(minutes), note, ...(recipe?.from ? { from: recipe.from } : {}) });
    if (e) { setErr(e); return; }
    const list = useAppStore.getState().recipes;
    onDone(recipe?.id ?? list[list.length - 1]?.id ?? null); // a new recipe is the last one: open it
  };
  // Renaming an ingredient drops its pin to an At home item: the pin was for the old name.
  const setRow = (i: number, patch: Partial<{ n: string; amt: string }>) => { setIng(ing.map((x, j) => (j === i ? { ...x, ...patch, ...(patch.n !== undefined ? { home: undefined } : {}) } : x))); setErr(''); };

  return (
    <form className="rc-form" onSubmit={e => { e.preventDefault(); save(); }} aria-label={recipe ? `Edit ${recipe.n}` : 'New recipe'}>
      <h3 tabIndex={-1}>{recipe ? 'Edit recipe' : 'New recipe'}</h3>
      <label>Name
        <input value={n} maxLength={MAX_RECIPE_NAME} onChange={e => { setN(e.target.value); setErr(''); }} autoComplete="off" />
      </label>
      {n.trim() && sameName(recipes, n, recipe?.id) && <p className="note">You already have a recipe with this name. You can still save it.</p>}
      <label>Category
        <select value={cat} onChange={e => setCat(e.target.value as RecipeCategory)}>
          {RECIPE_CATEGORIES.map(c => <option key={c} value={c}>{RECIPE_CATEGORY_LABEL[c]}</option>)}
        </select>
      </label>
      <div className="rc-ingrow">
        <label>Servings<input inputMode="numeric" value={servings} onChange={e => setServings(e.target.value)} /></label>
        <label>Minutes<input inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
        <span />
      </div>
      <fieldset className="rc-form">
        <legend>Ingredients</legend>
        {ing.map((x, i) => (
          <div className="rc-ingrow" key={i}>
            <label>Ingredient {i + 1}<input value={x.n} onChange={e => setRow(i, { n: e.target.value })} autoComplete="off" /></label>
            <label>Amount<input value={x.amt ?? ''} onChange={e => setRow(i, { amt: e.target.value })} placeholder="2 cups" autoComplete="off" /></label>
            <button type="button" className="btn sm ghost" aria-label={`Remove ingredient ${i + 1}`} onClick={() => setIng(ing.length > 1 ? ing.filter((_, j) => j !== i) : [{ n: '', amt: '' }])}>Remove</button>
          </div>
        ))}
        <button type="button" className="btn sm" disabled={ing.length >= MAX_INGREDIENTS} onClick={() => setIng([...ing, { n: '', amt: '' }])}>Add ingredient</button>
      </fieldset>
      <label>Steps, one per line
        <textarea rows={5} value={steps} onChange={e => setSteps(e.target.value)} />
      </label>
      <label>Note
        <input value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
      </label>
      {err && <p className="note gerr" role="alert">{err}</p>}
      <div className="rc-actions">
        <button type="submit" className="btn primary">Save recipe</button>
        <button type="button" className="btn ghost" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}
