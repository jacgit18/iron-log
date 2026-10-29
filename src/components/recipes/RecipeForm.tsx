import { useMemo, useState } from 'react';
import { MAX_INGREDIENTS, MAX_RECIPE_NAME, RECIPE_CATEGORIES, RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { sameName, stepsFromText } from '../../lib/recipeList.js';
import { rescale, servingsNote, typedAmount, type ScaleRow } from '../../lib/recipeScale.js';
import { pinFor, suggestIngredients } from '../../lib/recipeSuggest.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe, RecipeCategory, RecipeIngredient } from '../../types.ts';

// A form row: the ingredient, plus what its amount is scaled from (the Servings field rewrites amounts; see src/lib/recipeScale.ts).
type Row = RecipeIngredient & ScaleRow;

// The recipe form (ADR 084): a new recipe, or one of yours to change. Steps are typed one per line. Each ingredient can be swapped for what you
// use instead or skipped, and offers names from your Groceries items as you type (choosing one pins it to that item).
export default function RecipeForm({ recipe, onDone }: { recipe?: Recipe; onDone: (savedId: string | null) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const items = useAppStore(s => s.grocery.items);
  const [n, setN] = useState(recipe?.n ?? '');
  const [cat, setCat] = useState<RecipeCategory>(recipe?.cat ?? 'other');
  const [servings, setServings] = useState(recipe?.servings ? String(recipe.servings) : '');
  const [minutes, setMinutes] = useState(recipe?.minutes ? String(recipe.minutes) : '');
  const [ing, setIng] = useState<Row[]>(recipe?.ing.length ? recipe.ing.map(i => ({ ...i, amt: i.amt ?? '' })) : [{ n: '', amt: '' }]);
  const [lastServings, setLastServings] = useState<number | null>(recipe?.servings ?? null); // the servings the amounts are for
  const [scaleNote, setScaleNote] = useState('');
  const [active, setActive] = useState<number | null>(null); // the ingredient field being typed in: its suggestions are offered
  const [steps, setSteps] = useState(recipe?.steps.join('\n') ?? '');
  const [note, setNote] = useState(recipe?.note ?? '');
  const [err, setErr] = useState('');
  const whole = (t: string) => (/^\d{1,4}$/.test(t.trim()) ? Number(t) : undefined);

  const save = () => {
    if (servings.trim() && !(whole(servings) && whole(servings)! <= 99)) { setErr('Servings must be a whole number from 1 to 99.'); return; }
    if (minutes.trim() && !(whole(minutes) && whole(minutes)! <= 1440)) { setErr('Minutes must be a whole number from 1 to 1440.'); return; }
    const keep = ing.filter(i => i.n.trim()).map(i => ({ n: i.n, ...(i.amt?.trim() ? { amt: i.amt } : {}), ...(i.home ? { home: i.home } : {}), ...(i.sub?.trim() ? { sub: i.sub } : {}), ...(i.skip ? { skip: true as const } : {}) }));
    const e = useAppStore.getState().saveRecipe({ ...(recipe ? { id: recipe.id } : {}), n, cat, ing: keep, steps: stepsFromText(steps), servings: whole(servings), minutes: whole(minutes), note, ...(recipe?.from ? { from: recipe.from } : {}) });
    if (e) { setErr(e); return; }
    const list = useAppStore.getState().recipes;
    onDone(recipe?.id ?? list[list.length - 1]?.id ?? null); // a new recipe is the last one: open it
  };
  // Changing Servings to a valid number rewrites the amounts (they are saved with the recipe); a number is taken as the amounts' own when none was set.
  const changeServings = (t: string) => {
    setServings(t);
    const v = whole(t);
    if (!v || v > 99) return;
    const r = rescale(ing, lastServings, v);
    setIng(r.rows); setLastServings(v); setErr('');
    setScaleNote(servingsNote(lastServings, v, r.left, ing.some(x => x.amt.trim())));
  };
  const typeAmount = (i: number, amt: string) => { setIng(ing.map((x, j) => (j === i ? typedAmount(x, amt, lastServings) : x))); setErr(''); };
  const setRow = (i: number, patch: Partial<RecipeIngredient>) => { setIng(ing.map((x, j) => (j === i ? { ...x, ...patch } : x))); setErr(''); };
  // Renaming an ingredient drops its pin to an At home item (the pin was for the old name), unless the new name is exactly one of your
  // Groceries items. A swapped ingredient is never pinned by its name, and changing a swap drops the pin: a pin outranks the swap in the match.
  const rename = (i: number, name: string) => setRow(i, { n: name, home: pinFor(name, ing[i]?.sub, items) });
  const activeText = active === null ? '' : ing[active]?.n ?? '';
  const options = useMemo(() => suggestIngredients(activeText, items, recipes.filter(r => r.id !== recipe?.id)), [activeText, items, recipes, recipe?.id]);

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
        <label>Servings<input inputMode="numeric" value={servings} onChange={e => changeServings(e.target.value)} /></label>
        <label>Minutes<input inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
        <span />
      </div>
      <fieldset className="rc-form">
        <legend>Ingredients</legend>
        <p className="note" role="status">{scaleNote}</p>
        <datalist id="rc-suggest">{options.map(o => <option key={o.n} value={o.n} />)}</datalist>
        {ing.map((x, i) => (
          <div className="rc-ingblock" key={i}>
            <div className="rc-ingrow">
              <label>Ingredient {i + 1}<input value={x.n} list="rc-suggest" onFocus={() => setActive(i)} onChange={e => { setActive(i); rename(i, e.target.value); }} autoComplete="off" /></label>
              <label>Amount<input value={x.amt} onChange={e => typeAmount(i, e.target.value)} placeholder="2 cups" autoComplete="off" /></label>
              <button type="button" className="btn sm ghost" aria-label={`Remove ingredient ${i + 1}`} onClick={() => setIng(ing.length > 1 ? ing.filter((_, j) => j !== i) : [{ n: '', amt: '' }])}>Remove</button>
            </div>
            <div className="rc-ingrow rc-ingopts">
              <label>Swap<input aria-label={`Swap ingredient ${i + 1}`} value={x.sub ?? ''} maxLength={MAX_RECIPE_NAME} onChange={e => setRow(i, { sub: e.target.value, home: undefined })} placeholder="what you use instead" autoComplete="off" /></label>
              <label className="rc-skip"><input type="checkbox" aria-label={`Skip ingredient ${i + 1}`} checked={!!x.skip} onChange={e => setRow(i, { skip: e.target.checked ? true : undefined })} />Skip</label>
            </div>
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
