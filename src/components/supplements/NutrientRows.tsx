import { NUTRIENT_KEYS, NUTRIENT_UNITS } from '../../shared/nutrientKeys.js';
import type { NutrientKey, NutrientUnit } from '../../shared/nutrientKeys.js';
import { nutrientLabel, nutrientUnit } from '../../lib/nutrientInfo.js';
import { duplicateRowNotes, type NutrientRowDraft } from '../../lib/nutrientRowIssues.js';
import './NutrientRows.css';

// "What is in one serving" on the supplement sheet (brief supplement-nutrient-totals): nutrient, amount, unit per row. Amounts stay text while typing; the sheet turns them into numbers on save.
export type NutrientDraft = NutrientRowDraft;
const FORM_KEYS = NUTRIENT_KEYS; // all 20: the 15 with a limit, then the 5 without (the Totals sheet shows both)
const label = nutrientLabel;
const NEXT_FREE = (rows: NutrientDraft[]): NutrientKey | undefined => FORM_KEYS.find(k => !rows.some(r => r.key === k));

export default function NutrientRows({ rows, onChange }: { rows: NutrientDraft[]; onChange: (rows: NutrientDraft[]) => void }) {
  const free = NEXT_FREE(rows); // every nutrient already has a row: change a row's nutrient instead of adding a copy
  const set = (i: number, patch: Partial<NutrientDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="nrows">
      <legend>What is in one serving (optional)</legend>
      <p className="note">Copy it from the label. It feeds the daily totals against the upper limits; leave it empty and nothing changes. A row with no amount is left out when you save.</p>
      {rows.map((r, i) => (
        <div key={i} className="nrow">
          <select aria-label={`Nutrient ${i + 1}`} value={r.key} onChange={e => { const key = e.target.value as NutrientKey; set(i, { key, unit: nutrientUnit(key) ?? r.unit }); }}>
            {(FORM_KEYS.some(k => k === r.key) ? [...FORM_KEYS] : [...FORM_KEYS, r.key]).map(k => <option key={k} value={k}>{label(k)}</option>)}
          </select>
          <input aria-label={`Amount ${i + 1}`} type="number" inputMode="decimal" min="0" step="any" value={r.amount} onChange={e => set(i, { amount: e.target.value })} />
          <select aria-label={`Unit ${i + 1}`} value={r.unit} onChange={e => set(i, { unit: e.target.value as NutrientUnit })}>
            {NUTRIENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <button type="button" className="btn sm" aria-label={`Remove ${label(r.key)} row`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {duplicateRowNotes(rows).map(n => <p key={n} className="note">{n}</p>)}
      <button type="button" className="btn sm" id="supp-add-nutrient" disabled={!free} onClick={() => { if (free) onChange([...rows, { key: free, amount: '', unit: nutrientUnit(free) ?? 'mg' }]); }}>+ Add a nutrient</button>
    </fieldset>
  );
}
