import { useState } from 'react';
import { MAX_PAIRS } from '../../shared/recipes.js';
import { mealPairError, pairCandidates, pairsOf } from '../../lib/recipePairs.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe } from '../../types.ts';
import ArmedButton from '../ArmedButton.jsx';
import './GoesWith.css';

// "Goes with" (brief recipes-goes-with): the recipes this one is eaten with (chili with rice), saved on both. Each partner opens, can be turned into a meal
// with this one, or taken off. Only a recipe of yours has it. Rules: lib/recipePairs.ts.
export default function GoesWith({ recipe, mine, onOpen }: { recipe: Recipe; mine: boolean; onOpen?: (id: string) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const [msg, setMsg] = useState('');
  const live = recipes.find(r => r.id === recipe.id);
  if (!mine || !live) return null;
  const partners = pairsOf(live, recipes), options = pairCandidates(live, recipes), full = partners.length >= MAX_PAIRS;
  const make = (b: Recipe) => {
    const r = useAppStore.getState().makeMealFromPair(live.id, b.id);
    if ('error' in r) setMsg(r.error); else { setMsg(''); onOpen?.(r.id); }
  };
  return (
    <section className="rc-goes" aria-labelledby="rc-goes-h">
      <h3 id="rc-goes-h">Goes with</h3>
      {partners.length === 0 && <p className="note">Nothing yet. Say what you eat this with, like rice with chili.</p>}
      <ul className="rc-goeslist">
        {partners.map(p => (
          <li key={p.id}>
            <button type="button" className="btn sm ghost rc-goesname" onClick={() => onOpen?.(p.id)}>{p.n}</button>
            {!mealPairError(live, p) && <button type="button" className="rc-goesmake" aria-label={`Make a meal of ${live.n} with ${p.n}`} onClick={() => make(p)}>Make a meal</button>}
            <ArmedButton className="btn sm ghost" aria-label={`Remove ${p.n} from Goes with`} label="Remove" armedLabel="Tap again to remove" onConfirm={() => { useAppStore.getState().unpairRecipes(live.id, p.id); setMsg(''); }} />
          </li>
        ))}
      </ul>
      {!full && options.length > 0 && (
        <select aria-label="Add a recipe it goes with" value="" onChange={e => { if (e.target.value) setMsg(useAppStore.getState().pairRecipes(live.id, e.target.value) ?? ''); }}>
          <option value="">Add a recipe it goes with…</option>
          {options.map(o => <option key={o.id} value={o.id}>{o.n}</option>)}
        </select>
      )}
      {full && <p className="note">It goes with {MAX_PAIRS} recipes. Remove one to add another.</p>}
      <p className="note" role="status">{msg}</p>
    </section>
  );
}
