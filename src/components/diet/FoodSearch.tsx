import { useEffect, useState } from 'react';
import { cleanGrams, defaultGrams, hitLabel, scaleFood, type FoodHit } from '../../shared/foods.js';
import { useFoodHits } from './useFoodHits.js';
import './Diet.css';

/** What a pick fills into the entry form. */
export interface FoodFill { n: string; kcal: number; p: number; c?: number; f?: number }

// "Look up nutrition" (brief diet-food-lookup): type a few letters, pick a result from USDA FoodData Central, set the grams, and the entry form is filled in (still editable).
// One request at a time: a newer search cancels the older, and a late answer for old words is dropped. Nothing is stored here.
// With `text` given, the words come from another box (the "Search your past meals and recipes" box) and this shows only the results and the grams step.
export default function FoodSearch({ onUse, text: given }: { onUse: (fill: FoodFill) => void; text?: string }) {
  const [own, setText] = useState('');
  const text = given ?? own;
  const { hits, note } = useFoodHits(text);
  const [pick, setPick] = useState<FoodHit | null>(null);
  const [grams, setGrams] = useState('100');
  useEffect(() => { if (given !== undefined) setPick(null); }, [given]); // new words in the other box drop a pick made for the old ones

  const g = cleanGrams(grams);
  const scaled = pick && g !== null ? scaleFood(pick, g) : null;
  const choose = (h: FoodHit) => { setPick(h); setGrams(String(defaultGrams(h))); };
  const use = () => {
    if (!pick || !scaled) return;
    onUse({ n: pick.name.slice(0, 80), ...scaled });
    setPick(null); setText('');
  };

  return (
    <div className="dt-lookup">
      {given === undefined && (
        <label className="field" htmlFor="dt-lookup-q">Look up nutrition
          <input id="dt-lookup-q" type="search" autoComplete="off" maxLength={60} value={own} onChange={e => { setText(e.target.value); setPick(null); }} />
        </label>
      )}
      {note && <p className="note" role="status">{note}</p>}
      {hits.length > 0 && !pick && (
        <ul className="dt-recents" aria-label={given === undefined ? 'Lookup results' : 'Food database results'}>
          {hits.map(h => <li key={h.id}><button type="button" className="btn sm" onClick={() => choose(h)}>{hitLabel(h)}</button></li>)}
        </ul>
      )}
      {pick && (
        <div className="dt-lookuppick">
          <p>{hitLabel(pick)}</p>
          <label className="field" htmlFor={given === undefined ? 'dt-lookup-g' : 'dt-find-g'}>Grams
            <input id={given === undefined ? 'dt-lookup-g' : 'dt-find-g'} type="number" inputMode="decimal" min="1" max="5000" step="any" value={grams} onChange={e => setGrams(e.target.value)} />
          </label>
          <p className="note" role="status">{scaled ? `${scaled.kcal} kcal · ${scaled.p} g protein` : 'Enter grams from 1 to 5000.'}</p>
          <div className="actions">
            <button type="button" className="btn sm" onClick={() => setPick(null)}>Back</button>
            <button type="button" className="btn sm primary" disabled={!scaled} onClick={use}>Use</button>
          </div>
        </div>
      )}
    </div>
  );
}
