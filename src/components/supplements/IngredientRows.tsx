import type { NutrientUnit } from '../../shared/nutrientKeys.js';
import { NUTRIENT_UNITS } from '../../shared/nutrientKeys.js';
import { CURATED_INGREDIENTS, MAX_INGREDIENT_NAME, defaultIngredientUnit } from '../../shared/supplementIngredients.js';
import { INGREDIENT_NOTE, PANEL_NOTE, duplicateIngredientNotes } from '../../lib/supplementIngredients.js';
import type { IngredientDraft } from '../../lib/supplementIngredients.js';
import './IngredientRows.css';

// "Active ingredients" under "What is in one serving" on the supplement sheet (brief supplement-active-ingredients): omega-3, EPA, DHA, creatine, caffeine or a typed name, amount and unit per row.
// Separate from the 28 vitamin and mineral rows. Amounts stay text while typing; the sheet turns them into numbers on save.
const OTHER = '__other';

export default function IngredientRows({ rows, onChange }: { rows: IngredientDraft[]; onChange: (rows: IngredientDraft[]) => void }) {
  const set = (i: number, patch: Partial<IngredientDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const pick = (i: number, v: string) => (v === OTHER ? set(i, { other: true, name: '' }) : set(i, { other: false, name: v, unit: defaultIngredientUnit(v) }));
  const add = () => { const free = CURATED_INGREDIENTS.find(c => !rows.some(r => !r.other && r.name === c)); onChange([...rows, free ? { name: free, amount: '', unit: defaultIngredientUnit(free), other: false } : { name: '', amount: '', unit: 'mg', other: true }]); };
  return (
    <fieldset className="irows">
      <legend>Active ingredients (optional)</legend>
      <p className="note">Fish oil, creatine, caffeine or anything else the label lists that is not a vitamin or mineral. They add up on the Totals sheet, where you can set your own daily limit.</p>
      <p className="note" id="supp-panel-note">{PANEL_NOTE}</p>
      {rows.map((r, i) => (
        <div key={i} className="irow">
          <select aria-label={`Ingredient ${i + 1}`} value={r.other ? OTHER : r.name} onChange={e => pick(i, e.target.value)}>
            <optgroup label="Active ingredients">{CURATED_INGREDIENTS.map(c => <option key={c} value={c}>{c}</option>)}</optgroup>
            <option value={OTHER}>Other ingredient…</option>
          </select>
          <input aria-label={`Amount of ingredient ${i + 1}`} type="number" inputMode="decimal" min="0" step="any" value={r.amount} onChange={e => set(i, { amount: e.target.value })} />
          <select aria-label={`Unit of ingredient ${i + 1}`} value={r.unit} onChange={e => set(i, { unit: e.target.value as NutrientUnit })}>
            {NUTRIENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          {r.other && <input className="irow-name" aria-label={`Name of ingredient ${i + 1}`} maxLength={MAX_INGREDIENT_NAME} placeholder="Ingredient name, e.g. L-theanine" value={r.name} onChange={e => set(i, { name: e.target.value })} />}
          <button type="button" className="btn sm" aria-label={`Remove ${r.name || 'ingredient'} row ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {duplicateIngredientNotes(rows).map(n => <p key={n} className="note">{n}</p>)}
      <button type="button" className="btn sm" id="supp-add-ingredient" onClick={add}>Add an ingredient</button>
      <p className="note" id="supp-ingredient-note">{INGREDIENT_NOTE}</p>
    </fieldset>
  );
}
