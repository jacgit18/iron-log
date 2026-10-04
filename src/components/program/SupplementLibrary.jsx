import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { SLOT_OPTIONS, slotLabel } from '../../lib/supplements.js';

// Every supplement you keep, with when it is on the Supplements tab. Library-only ones are kept to schedule later.
export default function SupplementLibrary() {
  const items = useAppStore(s => s.supp.items);
  const { openModal, moveSupplement } = useAppStore.getState();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = items.filter(i => !needle || i.n.toLowerCase().includes(needle));
  return (
    <section className="panel edpanel exlib">
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 id="suplib-h" tabIndex={-1}>Supplement library</h2>
        <button type="button" className="btn primary" id="suplib-new" onClick={() => openModal({ type: 'supplement' })}>+ New supplement</button>
      </div>
      <p className="note">Your supplements. Ones set to Morning, Noon or Night are on the Supplements tab every day; “Library only” ones are kept here to schedule later.</p>
      <div className="filterbar" role="search">
        <label className="field">Search<input type="search" value={q} placeholder="Name" onChange={e => setQ(e.target.value)} /></label>
        <span className="note" role="status">{needle ? `${shown.length} of ${items.length} supplements` : `${items.length} supplement${items.length === 1 ? '' : 's'}`}</span>
      </div>
      <div className="exrows">
        {SLOT_OPTIONS.map(([slot]) => {
          const rows = shown.filter(i => i.slot === slot);
          if (!rows.length) return null;
          return (
            <div key={slot || 'lib'}>
              <div className="sect">{slotLabel(slot)}</div>
              {rows.map(r => (
                <div className="exrow" key={r.id}>
                  <div className="exmain">
                    <b>{r.n}</b>
                    <span className="note">{[r.dose, r.note].filter(Boolean).join(' · ') || 'No dose or note'}</span>
                  </div>
                  <div className="actions" style={{ margin: 0 }}>
                    {!needle && <>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} up`} onClick={() => moveSupplement(r.id, -1)}><span aria-hidden="true">↑</span></button>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} down`} onClick={() => moveSupplement(r.id, 1)}><span aria-hidden="true">↓</span></button>
                    </>}
                    <button type="button" className="btn sm" id={`suplib-${r.id}`} aria-label={`Edit ${r.n}`} onClick={() => openModal({ type: 'supplement', id: r.id })}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {!shown.length && <p className="note">{items.length ? 'No supplement matches. Clear the search.' : 'No supplements yet. Add one with + New supplement.'}</p>}
      </div>
    </section>
  );
}
