import { NUTRIENT_KEYS, NUTRIENT_UNITS } from '../../shared/nutrientKeys.js';
import type { NutrientKey, NutrientUnit } from '../../shared/nutrientKeys.js';
import { limitOf } from '../../lib/nutrientLimits.js';
import './NutrientRows.css';

// "What is in one serving" on the supplement sheet (brief supplement-nutrient-totals): nutrient, amount, unit per row. Amounts stay text while typing; the sheet turns them into numbers on save.
export interface NutrientDraft { key: NutrientKey; amount: string; unit: NutrientUnit }
const label = (k: NutrientKey) => limitOf(k)?.label ?? k;
const NEXT_FREE = (rows: NutrientDraft[]): NutrientKey => NUTRIENT_KEYS.find(k => !rows.some(r => r.key === k)) ?? NUTRIENT_KEYS[0];

export default function NutrientRows({ rows, onChange }: { rows: NutrientDraft[]; onChange: (rows: NutrientDraft[]) => void }) {
  const set = (i: number, patch: Partial<NutrientDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="nrows">
      <legend>What is in one serving (optional)</legend>
      <p className="note">Copy it from the label. It feeds the daily totals against the upper limits; leave it empty and nothing changes.</p>
      {rows.map((r, i) => (
        <div key={i} className="nrow">
          <select aria-label={`Nutrient ${i + 1}`} value={r.key} onChange={e => { const key = e.target.value as NutrientKey; set(i, { key, unit: limitOf(key)?.unit ?? r.unit }); }}>
            {NUTRIENT_KEYS.map(k => <option key={k} value={k}>{label(k)}</option>)}
          </select>
          <input aria-label={`Amount ${i + 1}`} type="number" inputMode="decimal" min="0" step="any" value={r.amount} onChange={e => set(i, { amount: e.target.value })} />
          <select aria-label={`Unit ${i + 1}`} value={r.unit} onChange={e => set(i, { unit: e.target.value as NutrientUnit })}>
            {NUTRIENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <button type="button" className="btn sm" aria-label={`Remove ${label(r.key)} row`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn sm" id="supp-add-nutrient" onClick={() => { const key = NEXT_FREE(rows); onChange([...rows, { key, amount: '', unit: limitOf(key)?.unit ?? 'mg' }]); }}>+ Add a nutrient</button>
    </fieldset>
  );
}
