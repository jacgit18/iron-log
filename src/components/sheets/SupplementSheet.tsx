import type { SupplementSlot } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { SLOT_OPTIONS } from '../../lib/supplements.js';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';

// Add or edit a supplement in the library: name, dose, note, and when it is on the schedule.
export default function SupplementSheet({ id }: { id: any }) {
  const s = useAppStore.getState();
  const cur = id ? s.supp.items.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, n: cur ? cur.n : '', dose: cur ? cur.dose || '' : '', note: cur ? cur.note || '' : '', slot: cur ? cur.slot : 'morning' }));
  const [err, setErr] = useState('');
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  return (
    <Sheet>
      <h2 className="cond">{cur ? 'Edit supplement' : 'New supplement'}</h2>
      <form id="supp-form" noValidate onSubmit={e => { e.preventDefault(); const m = s.saveSupplement(d); if (m) setErr(m); }}>
        <label className="field">Name<input id="supp-name" maxLength={60} value={d.n} placeholder="e.g. Vitamin D3" onChange={e => up({ n: e.target.value })} /></label>
        <label className="field">Dose (optional)<input maxLength={40} value={d.dose} placeholder="e.g. 2000 IU" onChange={e => up({ dose: e.target.value })} /></label>
        <label className="field">On the schedule
          <select value={d.slot} onChange={e => up({ slot: e.target.value as SupplementSlot })}>{SLOT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="field">Note (optional)<input maxLength={200} value={d.note} placeholder="e.g. With food" onChange={e => up({ note: e.target.value })} /></label>
        {err && <p className="note err" role="alert">{err}</p>}
      </form>
      <div className="actions">
        {cur && <ArmedButton className="btn danger" label="Delete" armedLabel="Tap again to delete" onConfirm={() => s.deleteSupplement(cur.id)} />}
        <button type="button" className="btn" onClick={s.closeModal}>Cancel</button>
        <button type="submit" form="supp-form" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
