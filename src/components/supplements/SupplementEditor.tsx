import type { SupplementItem, SupplementSlot, Supplements, Taken } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { SLOTS, scheduled, scheduleOf, slotTally } from '../../lib/supplements.js';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import './Supplements.css';

function Slot({ slot, label, date, items, taken, editing }: { slot: SupplementSlot; label: string; date: string; items: SupplementItem[]; taken: Taken; editing: boolean }) {
  const s = useAppStore.getState();
  const [arming, setArming] = useState<string | null>(null); // the supplement whose Remove was pressed once
  const list = scheduleOf(items)[slot]; const t = slotTally(items, taken, date, slot);
  return (
    <section className={`sslot${t.full ? ' done' : ''}`} role="group" aria-labelledby={`supp-h-${slot}`}>
      <div className="sslothead">
        <h3 id={`supp-h-${slot}`}>{label}</h3>
        <span className="note">{t.total ? `${t.done}/${t.total}` : ''}</span>
      </div>
      <RemovedNotice scope={'suppslot:' + slot} />
      {!list.length && <p className="note">{editing ? 'Nothing here yet. Use + Add in your supplement library below.' : 'Nothing scheduled.'}</p>}
      <ul className="slist">
        {list.map(x => (
          <li key={x.id} className={`srow${(taken[date] || {})[x.id] ? ' taken' : ''}${arming === x.id ? ' removing' : ''}`}>
            <label className="stick">
              <input type="checkbox" className="chk" id={`supp-${x.id}`} checked={!!(taken[date] || {})[x.id]} onChange={e => s.setSupplementTaken(date, x.id, e.target.checked)} />
              <span className="sname"><span className="rmname">{x.n}</span>{x.dose && <span className="sdose">{x.dose}</span>}</span>
            </label>
            {editing && <ArmedButton className={`btn sm ${arming === x.id ? 'danger' : 'ghost'}`} aria-label={`Remove ${x.n} from ${label}`} label="Remove" armedLabel="Tap again to remove" onArmedChange={a => setArming(a ? x.id : null)} onConfirm={() => { setArming(null); s.removeSupplement(x.id); }} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

// The editor behind Edit supplements: every time of day with its add form, and the whole library under it. `date` is today (the ticks here are shown for today).
export function Schedule({ date, supp, editing }: { date: string; supp: Supplements; editing: boolean }) {
  const all = scheduled(supp.items); const done = all.filter(x => (supp.taken[date] || {})[x.id]).length;
  return (
    <section className="panel suppanel" aria-labelledby="sched-h">
      <div className="sstop">
        <h2 id="sched-h">Supplements</h2>
        <span className="sstopend"><span className="note" role="status">{all.length ? `${done} of ${all.length} taken` : ''}</span></span>
      </div>
      {!all.length && !editing && <p className="note">Nothing scheduled yet. Use Edit to add what you take in the morning, at noon and at night; Edit also shows your whole supplement list.</p>}
      {SLOTS.map(([k, l]) => <Slot key={k} slot={k} label={l} date={date} items={supp.items} taken={supp.taken} editing={editing} />)}
    </section>
  );
}
