import { useMemo, useState } from 'react';
import UsedAsChips from './UsedAsChips.js';
import { reviewUses, savedFromUses, untypedFoods } from '../../lib/foodType.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { FoodType, RecipeUse } from '../../types.ts';
import './FoodTypeReview.css';

const FOOD_USES: readonly RecipeUse[] = ['ingredient', 'ready', 'drink'];

// Review types (brief food-type-and-migration): the one-time screen for ready-made foods saved before types existed. Each row starts on the Used as labels its
// name suggests (eggs: Ingredient and Ready to eat); Looks right saves every row (a changed one with the person's choice) in one store action and the list offers Undo. Logic: lib/foodType.ts.
export default function FoodTypeReview({ onDone, onBack }: { onDone: (undo: () => boolean) => void; onBack: () => void }) {
  const recipes = useAppStore(s => s.recipes);
  const [picked, setPicked] = useState<Record<string, RecipeUse[]>>({});
  const foods = untypedFoods(recipes);
  const choices = useMemo(() => reviewUses(recipes, picked), [recipes, picked]);
  const save = () => {
    const types: Record<string, FoodType> = {}, uses: Record<string, RecipeUse[]> = {};
    for (const [id, u] of Object.entries(choices)) { const s = savedFromUses(u); types[id] = s.type; if (s.uses) uses[id] = s.uses; }
    onDone(useAppStore.getState().setFoodTypes(types, uses).undo);
  };
  return (
    <section className="panel" aria-labelledby="ftr-h">
      <button type="button" className="btn ghost" onClick={onBack}>Back to recipes</button>
      <h2 id="ftr-h" tabIndex={-1}>Review types</h2>
      <p className="note">We picked what each food is used as from its name. Change any that are wrong, then press Looks right.</p>
      {!foods.length && <p className="note" role="status">Every food has a type.</p>}
      <ul className="ftr-list">
        {foods.map(f => (
          <li key={f.id} className="ftr-row">
            <b>{f.n}</b>
            <UsedAsChips name={`Used as for ${f.n}`} value={choices[f.id] ?? []} options={FOOD_USES} onChange={next => setPicked({ ...picked, [f.id]: next })} />
          </li>
        ))}
      </ul>
      <div className="rc-actions rc-bar">
        <button type="button" className="btn primary" disabled={!foods.length} onClick={save}>Looks right</button>
      </div>
    </section>
  );
}
