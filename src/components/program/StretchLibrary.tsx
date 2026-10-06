import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { videoLabel } from '../../lib/data.js';
import { TIERS, tierLabel } from '../../lib/stretches.js';

// Every stretch, by group, with when it shows on the Stretches tab. What is set here is the routine on every day.
export default function StretchLibrary() {
  const items = useAppStore(s => s.stretches);
  const { openModal, moveStretch } = useAppStore.getState();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = items.filter(i => !needle || i.n.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle));
  return (
    <section className="panel edpanel exlib">
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 id="slib-h" tabIndex={-1}>Stretch library</h2>
        <button type="button" className="btn primary" id="slib-new" onClick={() => openModal({ type: 'stretch' })}>+ New stretch</button>
      </div>
      <p className="note">Your stretches. “Every day” ones are on the Stretches tab each day, “Once in a while” ones sit under them, and “Library only” ones are kept here to add later.</p>
      <div className="filterbar" role="search">
        <label className="field">Search<input type="search" value={q} placeholder="Name or group" onChange={e => setQ(e.target.value)} /></label>
        <span className="note" role="status">{needle ? `${shown.length} of ${items.length} stretches` : `${items.length} stretches`}</span>
      </div>
      <div className="exrows">
        {TIERS.map(([tier]) => {
          const rows = shown.filter(i => i.tier === tier);
          if (!rows.length) return null;
          return (
            <div key={tier || 'lib'}>
              <div className="sect">{tierLabel(tier)}</div>
              {rows.map(r => (
                <div className="exrow" key={r.id}>
                  <div className="exmain">
                    <b>{r.n}</b>
                    <span className="note">{r.group}{r.note ? ` · ${r.note}` : ''}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(r.url)}: ${r.n} (opens in a new tab)`}><span aria-hidden="true">▶ </span>{videoLabel(r.url)}</a>}
                  </div>
                  <div className="actions" style={{ margin: 0 }}>
                    {!needle && <>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} up`} onClick={() => moveStretch(r.id, -1)}><span aria-hidden="true">↑</span></button>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} down`} onClick={() => moveStretch(r.id, 1)}><span aria-hidden="true">↓</span></button>
                    </>}
                    <button type="button" className="btn sm" id={`slib-${r.id}`} aria-label={`Edit ${r.n}`} onClick={() => openModal({ type: 'stretch', id: r.id })}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {!shown.length && <p className="note">{items.length ? 'No stretch matches. Clear the search.' : 'No stretches yet. Add one with + New stretch.'}</p>}
      </div>
    </section>
  );
}
