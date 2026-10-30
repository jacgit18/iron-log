import { useMemo, useState } from 'react';
import { cleanGrams, cleanKcal, cleanProtein } from '../../shared/diet.js';
import { MAX_RECIPE_NAME, RECIPE_CATEGORIES, RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { ingredientsToText, parseIngredientList } from '../../lib/ingredientList.js';
import { sameName, stepsFromText } from '../../lib/recipeList.js';
import { rescale, servingsNote, typedAmount } from '../../lib/recipeScale.js';
import { pinFor, suggestIngredients } from '../../lib/recipeSuggest.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe, RecipeCategory, RecipeIngredient } from '../../types.ts';
import IngredientList from './IngredientList.js';
import IngredientRows, { type Row } from './IngredientRows.js';

const TOO_FEW = 'Type at least one ingredient first.';
const sameKey = (n: string, sub?: string) => `${n.trim().toLowerCase()}|${(sub ?? '').trim().toLowerCase()}`;

// The recipe form (ADR 084, laid out again in brief recipe-form-mobile-desktop): a new recipe, or one of yours to change. A new recipe starts at
// 1 serving. Ingredients are compact rows with an amount picker, or typed as a list; each can have an Alternative, and names are offered from your
// Groceries items as you type (choosing one pins it to that item). Steps are typed one per line. Nutrition per serving is folded away until opened.
export default function RecipeForm({ recipe, onDone }: { recipe?: Recipe; onDone: (savedId: string | null) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const items = useAppStore(s => s.grocery.items);
  const [n, setN] = useState(recipe?.n ?? '');
  const [cat, setCat] = useState<RecipeCategory>(recipe?.cat ?? 'other');
  const [servings, setServings] = useState(recipe ? (recipe.servings ? String(recipe.servings) : '') : '1');
  const [minutes, setMinutes] = useState(recipe?.minutes ? String(recipe.minutes) : '');
  const [kcal, setKcal] = useState(recipe?.kcal !== undefined ? String(recipe.kcal) : '');
  const [protein, setProtein] = useState(recipe?.p !== undefined ? String(recipe.p) : '');
  const [carbs, setCarbs] = useState(recipe?.c !== undefined ? String(recipe.c) : '');
  const [fat, setFat] = useState(recipe?.f !== undefined ? String(recipe.f) : '');
  const [nutOpen, setNutOpen] = useState(false);
  const [ing, setIng] = useState<Row[]>(recipe?.ing.length ? recipe.ing.map(i => ({ ...i, amt: i.amt ?? '' })) : [{ n: '', amt: '' }]);
  const [lastServings, setLastServings] = useState<number | null>(recipe ? recipe.servings ?? null : 1); // the servings the amounts are for
  const [scaleNote, setScaleNote] = useState('');
  const [active, setActive] = useState<number | null>(null); // the ingredient field being typed in: its suggestions are offered
  const [listMode, setListMode] = useState(false); // ingredients typed as a list; listBase is the text it opened with, so unedited text leaves the rows alone
  const [listText, setListText] = useState('');
  const [listBase, setListBase] = useState('');
  const [steps, setSteps] = useState(recipe?.steps.join('\n') ?? '');
  const [note, setNote] = useState(recipe?.note ?? '');
  const [err, setErr] = useState('');
  const whole = (t: string) => (/^\d{1,4}$/.test(t.trim()) ? Number(t) : undefined);

  // The rows a typed list stands for. A row keeps the pin and Skip of the earlier row with the same name and alternative; an amount typed in the list is
  // what the servings shown are for.
  const listRows = (): { rows: Row[]; cut: boolean } | null => {
    const { rows, cut } = parseIngredientList(listText);
    if (!rows.length) return null;
    const old = new Map(ing.map(i => [sameKey(i.n, i.sub), i]));
    return {
      cut,
      rows: rows.map(r => {
        const o = old.get(sameKey(r.n, r.sub)), home = o?.home ?? pinFor(r.n, r.sub, items);
        return typedAmount<Row>({ n: r.n, amt: '', ...(r.sub ? { sub: r.sub } : {}), ...(home ? { home } : {}), ...(o?.skip ? { skip: true as const } : {}) }, r.amt, lastServings);
      }),
    };
  };
  const listEdited = listMode && listText !== listBase;
  const showRows = (): string => {
    if (listEdited) {
      const r = listRows();
      if (!r) return TOO_FEW;
      setIng(r.rows); setScaleNote(r.cut ? 'Only the first 40 ingredients were used.' : ''); setErr('');
    }
    setListMode(false);
    return '';
  };
  const showList = () => { const t = ingredientsToText(ing); setListText(t); setListBase(t); setListMode(true); setErr(''); };

  const save = () => {
    if (servings.trim() && !(whole(servings) && whole(servings)! <= 99)) { setErr('Servings must be a whole number from 1 to 99.'); return; }
    if (minutes.trim() && !(whole(minutes) && whole(minutes)! <= 1440)) { setErr('Minutes must be a whole number from 1 to 1440.'); return; }
    const k = kcal.trim() ? cleanKcal(Number(kcal)) : undefined, pr = protein.trim() ? cleanProtein(Number(protein)) : undefined;
    if (k === null) { setNutOpen(true); setErr('Calories per serving must be a number from 1 to 9,999.'); return; }
    if (pr === null) { setNutOpen(true); setErr('Protein per serving must be a number from 0 to 999 g.'); return; }
    const cb = carbs.trim() ? cleanGrams(Number(carbs)) : undefined, ft = fat.trim() ? cleanGrams(Number(fat)) : undefined;
    if (cb === null || ft === null) { setNutOpen(true); setErr('Carbs and fat per serving must be numbers from 0 to 999 g.'); return; }
    const fromList = listEdited ? listRows() : null;
    if (listEdited && !fromList) { setErr(TOO_FEW); return; }
    const source: RecipeIngredient[] = fromList ? fromList.rows : ing;
    const keep = source.filter(i => i.n.trim()).map(i => ({ n: i.n, ...(i.amt?.trim() ? { amt: i.amt } : {}), ...(i.home ? { home: i.home } : {}), ...(i.sub?.trim() ? { sub: i.sub } : {}), ...(i.skip ? { skip: true as const } : {}) }));
    const e = useAppStore.getState().saveRecipe({ ...(recipe ? { id: recipe.id } : {}), n, cat, ing: keep, steps: stepsFromText(steps), servings: whole(servings), minutes: whole(minutes), ...(k !== undefined ? { kcal: k } : {}), ...(pr !== undefined ? { p: pr } : {}), ...(cb !== undefined ? { c: cb } : {}), ...(ft !== undefined ? { f: ft } : {}), note, ...(recipe?.from ? { from: recipe.from } : {}) });
    if (e) { setErr(e); return; }
    const list = useAppStore.getState().recipes;
    onDone(recipe?.id ?? list[list.length - 1]?.id ?? null); // a new recipe is the last one: open it
  };
  // Changing Servings to a valid number rewrites the amounts (they are saved with the recipe); a number is taken as the amounts' own when none was set.
  const changeServings = (t: string) => {
    setServings(t);
    const v = whole(t);
    if (!v || v > 99) return;
    setErr('');
    // With no earlier number the amounts are only taken as being for it. The anchor is fixed on blur, not here: typing "12" key by key would
    // otherwise anchor on "1" and then read the "2" as a scale-up by 12.
    if (lastServings === null) { setScaleNote(servingsNote(null, v, 0, ing.some(x => x.amt.trim()))); return; }
    const r = rescale(ing, lastServings, v);
    setIng(r.rows); setLastServings(v);
    setScaleNote(servingsNote(lastServings, v, r.left, ing.some(x => x.amt.trim())));
  };
  const anchorServings = () => { const v = whole(servings); if (lastServings === null && v && v <= 99) setLastServings(v); };
  const typeAmount = (i: number, amt: string) => { setIng(ing.map((x, j) => (j === i ? typedAmount(x, amt, lastServings) : x))); setErr(''); };
  const setRow = (i: number, patch: Partial<RecipeIngredient>) => { setIng(ing.map((x, j) => (j === i ? { ...x, ...patch } : x))); setErr(''); };
  // Renaming an ingredient drops its pin to an At home item (the pin was for the old name), unless the new name is exactly one of your
  // Groceries items. An ingredient with an Alternative is never pinned by its name, and changing the Alternative drops the pin: a pin outranks it in the match.
  const rename = (i: number, name: string) => setRow(i, { n: name, home: pinFor(name, ing[i]?.sub, items) });
  const activeText = active === null ? '' : ing[active]?.n ?? '';
  const options = useMemo(() => suggestIngredients(activeText, items, recipes.filter(r => r.id !== recipe?.id)).map(o => o.n), [activeText, items, recipes, recipe?.id]);
  const nutLine = [kcal.trim() && `${kcal.trim()} kcal`, protein.trim() && `${protein.trim()} g protein`, carbs.trim() && `${carbs.trim()} g carbs`, fat.trim() && `${fat.trim()} g fat`].filter(Boolean).join(' · ') || 'Not set';
  const sv = whole(servings);
  const servingsLine = sv && sv <= 99 ? `Amounts are for ${sv} serving${sv === 1 ? '' : 's'}.` : '';

  return (
    <form className="rc-form" onSubmit={e => { e.preventDefault(); save(); }} aria-label={recipe ? `Edit ${recipe.n}` : 'New recipe'}>
      <h3 tabIndex={-1}>{recipe ? 'Edit recipe' : 'New recipe'}</h3>
      <div className="rc-cols">
        <div className="rc-col">
          <label>Name
            <input value={n} maxLength={MAX_RECIPE_NAME} onChange={e => { setN(e.target.value); setErr(''); }} autoComplete="off" />
          </label>
          {n.trim() && sameName(recipes, n, recipe?.id) && <p className="note">You already have a recipe with this name. You can still save it.</p>}
          <div className="rc-meta">
            <label>Category
              <select value={cat} onChange={e => setCat(e.target.value as RecipeCategory)}>
                {RECIPE_CATEGORIES.map(c => <option key={c} value={c}>{RECIPE_CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <label>Servings<input inputMode="numeric" value={servings} onChange={e => changeServings(e.target.value)} onBlur={anchorServings} /></label>
            <label>Minutes<input inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
          </div>
          <div className="rc-nut">
            <div className="rc-nuthead">
              <strong>Nutrition per serving</strong>
              <button type="button" className="btn sm" aria-expanded={nutOpen} aria-label={nutOpen ? 'Done with nutrition per serving' : 'Edit nutrition per serving'} onClick={() => setNutOpen(!nutOpen)}>{nutOpen ? 'Done' : 'Edit'}</button>
            </div>
            <p className="note">{nutLine}</p>
            {nutOpen && (
              <div className="rc-nutfields">
                <label>Calories per serving<input inputMode="numeric" value={kcal} onChange={e => setKcal(e.target.value)} /></label>
                <label>Protein per serving (g)<input inputMode="decimal" value={protein} onChange={e => setProtein(e.target.value)} /></label>
                <label>Carbs per serving (g), optional<input inputMode="decimal" value={carbs} onChange={e => setCarbs(e.target.value)} /></label>
                <label>Fat per serving (g), optional<input inputMode="decimal" value={fat} onChange={e => setFat(e.target.value)} /></label>
              </div>
            )}
          </div>
        </div>
        <div className="rc-col">
          <fieldset className="rc-form rc-ings">
            <legend>Ingredients</legend>
            <div className="seg" role="group" aria-label="How to enter ingredients">
              <button type="button" className={listMode ? '' : 'on'} aria-pressed={!listMode} onClick={() => { const m = listMode ? showRows() : ''; if (m) setErr(m); }}>Rows</button>
              <button type="button" className={listMode ? 'on' : ''} aria-pressed={listMode} onClick={() => { if (!listMode) showList(); }}>Type a list</button>
            </div>
            <p className="note" role="status">{scaleNote || servingsLine}</p>
            {listMode
              ? <IngredientList text={listText} onText={setListText} onUse={showRows} />
              : <IngredientRows rows={ing} options={options} onActive={setActive} onRename={rename} onType={typeAmount} onSet={setRow}
                  onRemove={i => setIng(ing.length > 1 ? ing.filter((_, j) => j !== i) : [{ n: '', amt: '' }])} onAdd={() => setIng([...ing, { n: '', amt: '' }])} />}
          </fieldset>
          <label>Steps, one per line
            <textarea rows={5} value={steps} onChange={e => setSteps(e.target.value)} />
          </label>
          <label>Note
            <input value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
          </label>
        </div>
      </div>
      {err && <p className="note gerr" role="alert">{err}</p>}
      <div className="rc-actions rc-bar">
        <button type="submit" className="btn primary">Save recipe</button>
        <button type="button" className="btn ghost" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </form>
  );
}
