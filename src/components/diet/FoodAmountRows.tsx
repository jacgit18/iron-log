import { useState } from 'react';
import ArmedButton from '../ArmedButton.jsx';
import NutrientOptionGroups from '../NutrientOptionGroups.js';
import type { NutrientKey } from '../../shared/nutrientKeys.js';
import { AMOUNT_UNITS, microOfRows, nextFreeKey } from '../../lib/foodAmountRows.js';
import type { AmountRow, AmountUnit } from '../../lib/foodAmountRows.js';
import { MICRO_UNIT } from '../../shared/foodMicro.js';
import { nutrientLabel } from '../../lib/nutrientInfo.js';
import './FoodAmountRows.css';

// "Vitamins and minerals (optional)" on the One-off food form and the Ready-made form (brief type-food-amounts, layout A): a closed disclosure unless the food already has amounts. The caller
// decides whether to render it. A row a person edits stops being `filled`, so the calorie-change rule keeps it.
export default function FoodAmountRows({ idp, rows, onChange, perServing = false, cleared = false }: { idp: string; rows: AmountRow[]; onChange: (rows: AmountRow[]) => void; perServing?: boolean; cleared?: boolean }) {
  const [open, setOpen] = useState(rows.length > 0);
  const free = nextFreeKey(rows);
  const set = (i: number, patch: Partial<AmountRow>) => onChange(rows.map((r, j) => { if (j !== i) return r; const { filled: _filled, ...typed } = r; return { ...typed, ...patch }; })); // an edited row is no longer filled
  const notes = microOfRows(rows).left;
  const locked = rows.length > 0 || cleared; // rows (they are saved) or the calories-changed line keep the body open: nothing a save would use is hidden
  const shown = open || locked;
  return (
    <div className="fa">
      <button type="button" className="btn fa-disc" id={`${idp}-fa-disc`} aria-expanded={shown} aria-controls={`${idp}-fa`} aria-disabled={locked || undefined} onClick={() => { if (!locked) setOpen(!shown); }}>
        <span>Vitamins and minerals{perServing ? ' per serving' : ''} (optional)</span><span aria-hidden="true">{locked ? '' : shown ? '▾' : '▸'}</span>
      </button>
      {shown && (
        <div id={`${idp}-fa`} className="fa-body" role="group" aria-label={`Vitamins and minerals${perServing ? ' per serving' : ''}`}>
          <p className="note">Amounts {perServing ? 'per serving' : 'as you eat it'}, from a label or a database. Leave it empty and the food counts as no data.</p>
          {rows.some(r => r.filled) && <p className="note" role="status">Filled from the food lookup or an earlier save. Check them against the label; change or remove any row.</p>}
          {rows.map((r, i) => (
            <div key={i} className="fa-row">
              <select aria-label={`Nutrient ${i + 1}`} value={r.key} onChange={e => { const key = e.target.value as NutrientKey; set(i, { key, unit: MICRO_UNIT[key] }); }}>
                <NutrientOptionGroups />
              </select>
              <input aria-label={`Amount ${i + 1}`} type="number" inputMode="decimal" min="0" step="any" value={r.amount} onChange={e => set(i, { amount: e.target.value })} />
              <select aria-label={`Unit ${i + 1}`} value={r.unit} onChange={e => set(i, { unit: e.target.value as AmountUnit })}>
                {AMOUNT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <ArmedButton className="btn sm" aria-label={`Remove ${nutrientLabel(r.key)} row`} label="Remove" armedLabel="Tap again to remove" onConfirm={() => onChange(rows.filter((_, j) => j !== i))} />
            </div>
          ))}
          {notes.map(n => <p key={n} className="note">{n}</p>)}
          {cleared && <p className="note" role="status">Calories changed: amounts you did not retype were cleared.</p>}
          <button type="button" className="btn sm" id={`${idp}-fa-add`} disabled={!free} onClick={() => { if (free) onChange([...rows, { key: free, amount: '', unit: MICRO_UNIT[free] }]); }}>+ Add a nutrient</button>
        </div>
      )}
    </div>
  );
}
