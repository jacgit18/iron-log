import { useMemo, useState } from 'react';
import ArmedButton from '../ArmedButton.jsx';
import Icon from '../Icon.js';
import { videoLabel } from '../../lib/data.js';
import { monthKey } from '../../lib/grocery.js';
import { addMissingMessage, ingredientName, missingParts, pantryStatus, rankItems, suggestionPins } from '../../lib/recipePantry.js';
import { attribution } from '../../lib/recipeDraft.js';
import { recipeMeta } from '../../lib/recipeList.js';
import { servingLine } from '../../lib/recipeServing.js';
import { scaleAmount } from '../../lib/recipeScale.js';
import { linkedRecipe } from '../../lib/recipeSuggest.js';
import { RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { useAppStore } from '../../store/useAppStore.js';
import AteThis from '../diet/AteThis.js';
import ServingsScaler from './ServingsScaler.js';
import type { Recipe } from '../../types.ts';

// One recipe (ADR 084): its ingredients checked against At home, the steps, and what you can do with it. `mine`: one of yours; otherwise it
// is a library recipe (a copy, not yet in your list) and "Add to Mine" copies it.
export default function RecipeDetail({ recipe, mine, onBack, onEdit, onAdd, onOpen }: { recipe: Recipe; mine: boolean; onBack: () => void; onEdit: () => void; onAdd: (servings?: number) => void; onOpen?: (id: string) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const grocery = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const [msg, setMsg] = useState('');
  const [tonight, setTonight] = useState<number | null>(null); // servings for tonight; the amounts shown scale to it, nothing is saved
  const shown = recipe.servings ? tonight ?? recipe.servings : null;
  const month = monthKey(new Date());
  const status = useMemo(() => pantryStatus(recipe, grocery, months[month] ?? { lines: {}, pulled: [] }, recipes), [recipe, grocery, months, month, recipes]);
  const credit = attribution(recipe, mine);
  const missing = missingParts(status);
  const toAdd = missing.add.length;
  const maybes = mine ? suggestionPins(status).length : 0;
  const addMissing = () => setMsg(addMissingMessage(useAppStore.getState().addMissingToGrocery(recipe.id, month)));
  if (recipe.cat === 'ready') { // bought or frozen: no ingredients, steps or scaling, only its numbers and Ate this
    return (
      <section className="panel" aria-labelledby="rc-h">
        <BackBar onBack={onBack} />
        <h2 id="rc-h" tabIndex={-1}>{recipe.n}<span className="pill custom">Ready-made</span></h2>
        <AteThis recipe={recipe} mine={mine} onEdit={onEdit} />
        {recipe.note && <p className="note">{recipe.note}</p>}
        <div className="rc-actions"><MineActions recipe={recipe} noun="food" onEdit={onEdit} onBack={onBack} /></div>
      </section>
    );
  }
  return (
    <section className="panel" aria-labelledby="rc-h">
      <BackBar onBack={onBack} />
      <h2 id="rc-h" tabIndex={-1}>{recipe.n}{recipe.from || !mine ? <span className="pill custom" title="From the recipe library; what you change on it stays yours">Library</span> : <span className="pill custom" title="You created this recipe">Custom</span>}{recipe.edited && <span className="rc-edited" title="You changed this recipe from the library version">Edited</span>}</h2>
      <p className="note">{recipeMeta(RECIPE_CATEGORY_LABEL[recipe.cat], recipe.servings, recipe.minutes)}</p>
      {recipe.url && <p className="note"><a className="rc-video" href={recipe.url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(recipe.url)}: ${recipe.n} (opens in a new tab)`}><Icon name="play" />{' '}{videoLabel(recipe.url)}</a></p>}
      {servingLine(recipe.serving, recipe.servingG) && <p className="note">Serving size: {servingLine(recipe.serving, recipe.servingG)}</p>}
      {recipe.servings && shown && <ServingsScaler base={recipe.servings} value={shown} onChange={setTonight} />}
      <AteThis recipe={recipe} mine={mine} onEdit={onEdit} />
      <h3>Ingredients{status.total > 0 && <span className="rc-have"> {status.have} of {status.total} at home</span>}</h3>
      {grocery.items.length === 0 && <p className="note">Add items under Groceries, At home to see what you have.</p>}
      {maybes > 0 && <div className="rc-actions"><button type="button" className="btn sm" onClick={() => useAppStore.getState().acceptSuggestions(recipe.id, month)}>Accept all suggestions</button></div>}
      <ul className="rc-ings">
        {status.lines.map((l, i) => (
          <li className="rc-ing" key={i}>
            <span className={l.skipped ? 'rc-skipped' : undefined}>{l.ing.amt ? `${recipe.servings && shown ? scaleAmount(l.ing.amt, shown / recipe.servings).text : l.ing.amt} ` : ''}{(() => { const s = mine && onOpen ? linkedRecipe(l.ing, recipes, recipe.id) : undefined; return s ? <button type="button" className="rc-link" aria-label={`Open ${s.n}, ${s.cat === 'seasonings' ? 'seasoning' : 'sauce'}`} onClick={() => onOpen!(s.id)}>{s.n}</button> : ingredientName(l.ing); })()}{l.ing.sub && <span className="rc-instead"> (or {l.ing.sub})</span>}</span>
            <span className={`rc-state ${l.skipped ? 'skip' : l.have ? 'have' : l.partial ? 'part' : 'miss'}`}>{l.skipped ? 'Skipped' : l.have ? 'Have' : l.partial ? 'Have some' : 'Missing'}</span>
            {mine && l.suggest && <button type="button" className="btn sm" aria-label={`Maybe: ${l.suggest.n} for ${ingredientName(l.ing)}`} onClick={() => useAppStore.getState().linkIngredient(recipe.id, i, l.suggest!.id)}>Maybe: {l.suggest.n}</button>}
            {mine && !l.skipped && !l.always && grocery.items.length > 0 && (
              <select aria-label={`At home item for ${ingredientName(l.ing)}`} value={l.ing.home ?? ''} onChange={e => useAppStore.getState().linkIngredient(recipe.id, i, e.target.value || null)}>
                <option value="">{l.item ? `Matched: ${l.item.n}` : 'No match'}</option>
                {rankItems(l.ing, grocery.items).map(it => <option key={it.id} value={it.id}>{it.n}</option>)}
              </select>
            )}
          </li>
        ))}
      </ul>
      {mine && (
        <div className="rc-actions">
          <button type="button" className="btn" disabled={status.total === 0} onClick={addMissing}>{toAdd ? `Add ${toAdd} missing to To get` : 'Add missing to To get'}</button>
        </div>
      )}
      <p className="note" role="status">{msg}</p>
      {recipe.steps.length > 0 && (<><h3>Steps</h3><ol className="rc-steps">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>)}
      {recipe.note && <p className="note">{recipe.note}</p>}
      {credit && <p className="rc-attrib">{credit}</p>}
      <div className="rc-actions">
        {mine ? (
          <MineActions recipe={recipe} noun="recipe" onEdit={onEdit} onBack={onBack} />
        ) : <button type="button" className="btn primary" onClick={() => onAdd(shown ?? undefined)}>Add to Mine</button>}
      </div>
    </section>
  );
}

// Shared by a recipe's page and a ready-made food's page, so a change to the back bar or to Edit and Delete reaches both.
const BackBar = ({ onBack }: { onBack: () => void }) => <div className="rc-head"><button type="button" className="btn sm ghost" onClick={onBack}>Back to recipes</button></div>;
const MineActions = ({ recipe, noun, onEdit, onBack }: { recipe: Recipe; noun: 'recipe' | 'food'; onEdit: () => void; onBack: () => void }) => (
  <>
    <button type="button" className="btn" onClick={onEdit}>Edit</button>
    <ArmedButton className="btn danger" label="Delete" armedLabel="Tap again to delete" aria-label={`Delete the ${noun} ${recipe.n}`} onConfirm={() => { useAppStore.getState().removeRecipe(recipe.id); onBack(); }} />
  </>
);
