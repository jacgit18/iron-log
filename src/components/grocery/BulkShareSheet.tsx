import { useEffect, useState } from 'react';
import { applyBulkShare, emptyForm, packNote, restoreShareSnapshot, setNotMine, setReset, shareFromForm, sharedText, takeShareSnapshot, togglePerson } from '../../lib/groceryBulkShare.js';
import { allPeople } from '../../lib/grocerySettle.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import type { BulkApplied } from './BulkShare.js';
import './BulkShare.css';

// The Share sheet of Select mode (brief grocery-bulk-share): the same choices as the per-row chip, for every picked item. Pure rules in lib/groceryBulkShare.ts;
// this only holds the choices. Nothing is written before Apply.
export default function BulkShareSheet() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const g = useAppStore(s => s.grocery);
  const mk = String(modal?.mk ?? '');
  const ids = (modal?.ids as string[] | undefined) ?? [];
  const lines = useAppStore(s => s.groceryMonths[mk]?.lines);
  const [form, setForm] = useState(emptyForm);
  const [usual, setUsual] = useState(false); // off every time: the usual split changes only when this is ticked
  const people = allPeople(g);
  const live = ids.filter(id => g.items.some(i => i.id === id));
  const empty = !!modal && !live.length;
  useEffect(() => { if (empty) closeModal(); }, [empty, closeModal]); // every picked item is gone (another device removed them): close instead of leaving an open modal with no sheet
  if (!modal || empty) return null;
  const count = live.length;
  const words = `${count} ${count === 1 ? 'item' : 'items'}`;
  const note = packNote(live, lines ?? {});
  const apply = () => {
    const st = useAppStore.getState();
    if (st.blocked()) return; // sync is loading: a write now could not be undone
    const share = shareFromForm(form);
    const snap = takeShareSnapshot(mk, live, st.groceryMonths[mk]?.lines ?? {}, st.grocery.items);
    const done = applyBulkShare(st, () => useAppStore.getState().grocery.items, snap, share, usual && !form.reset);
    closeModal();
    (modal.onApplied as ((a: BulkApplied) => void) | undefined)?.({ text: sharedText(done, share), undo: () => restoreShareSnapshot(snap, useAppStore.getState()) });
  };
  return (
    <Sheet className="bssheet">
      <h2 className="cond">Share {words}</h2>
      <p className="note">Sets who shares these this month.</p>
      <div className="bslist" role="group" aria-label="Shared with">
        {people.map(p => (
          <label key={p.id} className="bsrowchk"><input type="checkbox" className="chk" checked={form.people.includes(p.id)} onChange={e => setForm(f => togglePerson(f, p.id, e.target.checked))} /> {p.n}</label>
        ))}
        <label className="bsrowchk"><input type="checkbox" className="chk" checked={form.notMine} disabled={!form.people.length} onChange={e => setForm(f => setNotMine(f, e.target.checked))} /> It’s not for me</label>
        <label className="bsrowchk"><input type="checkbox" className="chk" checked={form.reset} onChange={e => setForm(f => setReset(f, e.target.checked))} /> Use the usual split for these items</label>
      </div>
      {!form.reset && (
        <label className="bsrowchk"><input type="checkbox" className="chk" checked={usual} onChange={e => setUsual(e.target.checked)} /> <span>Also make this the usual split for these items<small className="bshint">Next month starts from it. Undo puts it back.</small></span></label>
      )}
      {note && <p className="note" role="status">{note}</p>}
      <div className="actions">
        <button type="button" className="btn" id="bs-cancel" onClick={closeModal}>Cancel</button>
        <button type="button" className="btn primary" id="bs-apply" onClick={apply}>{`Apply to ${count}`}</button>
      </div>
    </Sheet>
  );
}
