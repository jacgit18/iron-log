import { useState } from 'react';
import { addRecent, loadRecents, saveRecents } from '../../lib/amountPicker.js';
import type { ScaleRow } from '../../lib/recipeScale.js';
import type { Suggestion } from '../../lib/recipeSuggest.js';
import { amountText } from '../../lib/foodUnit.js';
import { MAX_INGREDIENTS, MAX_Q, MAX_RECIPE_NAME } from '../../shared/recipes.js';
import type { Recipe, RecipeIngredient } from '../../types.ts';
import Icon from '../Icon.js';
import AmountPicker from './AmountPicker.js';
import FoodPicker from './FoodPicker.js';
import SauceSeasoningPicker from './SauceSeasoningPicker.js';

const STEP = 0.5; // the amount of a linked food moves in halves

// A form row: the ingredient, plus what its amount is scaled from (the Servings field rewrites amounts; see src/lib/recipeScale.ts).
export type Row = RecipeIngredient & ScaleRow;

// The ingredient rows of the recipe form (brief recipe-form-mobile-desktop): one line each (amount button, name, remove). The Alternative is a
// third column on a wide screen and a "+ Alternative" link on a phone. Skip is not offered; a row that already has it says so and can be included
// again, so stored data is never stuck.
export default function IngredientRows({ rows, options, sauces, foods, meals, partOf, onActive, onRename, onType, onSet, onRemove, onAdd, onAddSauce, onAddFood }: {
  rows: Row[]; options: Suggestion[]; sauces: Recipe[]; foods: Recipe[]; meals: Recipe[]; partOf: (rid: string) => Recipe | undefined; onActive: (i: number, field: 'n' | 'sub') => void; onRename: (i: number, name: string) => void; onType: (i: number, amt: string) => void;
  onSet: (i: number, patch: Partial<RecipeIngredient>) => void; onRemove: (i: number) => void; onAdd: () => void;
  onAddSauce: (sauce: Recipe) => number; // adds a linked row; the index it landed on, or -1 when the list is full
  onAddFood: (part: Recipe) => string | null; // adds a linked row with an amount; why it was refused (a loop, too deep, full), or null
}) {
  const [open, setOpen] = useState<number | null>(null); // the row whose amount picker is open
  const [alt, setAlt] = useState<ReadonlySet<number>>(new Set()); // rows whose Alternative was opened on a phone
  const [browse, setBrowse] = useState(false); // the Sauce or seasoning picker under the rows is open
  const [food, setFood] = useState(false); // the Food or meal picker under the rows is open
  const [recents, setRecents] = useState(loadRecents);
  const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
  const close = (i: number) => { setOpen(null); focus(`rc-amt-${i}`); };
  const done = (i: number, text: string) => {
    onType(i, text);
    if (text.trim()) { const next = addRecent(recents, text); setRecents(next); saveRecents(next); }
    close(i);
  };
  return (
    <>
      <datalist id="rc-suggest">{options.map(o => <option key={o.n} value={o.n} label={o.tag ? `${o.n} · ${o.tag}` : undefined} />)}</datalist>
      <div className="rc-ingh" aria-hidden="true"><span>Amount</span><span>Ingredient</span><span>Alternative (if you don’t have it)</span><span /></div>
      {rows.map((x, i) => (
        <div className={`rc-ingblock${x.sub || alt.has(i) ? ' rc-altopen' : ''}`} key={i}>
          <div className="rc-ingline">
            {x.q !== undefined && x.rid
              ? <span id={`rc-amt-${i}`} className="rc-qtext">{amountText(x.q, partOf(x.rid))}</span>
              : <button type="button" id={`rc-amt-${i}`} className={`rc-amt${x.amt ? '' : ' empty'}`} aria-label={`Amount for ingredient ${i + 1}: ${x.amt || 'not set'}`} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span>{x.amt || 'Amount'}</span><Icon name="chevron-down" />
            </button>
            }
            <input className="rc-name" aria-label={`Ingredient ${i + 1}`} placeholder="Ingredient" value={x.n} list="rc-suggest" onFocus={() => onActive(i, 'n')} onChange={e => { onActive(i, 'n'); onRename(i, e.target.value); }} autoComplete="off" />
            <input id={`rc-alt-${i}`} className="rc-alt" aria-label={`Alternative for ingredient ${i + 1}`} placeholder="Alternative" value={x.sub ?? ''} maxLength={MAX_RECIPE_NAME} list="rc-suggest" onFocus={() => { onActive(i, 'sub'); if (!alt.has(i)) setAlt(new Set(alt).add(i)); }} onChange={e => { onActive(i, 'sub'); onSet(i, { sub: e.target.value, home: undefined }); }} autoComplete="off" />
            <button type="button" className="btn sm ghost rc-rm" aria-label={`Remove ingredient ${i + 1}`} onClick={() => { setOpen(null); setAlt(new Set([...alt].filter(k => k !== i).map(k => (k > i ? k - 1 : k)))); onRemove(i); }}><Icon name="close" /></button>
          </div>
          {x.rid && x.q !== undefined && (
            <div className="rc-qline" role="group" aria-label={`Amount of ${x.n}`}>
              <button type="button" className="btn sm" aria-label={`Less ${x.n}`} disabled={x.q <= STEP} onClick={() => onSet(i, { q: Math.max(STEP, Math.round((x.q! - STEP) * 100) / 100) })}>−</button>
              <output aria-live="polite">{amountText(x.q, partOf(x.rid))}</output>
              <button type="button" className="btn sm" aria-label={`More ${x.n}`} disabled={x.q >= MAX_Q} onClick={() => onSet(i, { q: Math.min(MAX_Q, Math.round((x.q! + STEP) * 100) / 100) })}>+</button>
              <span className="note">Linked to your {partOf(x.rid)?.cat === 'ready' ? 'food' : 'meal'}.</span>
            </div>
          )}
          {x.rid && x.q === undefined && <p className="note rc-linknote">Linked to your sauce or seasoning.</p>}
          {!x.sub && !alt.has(i) && <button type="button" className="btn sm ghost rc-altlink" onClick={() => { setAlt(new Set(alt).add(i)); focus(`rc-alt-${i}`); }}>+ Alternative</button>}
          {x.skip && <p className="note rc-skipnote">Skipped. <button type="button" className="btn sm" aria-label={`Include again: ${x.n || `ingredient ${i + 1}`}`} onClick={() => onSet(i, { skip: undefined })}>Include again</button></p>}
          {open === i && <AmountPicker key={x.amt} value={x.amt} name={x.n} recents={recents} onDone={text => done(i, text)} onClose={() => close(i)} />}
        </div>
      ))}
      <div className="rc-addbar">
        <button type="button" className="btn sm" disabled={rows.length >= MAX_INGREDIENTS} onClick={() => { onAdd(); focus(`rc-amt-${rows.length}`); }}>Add ingredient</button>
        <button type="button" id="rc-food-open" className="btn sm" aria-expanded={food} onClick={() => { setFood(!food); setBrowse(false); }}>+ Food or meal</button>
        <button type="button" id="rc-sauce-open" className="btn sm" aria-expanded={browse} onClick={() => { setBrowse(!browse); setFood(false); }}>+ Sauce or seasoning</button>
      </div>
      {food && <FoodPicker foods={foods} meals={meals} full={rows.length >= MAX_INGREDIENTS && !!rows[rows.length - 1]?.n.trim()} onPick={p => { const e = onAddFood(p); if (!e) { setFood(false); } return e; }} onClose={() => { setFood(false); focus('rc-food-open'); }} />}
      {browse && <SauceSeasoningPicker sauces={sauces} full={rows.length >= MAX_INGREDIENTS && !!rows[rows.length - 1]?.n.trim()} onPick={s => { const at = onAddSauce(s); if (at < 0) return; setBrowse(false); focus(`rc-amt-${at}`); }} onClose={() => { setBrowse(false); focus('rc-sauce-open'); }} />}
    </>
  );
}
