import { useEffect, useRef, useState } from 'react';
import { addRecent, loadRecents, saveRecents } from '../../lib/amountPicker.js';
import type { ScaleRow } from '../../lib/recipeScale.js';
import type { Suggestion } from '../../lib/recipeSuggest.js';
import { amountText } from '../../lib/foodUnit.js';
import { menuAfterRemove } from '../../lib/recipeFormExtras.js';
import { afterAmount, foldedSummary, isFolded, landsAt, shiftForInsert, shiftSetForInsert } from '../../lib/recipeSaferEditing.js';
import { MAX_INGREDIENTS, MAX_Q, MAX_RECIPE_NAME } from '../../shared/recipes.js';
import type { Recipe, RecipeIngredient } from '../../types.ts';
import Icon from '../Icon.js';
import AmountPicker from './AmountPicker.js';
import FoodPicker from './FoodPicker.js';
import SauceSeasoningPicker from './SauceSeasoningPicker.js';
import './IngredientRows.css';
import './RecipeFormExtras.css';

const STEP = 0.5; // the amount of a linked food moves in halves

// A form row: the ingredient, plus what its amount is scaled from (the Servings field rewrites amounts; see src/lib/recipeScale.ts).
export type Row = RecipeIngredient & ScaleRow;

// The ingredient rows of the recipe form (brief recipe-form-mobile-desktop): one line each (amount button, name, remove). The Alternative is a
// third column on a wide screen and a "+ Alternative" link on a phone. Skip is not offered; a row that already has it says so and can be included
// again, so stored data is never stuck.
export default function IngredientRows({ rows, open, onOpen, restored, options, sauces, foods, meals, partOf, onActive, onRename, onType, onSet, onRemove, onAdd, onAddSauce, onAddFood }: {
  rows: Row[]; open: number | null; onOpen: (i: number | null) => void; restored: { at: number; seq: number } | null; // the row whose amount picker is open (held by the form, so Back can close it)
  options: Suggestion[]; sauces: Recipe[]; foods: Recipe[]; meals: Recipe[]; partOf: (rid: string) => Recipe | undefined; onActive: (i: number, field: 'n' | 'sub') => void; onRename: (i: number, name: string) => void; onType: (i: number, amt: string) => void;
  onSet: (i: number, patch: Partial<RecipeIngredient>) => void; onRemove: (i: number) => void; onAdd: () => void;
  onAddSauce: (sauce: Recipe) => number; // adds a linked row; the index it landed on, or -1 when the list is full
  onAddFood: (part: Recipe) => string | null; // adds a linked row with an amount; why it was refused (a loop, too deep, full), or null
}) {
  const [editing, setEditing] = useState<number | null>(null); // the finished row kept open because it is being edited (brief recipe-safer-editing); unfinished rows are always open
  const [seenRestore, setSeenRestore] = useState(restored?.seq ?? 0);
  const justFocused = useRef(false); // a name was just focused by a press: the release must not drop its selection
  const [alt, setAlt] = useState<ReadonlySet<number>>(new Set()); // rows whose Alternative was opened on a phone
  const [browse, setBrowse] = useState(false); // the Sauce or seasoning picker under the rows is open
  const [food, setFood] = useState(false); // the Food or meal picker under the rows is open
  const [recents, setRecents] = useState(loadRecents);
  const [menu, setMenu] = useState<number | null>(null); // the row whose ⋯ menu is open (brief recipe-form-extras)
  if (restored && restored.seq !== seenRestore) { // Undo put a row back: the rows below it moved down one, and so did our row numbers
    setSeenRestore(restored.seq);
    setEditing(e => shiftForInsert(e, restored.at));
    setAlt(a => shiftSetForInsert(a, restored.at));
  }
  const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);
  const close = (i: number) => { onOpen(null); focus(`rc-amt-${i}`); };
  const edit = (i: number) => { setEditing(i); onOpen(null); };
  // An amount is set: the row folds and the next unfinished row opens, or Save is focused when none is left.
  const done = (i: number, text: string) => {
    onType(i, text);
    if (text.trim()) { const next = addRecent(recents, text); setRecents(next); saveRecents(next); }
    onOpen(null);
    const go = afterAmount(rows.map((r, j) => (j === i ? { ...r, amt: text } : r)), i);
    if (go.kind === 'save') { setEditing(null); focus('rc-save'); return; }
    setEditing(go.i);
    focus(rows[go.i]!.n.trim() ? `rc-amt-${go.i}` : `rc-name-${go.i}`);
  };
  const remove = (i: number) => { setMenu(m => menuAfterRemove(m, i)); onOpen(null); setEditing(e => (e === null || e === i ? null : e > i ? e - 1 : e)); setAlt(new Set([...alt].filter(k => k !== i).map(k => (k > i ? k - 1 : k)))); onRemove(i); };
  return (
    <>
      <datalist id="rc-suggest">{options.map(o => <option key={o.n} value={o.n} label={o.tag ? `${o.n} · ${o.tag}` : undefined} />)}</datalist>
      <div className="rc-ingh" aria-hidden="true"><span>Amount</span><span>Ingredient</span><span>Alternative (if you don’t have it)</span><span /></div>
      {rows.map((x, i) => (isFolded(x, i, editing) && open !== i
        ? (
          <div className="rc-ingblock rc-folded" key={i}>
            <div className="rc-ingline rc-foldline">
              <button type="button" id={`rc-fold-${i}`} className="rc-fold" aria-label={`Ingredient ${i + 1}: ${foldedSummary(x, x.q !== undefined && x.rid ? amountText(x.q, partOf(x.rid)) : x.amt)}. Edit`} onClick={() => { edit(i); focus(`rc-name-${i}`); }}>
                <Icon name="check" /><span>{foldedSummary(x, x.q !== undefined && x.rid ? amountText(x.q, partOf(x.rid)) : x.amt)}</span><Icon name="chevron-down" />
              </button>
              <RowMenu i={i} open={menu === i} onToggle={() => setMenu(menu === i ? null : i)} onClose={() => setMenu(null)} onRemove={() => remove(i)} />
            </div>
          </div>
        )
        : (
        <div className={`rc-ingblock${x.sub || alt.has(i) ? ' rc-altopen' : ''}`} key={i}>
          <div className="rc-ingline">
            {x.q !== undefined && x.rid
              ? <span id={`rc-amt-${i}`} className="rc-qtext">{amountText(x.q, partOf(x.rid))}</span>
              : <button type="button" id={`rc-amt-${i}`} className={`rc-amt${x.amt ? '' : ' empty'}`} aria-label={`Amount for ingredient ${i + 1}: ${x.amt || 'not set'}`} aria-expanded={open === i} onClick={() => { setEditing(i); onOpen(open === i ? null : i); }}>
              <span>{x.amt || 'Amount'}</span><Icon name="chevron-down" />
            </button>
            }
            <input id={`rc-name-${i}`} className="rc-name" aria-label={`Ingredient ${i + 1}`} placeholder="Ingredient" value={x.n} list="rc-suggest" onFocus={e => { setEditing(i); onActive(i, 'n'); e.currentTarget.select(); justFocused.current = true; }} onMouseUp={e => { if (justFocused.current) e.preventDefault(); justFocused.current = false; }} onKeyDown={e => { if (e.key !== 'Enter') return; e.preventDefault(); if (x.rid && x.q !== undefined) focus(`rc-more-${i}`); else if (x.q === undefined && x.n.trim()) { setEditing(i); onOpen(i); } }} onChange={e => { onActive(i, 'n'); onRename(i, e.target.value); }} autoComplete="off" />
            <input id={`rc-alt-${i}`} className="rc-alt" aria-label={`Alternative for ingredient ${i + 1}`} placeholder="Alternative" value={x.sub ?? ''} maxLength={MAX_RECIPE_NAME} list="rc-suggest" onFocus={() => { onActive(i, 'sub'); if (!alt.has(i)) setAlt(new Set(alt).add(i)); }} onChange={e => { onActive(i, 'sub'); onSet(i, { sub: e.target.value, home: undefined }); }} autoComplete="off" />
            <RowMenu i={i} open={menu === i} onToggle={() => setMenu(menu === i ? null : i)} onClose={() => setMenu(null)} onRemove={() => remove(i)} />
          </div>
          {x.rid && x.q !== undefined && (
            <div className="rc-qline" role="group" aria-label={`Amount of ${x.n}`}>
              <button type="button" className="btn sm" aria-label={`Less ${x.n}`} disabled={x.q <= STEP} onClick={() => onSet(i, { q: Math.max(STEP, Math.round((x.q! - STEP) * 100) / 100) })}><Icon name="minus" /></button>
              <output aria-live="polite">{amountText(x.q, partOf(x.rid))}</output>
              <button type="button" id={`rc-more-${i}`} className="btn sm" aria-label={`More ${x.n}`} disabled={x.q >= MAX_Q} onClick={() => onSet(i, { q: Math.min(MAX_Q, Math.round((x.q! + STEP) * 100) / 100) })}><Icon name="plus" /></button>
              <span className="note">Linked to your {partOf(x.rid)?.cat === 'ready' ? 'food' : 'meal'}.</span>
            </div>
          )}
          {x.rid && x.q === undefined && <p className="note rc-linknote">Linked to your sauce or seasoning.</p>}
          {!x.sub && !alt.has(i) && <button type="button" className="btn sm ghost rc-altlink" onClick={() => { setAlt(new Set(alt).add(i)); focus(`rc-alt-${i}`); }}>+ Alternative</button>}
          {x.skip && <p className="note rc-skipnote">Skipped. <button type="button" className="btn sm" aria-label={`Include again: ${x.n || `ingredient ${i + 1}`}`} onClick={() => onSet(i, { skip: undefined })}>Include again</button></p>}
          {open === i && <AmountPicker key={x.amt} value={x.amt} name={x.n} recents={recents} onDone={text => done(i, text)} onClose={() => close(i)} />}
        </div>
        )))}
      <div className="rc-addbar">
        <button type="button" className="btn sm" disabled={rows.length >= MAX_INGREDIENTS} onClick={() => { onAdd(); setEditing(rows.length); focus(`rc-name-${rows.length}`); }}>Add ingredient</button>
        <button type="button" id="rc-food-open" className="btn sm" aria-expanded={food} onClick={() => { setFood(!food); setBrowse(false); }}>+ Food or meal</button>
        <button type="button" id="rc-sauce-open" className="btn sm" aria-expanded={browse} onClick={() => { setBrowse(!browse); setFood(false); }}>+ Sauce or seasoning</button>
      </div>
      {food && <FoodPicker foods={foods} meals={meals} full={rows.length >= MAX_INGREDIENTS && !!rows[rows.length - 1]?.n.trim()} onPick={p => { const at = landsAt(rows), e = onAddFood(p); if (!e) { setEditing(at); setFood(false); setTimeout(() => [...document.querySelectorAll<HTMLElement>('[id^="rc-more-"]')].pop()?.focus(), 0); } return e; }} onClose={() => { setFood(false); focus('rc-food-open'); }} />}
      {browse && <SauceSeasoningPicker sauces={sauces} full={rows.length >= MAX_INGREDIENTS && !!rows[rows.length - 1]?.n.trim()} onPick={s => { const at = onAddSauce(s); if (at < 0) return; setEditing(at); setBrowse(false); focus(`rc-amt-${at}`); }} onClose={() => { setBrowse(false); focus('rc-sauce-open'); }} />}
    </>
  );
}

// The ⋯ menu of an ingredient row (brief recipe-form-extras): Remove lives here so it is not next to the amount button. Esc or a tap elsewhere closes it.
function RowMenu({ i, open, onToggle, onClose, onRemove }: { i: number; open: boolean; onToggle: () => void; onClose: () => void; onRemove: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open, onClose]);
  return (
    <div className="rc-rmwrap" ref={wrap} onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); e.preventDefault(); onClose(); document.getElementById(`rc-more-menu-${i}`)?.focus(); } }}>
      <button type="button" id={`rc-more-menu-${i}`} className="btn sm ghost rc-rm" aria-label={`More for ingredient ${i + 1}`} aria-haspopup="true" aria-expanded={open} onClick={onToggle}><Icon name="dots" /></button>
      {open && <div className="rc-rmmenu" role="group" aria-label={`Ingredient ${i + 1} actions`}><button type="button" className="btn sm" autoFocus aria-label={`Remove ingredient ${i + 1}`} onClick={onRemove}><Icon name="close" /> Remove</button></div>}
    </div>
  );
}
