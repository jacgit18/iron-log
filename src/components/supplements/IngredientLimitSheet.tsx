import { useState } from 'react';
import { NUTRIENT_UNITS } from '../../shared/nutrientKeys.js';
import type { NutrientUnit } from '../../shared/nutrientKeys.js';
import { labelOfKey } from '../../shared/supplementIngredients.js';
import { INGREDIENT_NOTE } from '../../lib/supplementIngredients.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './IngredientLimitSheet.css';

// "Set your limit" from a row of the Totals sheet (brief supplement-active-ingredients): your own daily target (aim for at least) or cap (stay under) for one ingredient, in g, mg, mcg or IU.
// A sheet, not a screen: it replaces the Totals sheet in the same history entry, has no address, and Save, Cancel and Remove limit all return to Totals. `unit` is the ingredient's unit on the Totals row.
export default function IngredientLimitSheet({ name, day, unit }: { name: string; day: string; unit: NutrientUnit }) {
  const cur = useAppStore.getState().cfg.ingredientLimits?.[name];
  const label = labelOfKey(name);
  const [kind, setKind] = useState<'target' | 'cap'>(cur?.kind ?? 'target');
  const [amount, setAmount] = useState(cur ? String(cur.amount) : '');
  const [u, setU] = useState<NutrientUnit>(cur?.unit ?? unit);
  const [err, setErr] = useState('');
  const back = () => useAppStore.getState().openModal({ type: 'nbsupptotals', day });
  const save = (e: { preventDefault(): void }) => { e.preventDefault(); const m = useAppStore.getState().setIngredientLimit(name, { kind, amount, unit: u }); if (m) setErr(m); else back(); };
  return (
    <Sheet as="form" noValidate onSubmit={save} aria-label={`Your limit for ${label}`}>
      <h2 className="cond">Your limit for {label}</h2>
      <p className="note">Your own number for one day, across all your supplements. Target is what you aim to reach; cap is what you want to stay under. No limit is built in.</p>
      <div className="seg" role="group" aria-label="Kind of limit">
        <button type="button" id="ilim-target" aria-pressed={kind === 'target'} className={kind === 'target' ? 'on' : ''} onClick={() => setKind('target')}>Target</button>
        <button type="button" id="ilim-cap" aria-pressed={kind === 'cap'} className={kind === 'cap' ? 'on' : ''} onClick={() => setKind('cap')}>Cap</button>
      </div>
      <p className="note">{kind === 'target' ? 'Target: aim for at least this much a day.' : 'Cap: stay under this much a day.'}</p>
      <div className="ilim-amt">
        <label className="field">Amount per day<input id="ilim-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={e => { setAmount(e.target.value); setErr(''); }} /></label>
        <label className="field">Unit<select id="ilim-unit" value={u} onChange={e => setU(e.target.value as NutrientUnit)}>{NUTRIENT_UNITS.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      </div>
      <p className="note" id="ilim-note">{INGREDIENT_NOTE}</p>
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        {cur && <button type="button" className="btn danger" id="ilim-remove" onClick={() => { useAppStore.getState().setIngredientLimit(name, null); back(); }}>Remove limit</button>}
        <button type="button" className="btn" id="ilim-cancel" onClick={back}>Cancel</button>
        <button type="submit" className="btn primary" id="ilim-save">Save</button>
      </div>
    </Sheet>
  );
}
