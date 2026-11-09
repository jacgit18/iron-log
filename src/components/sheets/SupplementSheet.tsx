import type { SupplementSlot } from '../../types.ts';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { afterSheetClose } from '../../lib/backNav.js';
import { SLOT_OPTIONS } from '../../lib/supplements.js';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';
import NutrientRows from '../supplements/NutrientRows.js';
import type { NutrientDraft } from '../supplements/NutrientRows.js';

// Add or edit a supplement in the library: name, dose, note, when it is on the schedule, and what is in one serving (the rows behind the Totals sheet).
// `backToManage`: it was opened from the library inside the Manage sheet, so closing it (saved, removed or cancelled) reopens that editor instead of leaving you on the board.
export default function SupplementSheet({ id, backToManage }: { id?: string | null; backToManage?: boolean }) {
  const s = useAppStore.getState();
  useEffect(() => () => { if (backToManage && useAppStore.getState().modal === null) afterSheetClose(window.history, window, () => useAppStore.getState().openModal({ type: 'nbmanage', view: 'editor' })); }, [backToManage]); // after the sheet's own Back step (lib/backNav.ts)
  const cur = id ? s.supp.items.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, n: cur ? cur.n : '', dose: cur ? cur.dose || '' : '', note: cur ? cur.note || '' : '', slot: cur ? cur.slot : 'morning', nutrients: (cur?.nutrients || []).map((r): NutrientDraft => ({ key: r.key, amount: String(r.amount), unit: r.unit })) }));
  const [err, setErr] = useState('');
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  return (
    <Sheet>
      <h2 className="cond">{cur ? (cur.catalogId ? cur.n : 'Edit supplement') : 'New supplement'}</h2>
      <form id="supp-form" noValidate onSubmit={e => { e.preventDefault(); const m = s.saveSupplement({ ...d, nutrients: d.nutrients.flatMap(r => (Number(r.amount) > 0 ? [{ key: r.key, amount: Number(r.amount), unit: r.unit }] : [])) }); if (m) setErr(m); }}>
        {cur?.catalogId
          ? <p className="note">From the catalog{cur.brand ? ` (${cur.brand})` : ''}: its name stays; the dose, schedule and note are yours.</p>
          : <label className="field">Name<input id="supp-name" maxLength={60} value={d.n} placeholder="e.g. Vitamin D3" onChange={e => up({ n: e.target.value })} /></label>}
        <label className="field">Dose (optional)<input maxLength={40} value={d.dose} placeholder="e.g. 2000 IU" onChange={e => up({ dose: e.target.value })} /></label>
        <label className="field">On the schedule
          <select value={d.slot} onChange={e => up({ slot: e.target.value as SupplementSlot })}>{SLOT_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="field">Note (optional)<input maxLength={200} value={d.note} placeholder="e.g. With food" onChange={e => up({ note: e.target.value })} /></label>
        <NutrientRows rows={d.nutrients} onChange={nutrients => up({ nutrients })} />
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
