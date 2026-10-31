import { useState } from 'react';
import { addRecent, loadRecents, saveRecents } from '../../lib/amountPicker.js';
import type { ScaleRow } from '../../lib/recipeScale.js';
import { MAX_INGREDIENTS, MAX_RECIPE_NAME } from '../../shared/recipes.js';
import type { RecipeIngredient } from '../../types.ts';
import Icon from '../Icon.js';
import AmountPicker from './AmountPicker.js';

// A form row: the ingredient, plus what its amount is scaled from (the Servings field rewrites amounts; see src/lib/recipeScale.ts).
export type Row = RecipeIngredient & ScaleRow;

// The ingredient rows of the recipe form (brief recipe-form-mobile-desktop): one line each (amount button, name, remove). The Alternative is a
// third column on a wide screen and a "+ Alternative" link on a phone. Skip is not offered; a row that already has it says so and can be included
// again, so stored data is never stuck.
export default function IngredientRows({ rows, options, onActive, onRename, onType, onSet, onRemove, onAdd }: {
  rows: Row[]; options: string[]; onActive: (i: number) => void; onRename: (i: number, name: string) => void; onType: (i: number, amt: string) => void;
  onSet: (i: number, patch: Partial<RecipeIngredient>) => void; onRemove: (i: number) => void; onAdd: () => void;
}) {
  const [open, setOpen] = useState<number | null>(null); // the row whose amount picker is open
  const [alt, setAlt] = useState<ReadonlySet<number>>(new Set()); // rows whose Alternative was opened on a phone
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
      <datalist id="rc-suggest">{options.map(o => <option key={o} value={o} />)}</datalist>
      <div className="rc-ingh" aria-hidden="true"><span>Amount</span><span>Ingredient</span><span>Alternative (use this instead)</span><span /></div>
      {rows.map((x, i) => (
        <div className={`rc-ingblock${x.sub || alt.has(i) ? ' rc-altopen' : ''}`} key={i}>
          <div className="rc-ingline">
            <button type="button" id={`rc-amt-${i}`} className={`rc-amt${x.amt ? '' : ' empty'}`} aria-label={`Amount for ingredient ${i + 1}: ${x.amt || 'not set'}`} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span>{x.amt || 'Amount'}</span><Icon name="chevron-down" />
            </button>
            <input className="rc-name" aria-label={`Ingredient ${i + 1}`} placeholder="Ingredient" value={x.n} list="rc-suggest" onFocus={() => onActive(i)} onChange={e => { onActive(i); onRename(i, e.target.value); }} autoComplete="off" />
            <input id={`rc-alt-${i}`} className="rc-alt" aria-label={`Alternative for ingredient ${i + 1}`} placeholder="Alternative" value={x.sub ?? ''} maxLength={MAX_RECIPE_NAME} onFocus={() => { if (!alt.has(i)) setAlt(new Set(alt).add(i)); }} onChange={e => onSet(i, { sub: e.target.value, home: undefined })} autoComplete="off" />
            <button type="button" className="btn sm ghost rc-rm" aria-label={`Remove ingredient ${i + 1}`} onClick={() => { setOpen(null); setAlt(new Set([...alt].filter(k => k !== i).map(k => (k > i ? k - 1 : k)))); onRemove(i); }}><Icon name="close" /></button>
          </div>
          {!x.sub && !alt.has(i) && <button type="button" className="btn sm ghost rc-altlink" onClick={() => { setAlt(new Set(alt).add(i)); focus(`rc-alt-${i}`); }}>+ Alternative</button>}
          {x.skip && <p className="note rc-skipnote">Skipped. <button type="button" className="btn sm" aria-label={`Include again: ${x.n || `ingredient ${i + 1}`}`} onClick={() => onSet(i, { skip: undefined })}>Include again</button></p>}
          {open === i && <AmountPicker key={x.amt} value={x.amt} name={x.n} recents={recents} onDone={text => done(i, text)} onClose={() => close(i)} />}
        </div>
      ))}
      <button type="button" className="btn sm" disabled={rows.length >= MAX_INGREDIENTS} onClick={() => { onAdd(); focus(`rc-amt-${rows.length}`); }}>Add ingredient</button>
    </>
  );
}
