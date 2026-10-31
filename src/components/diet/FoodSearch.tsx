import { useState } from 'react';
import { cleanGrams, defaultGrams, hitLabel, scaleFood, type FoodHit } from '../../shared/foods.js';
import { useFoodHits } from './useFoodHits.js';
import './Diet.css';

/** What a pick fills into the entry form. */
export interface FoodFill { n: string; kcal: number; p: number; c?: number; f?: number }

// "Look up nutrition" (brief diet-food-lookup): type a few letters, pick a result from USDA FoodData Central, set the grams, and the entry form is filled in (still editable).
// One request at a time: a newer search cancels the older, and a late answer for old words is dropped. Nothing is stored here.
export default function FoodSearch({ onUse }: { onUse: (fill: FoodFill) => void }) {
  const [text, setText] = useState('');
  const { hits, note } = useFoodHits(text);
  const [pick, setPick] = useState<FoodHit | null>(null);
  const [grams, setGrams] = useState('100');

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
      <label className="field" htmlFor="dt-lookup-q">Look up nutrition
        <input id="dt-lookup-q" type="search" autoComplete="off" maxLength={60} value={text} onChange={e => { setText(e.target.value); setPick(null); }} />
      </label>
      {note && <p className="note" role="status">{note}</p>}
      {hits.length > 0 && !pick && (
        <ul className="dt-recents" aria-label="Lookup results">
          {hits.map(h => <li key={h.id}><button type="button" className="btn sm" onClick={() => choose(h)}>{hitLabel(h)}</button></li>)}
        </ul>
      )}
      {pick && (
        <div className="dt-lookuppick">
          <p>{hitLabel(pick)}</p>
          <label className="field" htmlFor="dt-lookup-g">Grams
            <input id="dt-lookup-g" type="number" inputMode="decimal" min="1" max="5000" step="any" value={grams} onChange={e => setGrams(e.target.value)} />
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
