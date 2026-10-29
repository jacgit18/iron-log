import { useMemo, useState } from 'react';
import ArmedButton from '../ArmedButton.jsx';
import { monthKey } from '../../lib/grocery.js';
import { addMissingMessage, ingredientName, missingParts, pantryStatus, rankItems, suggestionPins } from '../../lib/recipePantry.js';
import { attribution } from '../../lib/recipeDraft.js';
import { recipeMeta } from '../../lib/recipeList.js';
import { RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe } from '../../types.ts';

// One recipe (ADR 084): its ingredients checked against At home, the steps, and what you can do with it. `mine`: one of yours; otherwise it
// is a library recipe (a copy, not yet in your list) and "Add to Mine" copies it.
export default function RecipeDetail({ recipe, mine, onBack, onEdit, onAdd }: { recipe: Recipe; mine: boolean; onBack: () => void; onEdit: () => void; onAdd: () => void }) {
  const grocery = useAppStore(s => s.grocery);
  const months = useAppStore(s => s.groceryMonths);
  const [msg, setMsg] = useState('');
  const month = monthKey(new Date());
  const status = useMemo(() => pantryStatus(recipe, grocery, months[month] ?? { lines: {}, pulled: [] }), [recipe, grocery, months, month]);
  const credit = attribution(recipe, mine);
  const missing = missingParts(status);
  const toAdd = missing.add.length;
  const maybes = mine ? suggestionPins(status).length : 0;
  const addMissing = () => setMsg(addMissingMessage(useAppStore.getState().addMissingToGrocery(recipe.id, month)));
  return (
    <section className="panel" aria-labelledby="rc-h">
      <div className="rc-head">
        <button type="button" className="btn sm ghost" onClick={onBack}>Back to recipes</button>
      </div>
      <h2 id="rc-h" tabIndex={-1}>{recipe.n}{recipe.from || !mine ? <span className="pill custom" title="From the recipe library; what you change on it stays yours">Library</span> : <span className="pill custom" title="You created this recipe">Custom</span>}{recipe.edited && <span className="rc-edited" title="You changed this recipe from the library version">Edited</span>}</h2>
      <p className="note">{recipeMeta(RECIPE_CATEGORY_LABEL[recipe.cat], recipe.servings, recipe.minutes)}</p>
      <h3>Ingredients{status.total > 0 && <span className="rc-have"> {status.have} of {status.total} at home</span>}</h3>
      {grocery.items.length === 0 && <p className="note">Add items under Groceries, At home to see what you have.</p>}
      {maybes > 0 && <div className="rc-actions"><button type="button" className="btn sm" onClick={() => useAppStore.getState().acceptSuggestions(recipe.id, month)}>Accept all suggestions</button></div>}
      <ul className="rc-ings">
        {status.lines.map((l, i) => (
          <li className="rc-ing" key={i}>
            <span className={l.skipped ? 'rc-skipped' : undefined}>{l.ing.amt ? `${l.ing.amt} ` : ''}{ingredientName(l.ing)}{l.ing.sub && <span className="rc-instead"> (instead of {l.ing.n})</span>}</span>
            <span className={`rc-state ${l.skipped ? 'skip' : l.have ? 'have' : 'miss'}`}>{l.skipped ? 'Skipped' : l.have ? 'Have' : 'Missing'}</span>
            {mine && l.suggest && <button type="button" className="btn sm" onClick={() => useAppStore.getState().linkIngredient(recipe.id, i, l.suggest!.id)}>Maybe: {l.suggest.n}</button>}
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
          <>
            <button type="button" className="btn" onClick={onEdit}>Edit</button>
            <ArmedButton className="btn danger" label="Delete" armedLabel="Tap again to delete" aria-label={`Delete the recipe ${recipe.n}`} onConfirm={() => { useAppStore.getState().removeRecipe(recipe.id); onBack(); }} />
          </>
        ) : <button type="button" className="btn primary" onClick={onAdd}>Add to Mine</button>}
      </div>
    </section>
  );
}
