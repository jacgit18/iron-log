import { useMemo, useState } from 'react';
import ArmedButton from '../ArmedButton.jsx';
import { monthKey } from '../../lib/grocery.js';
import { addMissingMessage, missingParts, pantryStatus } from '../../lib/recipePantry.js';
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
  const missing = missingParts(status);
  const toAdd = missing.add.length;
  const addMissing = () => setMsg(addMissingMessage(useAppStore.getState().addMissingToGrocery(recipe.id, month)));
  return (
    <section className="panel" aria-labelledby="rc-h">
      <div className="rc-head">
        <button type="button" className="btn sm ghost" onClick={onBack}>Back to recipes</button>
      </div>
      <h2 id="rc-h" tabIndex={-1}>{recipe.n}{recipe.from || !mine ? <span className="pill custom" title="From the recipe library; what you change on it stays yours">Library</span> : <span className="pill custom" title="You created this recipe">Custom</span>}</h2>
      <p className="note">{recipeMeta(RECIPE_CATEGORY_LABEL[recipe.cat], recipe.servings, recipe.minutes)}</p>
      <h3>Ingredients <span className="rc-have">{status.have} of {status.total} at home</span></h3>
      {grocery.items.length === 0 && <p className="note">Add items under Groceries, At home to see what you have.</p>}
      <ul className="rc-ings">
        {status.lines.map((l, i) => (
          <li className="rc-ing" key={i}>
            <span>{l.ing.amt ? `${l.ing.amt} ` : ''}{l.ing.n}</span>
            <span className={`rc-state ${l.have ? 'have' : 'miss'}`}>{l.have ? 'Have' : 'Missing'}</span>
            {mine && grocery.items.length > 0 && (
              <select aria-label={`At home item for ${l.ing.n}`} value={l.ing.home ?? ''} onChange={e => useAppStore.getState().linkIngredient(recipe.id, i, e.target.value || null)}>
                <option value="">{l.item ? `Matched: ${l.item.n}` : 'No match'}</option>
                {grocery.items.map(it => <option key={it.id} value={it.id}>{it.n}</option>)}
              </select>
            )}
          </li>
        ))}
      </ul>
      {mine && grocery.items.length > 0 && (
        <div className="rc-actions">
          <button type="button" className="btn" onClick={addMissing}>{toAdd ? `Add ${toAdd} missing to To get` : 'Add missing to To get'}</button>
        </div>
      )}
      <p className="note" role="status">{msg}</p>
      {recipe.steps.length > 0 && (<><h3>Steps</h3><ol className="rc-steps">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>)}
      {recipe.note && <p className="note">{recipe.note}</p>}
      {!mine && <p className="rc-attrib">From the Wikibooks Cookbook, CC BY-SA 4.0.</p>}
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
