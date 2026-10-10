import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { warmupOf } from '../../lib/data.js';
import { isStretchDone, warmKey } from '../../lib/stretches.js';

// The day's warm-up, at the top of each Stretches day: tick items off, and add or remove them (the list is shared by every day and program).
export default function WarmUp({ d }: { d: number }) {
  const cfg = useAppStore(s => s.cfg);
  const week = useAppStore(s => s.strWeek);
  const st = useAppStore.getState();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(''); const [rx, setRx] = useState('');
  const items = warmupOf(cfg);
  const add = (e: FormEvent) => { e.preventDefault(); if (st.addWarmup(name, rx)) { setName(''); setRx(''); } };
  return (
    <div className="warm">
      <div className="warmhead">
        <span className="tag">Warm-up</span>
        <button type="button" className="btn sm ghost" id={`warmedit-${d}`} aria-pressed={editing} onClick={() => setEditing(v => !v)}>{editing ? 'Done' : 'Edit'}</button>
      </div>
      {items.length === 0 && <p className="note">No warm-up items. Use Edit to add one.</p>}
      {items.map(x => (
        <div key={x.id} className="warmrow">
          <label>
            <input type="checkbox" className="chk" id={`warm-${d}-${x.id}`} checked={isStretchDone(week, d, warmKey(x.id))} onChange={e => st.setStretchDone(d, warmKey(x.id), e.target.checked)} />
            {x.n} {x.rx && <span className="rx">· {x.rx}</span>}
          </label>
          {editing && <button type="button" className="btn sm ghost" id={`warmdel-${d}-${x.id}`} aria-label={`Remove ${x.n} from the warm-up`} onClick={() => st.removeWarmup(x.id)}>Remove</button>}
        </div>
      ))}
      {editing && (
        <form className="warmadd" onSubmit={add}>
          <input type="text" id={`warmname-${d}`} aria-label="Warm-up exercise name" placeholder="Exercise" maxLength={60} value={name} onChange={e => setName(e.target.value)} />
          <input type="text" id={`warmrx-${d}`} aria-label="Sets, reps or time (optional)" placeholder="1 × 3 (optional)" maxLength={40} value={rx} onChange={e => setRx(e.target.value)} />
          <button type="submit" className="btn sm" id={`warmadd-${d}`} disabled={!name.trim()}>Add</button>
        </form>
      )}
    </div>
  );
}
