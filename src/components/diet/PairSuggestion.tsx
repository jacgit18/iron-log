import { useState } from 'react';
import { ateEntry, entryText } from '../../lib/dietLog.js';
import { amountText, usualStart } from '../../lib/foodUnit.js';
import { runInstantLog } from '../../lib/instantLog.js';
import { suggestedPartners } from '../../lib/pairSuggestions.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Recipe } from '../../types.ts';

// After a food is logged (the Log sheet and the log control): what goes with it, one tap each at its usual amount on the same day, with Undo (brief recipes-goes-with, part 3).
export default function PairSuggestion({ recipe, day, today }: { recipe: Recipe; day: string; today: string }) {
  const recipes = useAppStore(s => s.recipes);
  const [added, setAdded] = useState<Record<string, string>>({}); // partner id -> the entry it made
  const [err, setErr] = useState('');
  const partners = suggestedPartners(recipe, recipes);
  if (!partners.length) return null;
  const add = (p: Recipe) => {
    const made = ateEntry(p, usualStart(p), day, today);
    if ('error' in made) { setErr(made.error); return; }
    const r = runInstantLog(useAppStore.getState().addDietEntry, [made.entry]);
    if (r.error) { setErr(r.error); return; }
    setErr(''); setAdded(a => ({ ...a, [p.id]: r.ids[0]! }));
  };
  const undo = (p: Recipe) => { useAppStore.getState().removeDietEntry(added[p.id]!, false); setAdded(({ [p.id]: _gone, ...rest }) => rest); };
  return (
    <div className="dt-pair" role="group" aria-label="Goes with it">
      <span className="note">Goes with it:</span>
      {partners.map(p => added[p.id] ? (
        <span key={p.id} className="note" role="status">Logged {amountText(usualStart(p), p)} of {p.n}. <button type="button" className="btn sm ghost" aria-label={`Undo ${p.n}`} onClick={() => undo(p)}>Undo</button></span>
      ) : (
        <button type="button" key={p.id} className="btn sm" aria-label={`+ ${p.n}, also log it`} title={entryText({ kcal: p.kcal!, p: p.p!, c: p.c, f: p.f })} onClick={() => add(p)}>+ {p.n}</button>
      ))}
      {err && <p className="note" role="alert">{err}</p>}
    </div>
  );
}
