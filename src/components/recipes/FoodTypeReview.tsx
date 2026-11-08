import { useMemo, useState } from 'react';
import { FOOD_TYPES, FOOD_TYPE_LABEL } from '../../shared/recipes.js';
import { reviewChoices, untypedFoods } from '../../lib/foodType.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { FoodType } from '../../types.ts';
import './FoodTypeReview.css';

// Review types (brief food-type-and-migration): the one-time screen for ready-made foods saved before types existed. Each row starts on the Type its
// name suggests; Looks right saves every row (a changed one with the person's choice) in one store action and the list offers Undo. Logic: lib/foodType.ts.
export default function FoodTypeReview({ onDone, onBack }: { onDone: (undo: () => boolean) => void; onBack: () => void }) {
  const recipes = useAppStore(s => s.recipes);
  const [picked, setPicked] = useState<Record<string, FoodType>>({});
  const foods = untypedFoods(recipes);
  const choices = useMemo(() => reviewChoices(recipes, picked), [recipes, picked]);
  const save = () => { const r = useAppStore.getState().setFoodTypes(choices); onDone(r.undo); };
  return (
    <section className="panel" aria-labelledby="ftr-h">
      <button type="button" className="btn ghost" onClick={onBack}>Back to recipes</button>
      <h2 id="ftr-h" tabIndex={-1}>Review types</h2>
      <p className="note">We picked a type from each name. Change any that are wrong, then press Looks right.</p>
      {!foods.length && <p className="note" role="status">Every food has a type.</p>}
      <ul className="ftr-list">
        {foods.map(f => (
          <li key={f.id} className="ftr-row">
            <b>{f.n}</b>
            <div className="seg" role="group" aria-label={`Type of ${f.n}`}>
              {FOOD_TYPES.map(t => <button type="button" key={t} className={choices[f.id] === t ? 'on' : ''} aria-pressed={choices[f.id] === t} onClick={() => setPicked({ ...picked, [f.id]: t })}>{FOOD_TYPE_LABEL[t]}</button>)}
            </div>
          </li>
        ))}
      </ul>
      <div className="rc-actions rc-bar">
        <button type="button" className="btn primary" disabled={!foods.length} onClick={save}>Looks right</button>
      </div>
    </section>
  );
}
