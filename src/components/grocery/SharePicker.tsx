import { useId } from 'react';
import { shareText } from '../../lib/grocerySettle.js';
import { ME } from '../../lib/grocerySplit.js';
import type { GroceryPerson, GroceryShare } from '../../types.ts';
import './SharePicker.css';

// Who shares one purchase with you. The button says it in a few words (Just me, Me +2, Not mine); opening it lists the people to tick.
// `parties` is who shares it now (from the store's group, the item or the line), `own` is whether it was chosen here rather than inherited,
// and "Use the usual" clears the choice. The list is only the people of the groups you have made, so with no groups this is never shown.
export default function SharePicker({ name, people, parties, own, onChange, hint, resetLabel = 'Use the usual' }: {
  name: string; people: GroceryPerson[]; parties: readonly string[]; own: boolean; onChange: (share: GroceryShare | null) => void; hint?: string; resetLabel?: string;
}) {
  const id = useId();
  const ticked = new Set(parties); const notMine = !ticked.has(ME);
  const others = parties.filter(p => p !== ME);
  const set = (next: string[], forThem: boolean) => onChange(next.length && forThem ? { with: next, notMine: true } : { with: next });
  const toggle = (pid: string, on: boolean) => set(on ? [...others, pid] : others.filter(x => x !== pid), notMine && (on || others.length > 1));
  return (
    <details className={`gshare${own ? ' own' : ''}`}>
      <summary aria-label={`Shared with, for ${name}: ${shareText(parties)}`}>{shareText(parties)}</summary>
      <div className="gsharebody" role="group" aria-labelledby={id}>
        <span className="gsharelab" id={id}>Shared with</span>
        {people.map(p => (
          <label key={p.id} className="gsharechk">
            <input type="checkbox" className="chk" checked={ticked.has(p.id)} onChange={e => toggle(p.id, e.target.checked)} /> {p.n}
          </label>
        ))}
        <label className="gsharechk">
          <input type="checkbox" className="chk" checked={notMine} disabled={!others.length} onChange={e => set(others, e.target.checked)} /> It’s not for me
        </label>
        {hint && <span className="note">{hint}</span>}
        {own && <button type="button" className="btn sm ghost" onClick={() => onChange(null)}>{resetLabel}</button>}
      </div>
    </details>
  );
}
