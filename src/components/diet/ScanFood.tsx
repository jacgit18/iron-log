import { useRef, useState } from 'react';
import { scanFoodDraft } from '../../lib/dietRecent.js';
import { DEFAULT_FOOD_TYPE } from '../../lib/foodType.js';
import { entryText } from '../../lib/dietLog.js';
import { FOOD_TYPE_LABEL, FOOD_TYPES } from '../../shared/recipes.js';
import { defaultGrams, hitLabel, type FoodHit } from '../../shared/foods.js';
import { ymd } from '../../shared/dates.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import type { FoodType } from '../../types.ts';
import './Diet.css';

// A scanned food (brief nutrition-quick-log): ask its Type and how much you ate, then create the food and log it in one step. The create-and-log runs once (a second tap or a retry finds it
// already done), so a food is never made or logged twice. `onDone` gets the sentence for the day's status line.
export default function ScanFood({ hit, day, onDone, onCancel }: { hit: FoodHit; day: string; onDone: (text: string) => void; onCancel: () => void }) {
  const today = ymd(useToday(s => s.today));
  const [type, setType] = useState<FoodType>(DEFAULT_FOOD_TYPE);
  const [grams, setGrams] = useState(String(defaultGrams(hit)));
  const [err, setErr] = useState('');
  const once = useRef(false);
  const draft = scanFoodDraft(hit, Number(grams), type);
  const go = () => {
    if (once.current) return;
    if (!draft) { setErr('Enter grams from 1 to 5000.'); return; }
    once.current = true;
    const st = useAppStore.getState();
    const bad = st.saveRecipe(draft.recipe);
    if (bad) { once.current = false; setErr(bad); return; }
    const made = useAppStore.getState().recipes.filter(r => r.n === draft.recipe.n && r.cat === 'ready').at(-1);
    const r = made && useAppStore.getState().addDietEntry({ d: day <= today ? day : today, n: made.n, kcal: draft.kcal, p: draft.p, ...(draft.c !== undefined ? { c: draft.c } : {}), ...(draft.f !== undefined ? { f: draft.f } : {}), from: made.id });
    if (!r || r.error) { onDone(`Saved ${draft.recipe.n} as a food. ${r?.error ?? 'It was not logged.'}`); onCancel(); return; }
    onDone(`Saved ${draft.recipe.n} as ${FOOD_TYPE_LABEL[type].toLowerCase()} and logged it.`);
    onCancel();
  };
  return (
    <div className="dt-lookuppick" role="group" aria-label="Scanned food">
      <p>{hitLabel(hit)}</p>
      <div className="seg" role="group" aria-label="Type">
        {FOOD_TYPES.map(t => <button key={t} type="button" className={type === t ? 'on' : ''} aria-pressed={type === t} onClick={() => setType(t)}>{FOOD_TYPE_LABEL[t]}</button>)}
      </div>
      <label className="field" htmlFor="dt-scanfood-g">Grams eaten
        <input id="dt-scanfood-g" type="number" inputMode="decimal" min="1" max="5000" step="any" value={grams} onChange={e => { setGrams(e.target.value); setErr(''); }} />
      </label>
      <p className="note" role="status">{draft ? entryText(draft) : 'Enter grams from 1 to 5000.'}</p>
      {err && <p className="note" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn sm primary" id="dt-scanfood-go" onClick={go}>Save and log it</button>
      </div>
    </div>
  );
}
