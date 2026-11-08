import { useEffect, useRef, useState } from 'react';
import { filterSauces } from '../../lib/recipeSuggest.js';
import { MAX_INGREDIENTS } from '../../shared/recipes.js';
import type { Recipe } from '../../types.ts';
import './FoodPicker.css';

const numbers = (r: Recipe): string => (r.kcal !== undefined && r.p !== undefined ? `${r.kcal} kcal · ${r.p} g protein` : 'needs numbers');

// The "+ Food or meal" list under the ingredient rows (brief meals-from-foods): your own Foods first, then your Meals, A to Z, filtered as you type.
// Picking one adds a linked row with an amount; `onPick` answers a reason the link is refused (a loop, too deep), shown here. Like the Sauce picker.
export default function FoodPicker({ foods, meals, full, onPick, onClose }: { foods: Recipe[]; meals: Recipe[]; full: boolean; onPick: (part: Recipe) => string | null; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const shownFoods = filterSauces(foods, q), shownMeals = filterSauces(meals, q);
  const row = (r: Recipe, tag: string) => (
    <li key={r.id}>
      <button type="button" className="rc-saucerow" disabled={full} onClick={() => setErr(onPick(r) ?? '')}><b>{r.n}</b><span className="note">{numbers(r)}</span><span className="pill custom">{tag}</span></button>
    </li>
  );
  return (
    <div className="rc-sauces rc-foodpick" role="group" aria-label="Foods and meals" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      {foods.length + meals.length === 0
        ? <p className="note">You have no foods or meals yet. Add one from + New, then link it here.</p>
        : (
          <>
            <input ref={box} type="search" aria-label="Search your foods and meals" placeholder="Search your foods and meals" value={q} onChange={e => { setQ(e.target.value); setErr(''); }} autoComplete="off" />
            {full && <p className="note gerr" role="status">A recipe holds at most {MAX_INGREDIENTS} ingredients. Remove one to add another.</p>}
            {err && <p className="note gerr" role="alert">{err}</p>}
            {shownFoods.length + shownMeals.length === 0 && <p className="note" role="status">No food or meal matches.</p>}
            {shownFoods.length > 0 && <><h4 className="rc-foodhead">Foods</h4><ul className="rc-saucelist">{shownFoods.map(r => row(r, 'Food'))}</ul></>}
            {shownMeals.length > 0 && <><h4 className="rc-foodhead">Meals</h4><ul className="rc-saucelist">{shownMeals.map(r => row(r, 'Meal'))}</ul></>}
          </>
        )}
      <div className="rc-pickacts"><button type="button" className="btn" onClick={onClose}>Close</button></div>
    </div>
  );
}
