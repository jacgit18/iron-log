import { useEffect, useMemo, useRef, useState } from 'react';
import ArmedButton from '../ArmedButton.jsx';
import WatchLink from '../WatchLink.jsx';
import Icon from '../Icon.js';
import { hasMacros, packServings } from '../../lib/dietLog.js';
import { NO_NUTRITION } from '../../lib/recipeNutrition.js';
import { amountText } from '../../lib/foodUnit.js';
import { monthKey, withoutUsed } from '../../lib/grocery.js';
import { countedNote, hasParts, mealRollup } from '../../lib/mealRollup.js';
import { addMissingMessage, ingredientName, missingParts, onToGet, pantryStatus, rankItems, suggestionPins } from '../../lib/recipePantry.js';
import { macroLine } from '../../lib/macroLine.js';
import { attribution } from '../../lib/recipeDraft.js';
import { recipeMeta } from '../../lib/recipeList.js';
import { servingLine } from '../../lib/recipeServing.js';
import { scaleAmount } from '../../lib/recipeScale.js';
import { linkedRecipe } from '../../lib/recipeSuggest.js';
import { RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { useAppStore } from '../../store/useAppStore.js';
import LogControl from '../diet/LogControl.js';
import GoesWith from './GoesWith.js';
import RecipeStar from './RecipeStar.js';
import ServingsScaler from './ServingsScaler.js';
import './RecipeDesktop.css';
import './RecipeDetail.css';
import type { Recipe } from '../../types.ts';

// One recipe (ADR 084): its ingredients checked against At home, the steps, and what you can do with it. `mine`: one of yours; otherwise it
// is a library recipe (a copy, not yet in your list) and "Add to Mine" copies it.
export default function RecipeDetail({ recipe, mine, onBack, onEdit, onAdd, onOpen }: { recipe: Recipe; mine: boolean; onBack: () => void; onEdit: () => void; onAdd: (servings?: number) => void; onOpen?: (id: string) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const groceryAll = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const grocery = useMemo(() => withoutUsed(groceryAll, months), [groceryAll, months]); // a used one-time item is no longer something you have
  const [msg, setMsg] = useState('');
  const [scaling, setScaling] = useState(false); // the servings stepper is hidden until "Scale the amounts" is tapped
  const [tonight, setTonight] = useState<number | null>(null); // servings for tonight; the amounts shown scale to it, nothing is saved
  const shown = recipe.servings ? tonight ?? recipe.servings : null;
  const month = monthKey(new Date());
  const status = useMemo(() => pantryStatus(recipe, grocery, months[month] ?? { lines: {}, pulled: [] }, recipes), [recipe, grocery, months, month, recipes]);
  const credit = attribution(recipe, mine);
  const roll = useMemo(() => (hasParts(recipe) ? mealRollup(recipe, recipes) : null), [recipe, recipes]); // a meal built from linked foods: what its parts add up to
  const rollText = roll && roll.counted > 0 ? macroLine(roll.per) : '';
  const macros = macroLine(recipe);
  const scaled = !!recipe.servings && tonight !== null && tonight !== recipe.servings; // a scaled recipe keeps its stepper in view, so the amounts never look like the written ones
  const missing = missingParts(status);
  const toAdd = missing.add.length;
  const maybes = mine ? suggestionPins(status).length : 0;
  const addMissing = () => setMsg(addMissingMessage(useAppStore.getState().addMissingToGrocery(recipe.id, month)));
  if (recipe.cat === 'ready') { // bought or frozen: no ingredients, steps or scaling, only its numbers and the log control
    return (
      <section className="panel rc-detail" aria-labelledby="rc-h">
        <BackBar onBack={onBack} />
        <div className="rc-titlerow"><h2 id="rc-h" tabIndex={-1}>{recipe.n}<span className="pill custom">Food</span></h2><RecipeStar recipe={recipe} mine={mine} />{mine && <MoreActions recipe={recipe} noun="food" onEdit={onEdit} onBack={onBack} />}</div>
        <LogArea recipe={recipe} mine={mine} onEdit={onEdit} />
        {packServings(recipe) !== null && <p className="note">{recipe.servings} servings per pack</p>}
        {recipe.usual !== undefined && <p className="note">Usual: {amountText(recipe.usual, recipe)}</p>}
        {recipe.note && <p className="note">{recipe.note}</p>}
        <GoesWith recipe={recipe} mine={mine} {...(onOpen ? { onOpen } : {})} />
      </section>
    );
  }
  return (
    <section className="panel rc-detail" aria-labelledby="rc-h">
      <BackBar onBack={onBack} />
      <div className="rc-titlerow"><h2 id="rc-h" tabIndex={-1}>{recipe.n}{recipe.from || !mine ? <span className="pill custom" title="From the recipe library; what you change on it stays yours">Library</span> : <span className="pill custom" title="You created this recipe">Custom</span>}{recipe.edited && <span className="rc-edited" title="You changed this recipe from the library version">Edited</span>}</h2><RecipeStar recipe={recipe} mine={mine} />{mine && <MoreActions recipe={recipe} noun="recipe" onEdit={onEdit} onBack={onBack} />}</div>
      <p className="note">{recipeMeta(RECIPE_CATEGORY_LABEL[recipe.cat], recipe.servings, recipe.minutes)}</p>
      {!roll && macros && <p className="note rc-macros">{macros} per serving</p>}
      {recipe.url && <div className="note"><WatchLink url={recipe.url} name={recipe.n} size="large" /></div>}
      {servingLine(recipe.serving, recipe.servingG) && <p className="note">Serving size: {servingLine(recipe.serving, recipe.servingG)}</p>}
      <LogArea recipe={recipe} mine={mine} onEdit={onEdit} />
      {roll && <p className="note rc-rolled">{recipe.own ? `Your own numbers are used.${rollText ? ` The parts add up to ${rollText}.` : ' The parts need numbers.'}` : `Per serving, from the parts: ${rollText || 'Needs numbers'}.`} {countedNote(roll)}.</p>}
      <div className="rc-cols">{/* from 1024 px on the full page: ingredients beside the steps (RecipeDesktop.css); the pane and a phone keep one column */}
      <div className="rc-col">
      <h3 className="rc-ingh">Ingredients{status.total > 0 && <span className="rc-have"> {status.have} of {status.total} at home</span>}{recipe.servings && shown && <button type="button" className="rc-scalelink" aria-expanded={scaling || scaled} onClick={() => setScaling(o => !o)}>Scale the amounts</button>}</h3>
      {(scaling || scaled) && recipe.servings && shown && <ServingsScaler base={recipe.servings} value={shown} onChange={setTonight} />}
      {grocery.items.length === 0 && <p className="note">Add items under Groceries, Inventory to see what you have.</p>}
      {maybes > 0 && <div className="rc-actions"><button type="button" className="btn sm" onClick={() => useAppStore.getState().acceptSuggestions(recipe.id, month)}>Accept all suggestions</button></div>}
      <ul className="rc-ings">
        {status.lines.map((l, i) => (
          <li className="rc-ing" key={i}>
            <span className="rc-namecell">
            <span className={l.skipped ? 'rc-skipped' : undefined}>{l.ing.amt ? `${recipe.servings && shown ? scaleAmount(l.ing.amt, shown / recipe.servings).text : l.ing.amt} ` : l.ing.q !== undefined && l.ing.rid ? `${amountText(recipe.servings && shown ? Math.round(l.ing.q * shown / recipe.servings * 100) / 100 : l.ing.q, recipes.find(r => r.id === l.ing.rid))} ` : ''}{(() => { const s = mine && onOpen ? linkedRecipe(l.ing, recipes, recipe.id) : undefined; return s ? <button type="button" className="rc-link" aria-label={`Open ${s.n}, ${s.cat === 'seasonings' ? 'seasoning' : s.cat === 'sauces' ? 'sauce' : s.cat === 'ready' ? 'food' : 'meal'}`} onClick={() => onOpen!(s.id)}>{s.n}</button> : ingredientName(l.ing); })()}{l.ing.sub && <span className="rc-instead"> (or {l.ing.sub})</span>}</span>
            <span className="rc-states">
              <span className={`rc-state ${l.skipped ? 'skip' : l.have ? 'have' : l.partial ? 'part' : 'miss'}`}>{l.skipped ? 'Skipped' : l.have ? 'Have' : l.partial ? 'Have some' : 'Missing'}</span>
              {onToGet(l) && <span className="rc-state onlist">On your list</span>}
            </span>
            </span>
            <span className="rc-pick">
            {mine && l.suggest && <button type="button" className="btn sm" aria-label={`Maybe: ${l.suggest.n} for ${ingredientName(l.ing)}`} onClick={() => useAppStore.getState().linkIngredient(recipe.id, i, l.suggest!.id)}>Maybe: {l.suggest.n}</button>}
            {mine && !l.skipped && !l.always && grocery.items.length > 0 && (
              <select aria-label={`Inventory item for ${ingredientName(l.ing)}`} value={l.ing.home ?? ''} onChange={e => useAppStore.getState().linkIngredient(recipe.id, i, e.target.value || null)}>
                <option value="">{l.item ? `Matched: ${l.item.n}` : 'No match'}</option>
                {rankItems(l.ing, grocery.items).map(it => <option key={it.id} value={it.id}>{it.n}</option>)}
              </select>
            )}
            {l.always && !l.skipped && <span className="note">Always at home</span>}
            </span>
          </li>
        ))}
      </ul>
      {mine && (
        <div className="rc-actions">
          <button type="button" className="btn" disabled={status.total === 0} onClick={addMissing}>{toAdd ? `Add ${toAdd} missing to Shopping` : 'Add missing to Shopping'}</button>
        </div>
      )}
      <p className="note" role="status">{msg}</p>
      </div>
      {recipe.steps.length > 0 && (<div className="rc-col"><h3>Steps</h3><ol className="rc-steps">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>)}
      </div>
      {recipe.note && <p className="note">{recipe.note}</p>}
      {credit && <p className="rc-attrib">{credit}</p>}
      <GoesWith recipe={recipe} mine={mine} {...(onOpen ? { onOpen } : {})} />
      {!mine && <LogBar><button type="button" className="btn primary" onClick={() => onAdd(shown ?? undefined)}>Add to Mine</button></LogBar>}
    </section>
  );
}

// The one log-or-plan control (brief log-or-plan-control), or the note that says why there is none: not in Mine yet, or no calories and protein to log.
const LogArea = ({ recipe, mine, onEdit }: { recipe: Recipe; mine: boolean; onEdit: () => void }) => {
  if (!mine) return <p className="note">{recipe.kcal === undefined && recipe.p === undefined ? NO_NUTRITION : 'Add this recipe to Mine first, then log it.'}</p>;
  if (!hasMacros(recipe)) return <div className="rc-actions"><p className="note">Add calories and protein per serving to log this recipe.</p><button type="button" className="btn sm" onClick={onEdit}>Add them</button></div>;
  return <LogBar><LogControl recipe={recipe} /></LogBar>; // fixed above the tab bar on a phone, under the title from 700 px (RecipeDetail.css)
};

// The bar's own height goes to the page as `--rc-bar-h`, so the page keeps exactly that much room under its last line while the bar is fixed.
const LogBar = ({ children }: { children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = ref.current, page = bar?.parentElement;
    if (!bar || !page) return;
    const set = () => page.style.setProperty('--rc-bar-h', `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  return <div className="rc-logbar" ref={ref}>{children}</div>;
};

// Shared by a recipe's page and a ready-made food's page, so a change to the back bar or to More actions (Edit and Delete) reaches both.
const BackBar = ({ onBack }: { onBack: () => void }) => <div className="rc-head"><button type="button" className="btn sm ghost" onClick={onBack}>Back to recipes</button></div>;
const MoreActions = ({ recipe, noun, onEdit, onBack }: { recipe: Recipe; noun: 'recipe' | 'food'; onEdit: () => void; onBack: () => void }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { // Escape or a tap outside closes the list
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('pointerdown', away);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', away); };
  }, [open]);
  return (
    <div className="rc-more" ref={box}>
      <button type="button" className="btn sm ghost" aria-label="More actions" aria-expanded={open} onClick={() => setOpen(o => !o)}><Icon name="dots" /></button>
      {open && (
        <div className="rc-morelist" role="group" aria-label="Recipe actions">
          <button type="button" className="btn" onClick={onEdit}>Edit</button>
          <ArmedButton className="btn danger" label="Delete" armedLabel="Tap again to delete" aria-label={`Delete the ${noun} ${recipe.n}`} onConfirm={() => { useAppStore.getState().removeRecipe(recipe.id); onBack(); }} />
        </div>
      )}
    </div>
  );
};
