import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, EQUIPMENT, EQ_KEYS } from '../../lib/data.js';
import { MUSCLES, M_KEYS } from '../../lib/muscles.js';
import { libraryRows, filterRows, muscleList } from '../../lib/exerciseLibrary.js';
import { progName } from '../../lib/logic.js';
import { videoLabel } from '../../lib/data.js';

// Every exercise (built in and your own) with what is set on it, searchable, edited in one sheet.
export default function ExerciseLibrary() {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs); const library = useAppStore(s => s.library);
  const experiments = useAppStore(s => s.experiments); const logs = useAppStore(s => s.logs);
  const { openModal } = useAppStore.getState();
  const [f, setF] = useState({ q: '', eq: '', muscle: '' });
  const rows = libraryRows(cfg, { programs, library, experiments, logs });
  const shown = filterRows(rows, f);
  const filtering = !!(f.q || f.eq || f.muscle);
  return (
    <section className="panel edpanel exlib">
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 id="exlib-h" tabIndex={-1}>Exercise library</h2>
        <button type="button" className="btn primary" onClick={() => openModal({ type: 'exercise', exId: null })}>+ New exercise</button>
      </div>
      <p className="note">Every exercise in one place. What you set on an exercise here applies to every card, day and week that uses it.</p>
      <div className="filterbar" role="search">
        <label className="field">Search<input type="search" value={f.q} placeholder="Name" onChange={e => setF(x => ({ ...x, q: e.target.value }))} /></label>
        <label className="field">Equipment
          <select value={f.eq} onChange={e => setF(x => ({ ...x, eq: e.target.value }))}>
            <option value="">All equipment</option>
            {EQ_KEYS.map(k => <option key={k} value={k}>{EQUIPMENT[k]}</option>)}
            <option value="none">Not set</option>
          </select>
        </label>
        <label className="field">Muscle
          <select value={f.muscle} onChange={e => setF(x => ({ ...x, muscle: e.target.value }))}>
            <option value="">All muscles</option>
            {M_KEYS.map(k => <option key={k} value={k}>{MUSCLES[k].n}</option>)}
            <option value="untagged">Not tagged yet</option>
          </select>
        </label>
        {filtering && <button type="button" className="btn sm ghost" onClick={() => setF({ q: '', eq: '', muscle: '' })}>Clear</button>}
        <span className="note" role="status">{filtering ? `${shown.length} of ${rows.length} exercises` : `${rows.length} exercises`}</span>
      </div>
      <div className="exrows">
        {shown.map(r => {
          const meta = [r.eq ? EQUIPMENT[r.eq] : '', r.ph ? `Default: ${PHASES[r.ph].label}` : '', r.rm ? `1RM ${r.rm} lb` : ''].filter(Boolean);
          const muscles = r.mob ? 'Mobility' : [r.p.length && `Primary: ${muscleList(r.p)}`, r.s.length && `Secondary: ${muscleList(r.s)}`].filter(Boolean).join(' · ');
          const where = r.inPrograms.length ? `In ${r.inPrograms.map(k => progName(cfg, k)).join(', ')}` : 'Not in a program';
          return (
            <div className="exrow" key={r.id}>
              <div className="exmain">
                <b>{r.name}</b>
                <span className="note">{[...meta, where].join(' · ')}</span>
                <span className="note">{muscles || 'No muscles tagged yet'}</span>
                {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(r.url)}: ${r.name} (opens in a new tab)`}><span aria-hidden="true">▶ </span>{videoLabel(r.url)}</a>}
              </div>
              <button type="button" className="btn sm" id={`exlib-${r.id}`} aria-label={`Edit ${r.name}`} onClick={() => openModal({ type: 'exercise', exId: r.id })}>Edit</button>
            </div>
          );
        })}
        {!shown.length && <p className="note">No exercise matches. Clear the search, or add it with + New exercise.</p>}
      </div>
    </section>
  );
}
