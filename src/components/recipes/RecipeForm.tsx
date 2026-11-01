import { useMemo, useState } from 'react';
import { cleanGrams, cleanKcal, cleanProtein } from '../../shared/diet.js';
import { MAX_INGREDIENTS, MAX_RECIPE_NAME, MAX_TAG, MAX_TAGS_PER_RECIPE, MAX_SERVING_G, RECIPE_CATEGORIES, RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { ingredientsToText, readList } from '../../lib/ingredientList.js';
import { sameName, stepsFromText } from '../../lib/recipeList.js';
import { cleanTag, tagCounts, tagKey } from '../../lib/recipeTags.js';
import { rescale, servingsNote, typedAmount } from '../../lib/recipeScale.js';
import { pinFor, refreshLink, sauceCandidates, sauceFor, suggestIngredients } from '../../lib/recipeSuggest.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe, RecipeCategory, RecipeIngredient } from '../../types.ts';
import IngredientList from './IngredientList.js';
import IngredientMacros, { type PerServing } from './IngredientMacros.js';
import IngredientRows, { type Row } from './IngredientRows.js';
import ServingSize from './ServingSize.js';

const TOO_FEW = 'Type at least one ingredient first.';
const sameKey = (n: string, sub?: string) => `${n.trim().toLowerCase()}|${(sub ?? '').trim().toLowerCase()}`;

// The recipe form (ADR 084, laid out again in brief recipe-form-mobile-desktop): a new recipe, or one of yours to change. A new recipe starts at
// 1 serving. Ingredients are compact rows with an amount picker, or typed as a list; each can have an Alternative, and names are offered from your
// Groceries items as you type (choosing one pins it to that item). Steps are typed one per line. Nutrition per serving is folded away until opened.
export default function RecipeForm({ recipe, onDone }: { recipe?: Recipe; onDone: (savedId: string | null) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const items = useAppStore(s => s.grocery.items);
  const sauces = useMemo(() => sauceCandidates(recipes, recipe?.id), [recipes, recipe?.id]); // the sauces and seasonings a line can link to
  const [n, setN] = useState(recipe?.n ?? '');
  const [cat, setCat] = useState<RecipeCategory>(recipe?.cat ?? 'other');
  const [servings, setServings] = useState(recipe ? (recipe.servings ? String(recipe.servings) : '') : '1');
  const [minutes, setMinutes] = useState(recipe?.minutes ? String(recipe.minutes) : '');
  const [serving, setServing] = useState(recipe?.serving ?? '');
  const [servingG, setServingG] = useState(recipe?.servingG ? String(recipe.servingG) : '');
  const [kcal, setKcal] = useState(recipe?.kcal !== undefined ? String(recipe.kcal) : '');
  const [protein, setProtein] = useState(recipe?.p !== undefined ? String(recipe.p) : '');
  const [carbs, setCarbs] = useState(recipe?.c !== undefined ? String(recipe.c) : '');
  const [fat, setFat] = useState(recipe?.f !== undefined ? String(recipe.f) : '');
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? []);
  const [tagText, setTagText] = useState('');
  const [nutOpen, setNutOpen] = useState(false);
  const [ing, setIng] = useState<Row[]>(recipe?.ing.length ? recipe.ing.map(i => ({ ...refreshLink(i, recipes, recipe.id), amt: i.amt ?? '' })) : [{ n: '', amt: '' }]);
  const [lastServings, setLastServings] = useState<number | null>(recipe ? recipe.servings ?? null : 1); // the servings the amounts are for
  const [scaleNote, setScaleNote] = useState('');
  const [active, setActive] = useState<{ i: number; field: 'n' | 'sub' } | null>(null); // the ingredient or Alternative field being typed in: its suggestions are offered
  const [listMode, setListMode] = useState(false); // ingredients typed as a list; listBase is the text it opened with, so unedited text leaves the rows alone
  const [listText, setListText] = useState('');
  const [listBase, setListBase] = useState('');
  const [steps, setSteps] = useState(recipe?.steps.join('\n') ?? '');
  const [note, setNote] = useState(recipe?.note ?? '');
  const [err, setErr] = useState('');
  const [calc, setCalc] = useState(false); // the Calculate from ingredients panel is open
  const whole = (t: string) => (/^\d{1,4}$/.test(t.trim()) ? Number(t) : undefined);

  // The rows a typed list stands for. A line still exactly as an earlier row writes it keeps that row; a changed or new line is read again, and keeps
  // the pin and Skip of an earlier row with the same name and alternative. An amount typed in the list is what the servings shown are for.
  const read = listMode ? readList(listText, ing) : null;
  const listRows = (): { rows: Row[]; cut: boolean } | null => {
    if (!read || !read.lines.length) return null;
    const old = new Map(ing.map(i => [sameKey(i.n, i.sub), i]));
    return {
      cut: read.cut,
      rows: read.lines.map(l => {
        if ('old' in l) return l.old;
        const r = l.row, o = old.get(sameKey(r.n, r.sub)), home = o?.home ?? pinFor(r.n, r.sub, items), rid = o?.rid ?? sauceFor(r.n, sauces)?.id;
        return typedAmount<Row>({ n: r.n, amt: '', ...(r.sub ? { sub: r.sub } : {}), ...(home ? { home } : {}), ...(rid ? { rid } : {}), ...(o?.skip ? { skip: true as const } : {}) }, r.amt, lastServings);
      }),
    };
  };
  const listEdited = listMode && listText !== listBase;
  const showRows = (): string => {
    if (listEdited) {
      const r = listRows();
      if (!r) return TOO_FEW;
      setIng(r.rows); setScaleNote(r.cut ? `Only the first ${MAX_INGREDIENTS} ingredients were used.` : ''); setErr('');
    }
    setListMode(false);
    return '';
  };
  const showList = () => { const t = ingredientsToText(ing); setListText(t); setListBase(t); setListMode(true); setErr(''); };

  const inUse = useMemo(() => tagCounts(recipes).filter(c => !tags.some(t => tagKey(t) === tagKey(c.tag))), [recipes, tags]); // tags other recipes have that this one does not: offered
  const addTag = (raw: string) => {
    const t = cleanTag(raw);
    if (!t) return;
    if (tags.some(x => tagKey(x) === tagKey(t))) { setTagText(''); return; }
    if (tags.length >= MAX_TAGS_PER_RECIPE) { setErr(`A recipe can have up to ${MAX_TAGS_PER_RECIPE} tags.`); return; }
    const known = tagCounts(recipes).find(c => tagKey(c.tag) === tagKey(t))?.tag; // an existing tag keeps its spelling
    setTags([...tags, known ?? t]); setTagText(''); setErr('');
  };

  const tagsToSave = () => { const t = cleanTag(tagText); return t && !tags.some(x => tagKey(x) === tagKey(t)) ? [...tags, tagCounts(recipes).find(c => tagKey(c.tag) === tagKey(t))?.tag ?? t].slice(0, MAX_TAGS_PER_RECIPE) : tags; }; // a tag typed but not added yet is kept
  const save = () => {
    if (servings.trim() && !(whole(servings) && whole(servings)! <= 99)) { setErr('Servings must be a whole number from 1 to 99.'); return; }
    if (minutes.trim() && !(whole(minutes) && whole(minutes)! <= 1440)) { setErr('Minutes must be a whole number from 1 to 1440.'); return; }
    if (servingG.trim() && !(whole(servingG) && whole(servingG)! <= MAX_SERVING_G)) { setErr(`Grams per serving must be a whole number from 1 to ${MAX_SERVING_G}.`); return; }
    const k = kcal.trim() ? cleanKcal(Number(kcal)) : undefined, pr = protein.trim() ? cleanProtein(Number(protein)) : undefined;
    if (k === null) { setNutOpen(true); setErr('Calories per serving must be a number from 1 to 9,999.'); return; }
    if (pr === null) { setNutOpen(true); setErr('Protein per serving must be a number from 0 to 999 g.'); return; }
    const cb = carbs.trim() ? cleanGrams(Number(carbs)) : undefined, ft = fat.trim() ? cleanGrams(Number(fat)) : undefined;
    if (cb === null || ft === null) { setNutOpen(true); setErr('Carbs and fat per serving must be numbers from 0 to 999 g.'); return; }
    const fromList = listEdited ? listRows() : null;
    if (listEdited && !fromList) { setErr(TOO_FEW); return; }
    const source: RecipeIngredient[] = fromList ? fromList.rows : ing;
    const keep = source.filter(i => i.n.trim()).map(i => ({ n: i.n, ...(i.amt?.trim() ? { amt: i.amt } : {}), ...(i.home ? { home: i.home } : {}), ...(i.rid ? { rid: i.rid } : {}), ...(i.sub?.trim() ? { sub: i.sub } : {}), ...(i.skip ? { skip: true as const } : {}) }));
    const e = useAppStore.getState().saveRecipe({ ...(recipe ? { id: recipe.id } : {}), n, cat, ...(tagsToSave().length ? { tags: tagsToSave() } : {}), ing: keep, steps: stepsFromText(steps), servings: whole(servings), ...(serving.trim() ? { serving: serving.trim() } : {}), ...(servingG.trim() ? { servingG: whole(servingG) ?? undefined } : {}), minutes: whole(minutes), ...(k !== undefined ? { kcal: k } : {}), ...(pr !== undefined ? { p: pr } : {}), ...(cb !== undefined ? { c: cb } : {}), ...(ft !== undefined ? { f: ft } : {}), note, ...(recipe?.from ? { from: recipe.from } : {}) });
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
  const useNumbers = (per: PerServing) => {
    setKcal(String(per.kcal)); setProtein(String(per.p));
    if (per.c !== undefined) setCarbs(String(per.c));
    if (per.f !== undefined) setFat(String(per.f));
    setCalc(false); setErr('');
  };
  const anchorServings = () => { const v = whole(servings); if (lastServings === null && v && v <= 99) setLastServings(v); };
  const typeAmount = (i: number, amt: string) => { setIng(ing.map((x, j) => (j === i ? typedAmount(x, amt, lastServings) : x))); setErr(''); };
  const setRow = (i: number, patch: Partial<RecipeIngredient>) => { setIng(ing.map((x, j) => (j === i ? { ...x, ...patch } : x))); setErr(''); };
  // Renaming an ingredient drops its pin to an At home item (the pin was for the old name), unless the new name is exactly one of your
  // Groceries items. An ingredient with an Alternative is never pinned by its name, and changing the Alternative drops the pin: a pin outranks it in the match.
  // The same for the link to one of your sauces or seasonings: an exact name links it, any other name drops the link.
  const rename = (i: number, name: string) => setRow(i, { n: name, home: pinFor(name, ing[i]?.sub, items), rid: sauceFor(name, sauces)?.id });
  // The picker's choice: a linked row, filling the empty row the form starts with instead of leaving it above. Returns the row's index.
  const addSauce = (s: Recipe): number => {
    if (ing.length >= MAX_INGREDIENTS && ing[ing.length - 1]!.n.trim()) return -1; // full: the picker says so
    const last = ing[ing.length - 1], fill = !!last && !last.n.trim() && !last.amt.trim() && !last.sub, home = pinFor(s.n, undefined, items);
    const row: Row = { n: s.n, amt: '', rid: s.id, ...(home ? { home } : {}) };
    setIng(fill ? [...ing.slice(0, -1), row] : [...ing, row]); setErr('');
    return fill ? ing.length - 1 : ing.length;
  };
  const activeText = active === null ? '' : (active.field === 'sub' ? ing[active.i]?.sub : ing[active.i]?.n) ?? '';
  const options = useMemo(() => suggestIngredients(activeText, items, recipes.filter(r => r.id !== recipe?.id), sauces), [activeText, items, recipes, recipe?.id, sauces]);
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
          <fieldset className="rc-tags">
            <legend>Tags</legend>
            {tags.length > 0 && (
              <div className="rc-chips2">
                {tags.map(t => <button type="button" key={t} className="btn sm" onClick={() => setTags(tags.filter(x => x !== t))}>Remove {t}</button>)}
              </div>
            )}
            <div className="rc-tagadd">
              <input aria-label="New tag" placeholder="weeknight, meal prep…" value={tagText} maxLength={MAX_TAG} autoComplete="off"
                onChange={e => setTagText(e.target.value.replace(',', ''))}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagText); } }} />
              <button type="button" className="btn sm" disabled={!tagText.trim()} onClick={() => addTag(tagText)}>Add tag</button>
            </div>
            {inUse.length > 0 && (
              <div className="rc-chips2" role="group" aria-label="Tags you use">
                {inUse.map(c => <button type="button" key={c.tag} className="btn sm ghost" onClick={() => addTag(c.tag)}>Use {c.tag}</button>)}
              </div>
            )}
          </fieldset>
          <div className="rc-meta">
            <label>Category
              <select value={cat} onChange={e => setCat(e.target.value as RecipeCategory)}>
                {RECIPE_CATEGORIES.filter(c => c !== 'ready').map(c => <option key={c} value={c}>{RECIPE_CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <label>Servings<input inputMode="numeric" value={servings} onChange={e => changeServings(e.target.value)} onBlur={anchorServings} /></label>
            <label>Minutes<input inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
          </div>
          <ServingSize serving={serving} grams={servingG} ingredients={ing} servings={whole(servings) ?? 1} onServing={v => { setServing(v); setErr(''); }} onGrams={v => { setServingG(v); setErr(''); }} />
          <div className="rc-nut">
            <div className="rc-nuthead">
              <strong>Nutrition per serving</strong>
              <button type="button" className="btn sm" aria-expanded={nutOpen} aria-label={nutOpen ? 'Done with nutrition per serving' : 'Edit nutrition per serving'} onClick={() => setNutOpen(!nutOpen)}>{nutOpen ? 'Done' : 'Edit'}</button>
            </div>
            <p className="note">{nutLine}</p>
            <div className="rc-calcbar">
              <button type="button" className="btn sm" disabled={!ing.some(i => i.n.trim() && !i.skip)} aria-expanded={calc} onClick={() => setCalc(!calc)}>Calculate from ingredients</button>
              {!ing.some(i => i.n.trim() && !i.skip) && <span className="note"> Add ingredients first.</span>}
            </div>
            {calc && <IngredientMacros ingredients={ing} servings={servings} onClose={() => setCalc(false)} onUse={useNumbers} />}
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
              ? <IngredientList text={listText} onText={setListText} onUse={showRows} read={read!.lines.map(l => ('old' in l ? { n: l.old.n, amt: l.old.amt ?? '', ...(l.old.sub ? { sub: l.old.sub } : {}) } : l.row))} cut={read!.cut} />
              : <IngredientRows rows={ing} options={options} sauces={sauces} onActive={(i, field) => setActive({ i, field })} onRename={rename} onType={typeAmount} onSet={setRow}
                  onRemove={i => setIng(ing.length > 1 ? ing.filter((_, j) => j !== i) : [{ n: '', amt: '' }])} onAdd={() => setIng([...ing, { n: '', amt: '' }])} onAddSauce={addSauce} />}
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
