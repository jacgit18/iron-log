import { useState } from 'react';
import { estimateServing } from '../../lib/recipeServing.js';
import { MAX_SERVING, MAX_SERVING_G } from '../../shared/recipes.js';
import './ServingSize.css';

// What one serving is (brief recipe-serving-size): words ("1 cup") and/or grams, typed, or worked out from the ingredients written in g, kg, oz or lb. Nothing is guessed.
export default function ServingSize({ serving, grams, ingredients, servings, onServing, onGrams }: {
  serving: string; grams: string; ingredients: { n: string; amt?: string; skip?: boolean }[]; servings: number;
  onServing: (v: string) => void; onGrams: (v: string) => void;
}) {
  const [note, setNote] = useState('');
  const estimate = () => {
    const e = estimateServing(ingredients, servings);
    if (e.grams !== null) onGrams(String(e.grams));
    setNote(e.note);
  };
  return (
    <div className="rc-serving">
      <label>Serving size<input value={serving} maxLength={MAX_SERVING} placeholder="e.g. 1 cup or 1 slice" onChange={e => onServing(e.target.value)} /></label>
      <label>Grams per serving<input inputMode="numeric" value={grams} placeholder={`1 to ${MAX_SERVING_G}`} onChange={e => onGrams(e.target.value)} /></label>
      <button type="button" className="btn sm" disabled={!ingredients.some(i => i.n.trim() && !i.skip)} onClick={estimate}>Estimate from ingredients</button>
      {note && <p className="note" role="status">{note}</p>}
    </div>
  );
}
