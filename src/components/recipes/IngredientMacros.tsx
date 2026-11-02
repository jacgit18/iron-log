import { useState } from 'react';
import { gramsOf, rowGrams, servingsFor, totals, totalsNote, type MacroRow } from '../../lib/recipeMacros.js';
import { defaultGrams, hitLabel, scaleFood, type FoodHit } from '../../shared/foods.js';
import { useFoodHits } from '../diet/useFoodHits.js';
import './IngredientMacros.css';

/** The recipe's numbers per serving, ready for the form's four fields. */
export interface PerServing { kcal: number; p: number; c?: number; f?: number }
interface Ing { n: string; amt?: string; skip?: true }
interface Pick { hit: FoodHit | null; typed: string; open: boolean }

// One ingredient: its grams (read from the amount, or typed), and a Look up that searches the food database only when asked, so a long recipe does not spend the day's searches on opening the panel.
function Row({ idx, ing, pick, onPick }: { idx: number; ing: Ing; pick: Pick; onPick: (p: Pick) => void }) {
  const [text, setText] = useState(ing.n);
  const { hits, note } = useFoodHits(text, pick.open);
  const auto = gramsOf(ing.amt);
  const grams = rowGrams(ing.amt, pick.typed);
  const choose = (h: FoodHit) => onPick({ hit: h, typed: pick.typed || (auto === null ? String(defaultGrams(h)) : ''), open: false });
  const got = pick.hit && grams !== null ? scaleFood(pick.hit, grams) : null;
  return (
    <li className="rc-calcrow">
      <p className="rc-calcname">{ing.n}{ing.amt ? ` · ${ing.amt}` : ''}</p>
      <label className="rc-calcgrams">Grams
        <input aria-label={`Grams for ${ing.n}`} inputMode="decimal" value={pick.typed} placeholder={auto !== null ? String(auto) : 'grams'} onChange={e => onPick({ ...pick, typed: e.target.value })} />
      </label>
      {!pick.open && <button type="button" className="btn sm" aria-label={`Look up ${ing.n}`} onClick={() => onPick({ ...pick, open: true })}>{pick.hit ? 'Change' : 'Look up'}</button>}
      {pick.hit && <p className="note">{pick.hit.name}{got ? ` · ${got.kcal} kcal · ${got.p} g protein` : ' · enter grams'}</p>}
      {pick.open && (
        <div className="rc-calcfind">
          <label className="field" htmlFor={`rc-calc-q-${idx}`}>Search for {ing.n}
            <input id={`rc-calc-q-${idx}`} type="search" autoComplete="off" maxLength={60} value={text} onChange={e => setText(e.target.value)} />
          </label>
          {note && <p className="note" role="status">{note}</p>}
          {hits.length > 0 && <ul className="rc-calchits" aria-label={`Foods for ${ing.n}`}>{hits.map(h => <li key={h.id}><button type="button" className="btn sm" onClick={() => choose(h)}>{hitLabel(h)}</button></li>)}</ul>}
          <button type="button" className="btn sm" onClick={() => onPick({ ...pick, open: false })}>Done</button>
        </div>
      )}
    </li>
  );
}

// "Calculate from ingredients" (brief recipe-ingredient-macros): pick a food for each ingredient, and the recipe's calories, protein, carbs and fat per serving are added up for the form's four fields.
// Nothing here is saved: the form is only changed by Use these numbers, and the recipe only by Save recipe.
export default function IngredientMacros({ ingredients, servings, onUse, onClose }: { ingredients: Ing[]; servings: string; onUse: (per: PerServing) => void; onClose: () => void }) {
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const rows = ingredients.filter(i => i.n.trim() && !i.skip);
  // Keyed by position and name, so removing or renaming an ingredient drops its pick instead of giving it to another.
  const keyOf = (i: number) => `${i}:${rows[i]!.n}`;
  const pickOf = (i: number): Pick => picks[keyOf(i)] ?? { hit: null, typed: '', open: false };
  const macroRows: MacroRow[] = rows.map((r, i) => ({ name: r.n, grams: rowGrams(r.amt, pickOf(i).typed), hit: pickOf(i).hit }));
  const s = servingsFor(servings);
  const t = totals(macroRows, s.servings);
  return (
    <section className="rc-calc" aria-label="Calculate from ingredients">
      <ul className="rc-calclist">
        {rows.map((r, i) => <Row key={keyOf(i)} idx={i} ing={r} pick={pickOf(i)} onPick={p => setPicks(old => ({ ...old, [keyOf(i)]: p }))} />)}
      </ul>
      <p className="rc-calctotal" role="status">
        Per serving{s.assumed ? ' (Servings is empty, so 1)' : ` (÷ ${s.servings})`}: {t.per.kcal} kcal · {t.per.p} g protein{t.per.c !== undefined ? ` · ${t.per.c} g carbs` : ''}{t.per.f !== undefined ? ` · ${t.per.f} g fat` : ''}
      </p>
      <p className="note">{totalsNote(t)}</p>
      <div className="actions">
        <button type="button" className="btn sm" onClick={onClose}>Close</button>
        <button type="button" className="btn sm primary" disabled={t.counted === 0} onClick={() => onUse(t.per)}>Use these numbers</button>
      </div>
    </section>
  );
}
