import type { PhaseKey } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, EQUIPMENT } from '../../lib/data.js';
import { eqName, eqOptions } from '../../lib/equipment.js';
import { MUSCLES, M_KEYS } from '../../lib/muscles.js';
import { libraryRows, filterRows, muscleList, hasTwoSources, keepCatalogItems } from '../../lib/exerciseLibrary.js';
import { isFiltering, resultText } from '../../lib/libraryFilter.js';
import { useExIdsInUse } from '../../hooks/useExIdsInUse.js';
import { progName } from '../../lib/logic.js';
import { videoLabel, isCatalogId, exInfo } from '../../lib/data.js';
import Icon from '../Icon.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import CatalogMatches from './CatalogMatches.jsx';
import LibraryChip from './LibraryChip.jsx';
import YourEquipment from './YourEquipment.jsx';
import './Library.css';

// Every exercise (from the library, and your own marked Custom) with what is set on it, searchable, edited in one sheet.
export default function ExerciseLibrary() {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs); const library = useAppStore(s => s.library);
  const experiments = useAppStore(s => s.experiments); const logs = useAppStore(s => s.logs);
  const { openModal } = useAppStore.getState();
  const syncing = useAppStore(s => s.sync !== null); // the catalog section below is there only when syncing (ADR 025)
  const inUse = useExIdsInUse(cfg);
  const [f, setF] = useState({ q: '', eq: '', muscle: '', src: '' });
  const rows = libraryRows(cfg, { programs, library, experiments, logs });
  const sources = hasTwoSources(rows); // synced, every exercise is your own until catalog items arrive (ADR 024, 027)
  const shown = filterRows(rows, sources ? f : { ...f, src: '' });
  const filtering = isFiltering(f);
  return (
    <section className="panel edpanel exlib">
      <div className="inline spread">
        <h2 id="exlib-h" tabIndex={-1}>Exercise library</h2>
        <div className="inline">
          <button type="button" className="btn primary" onClick={() => openModal({ type: 'exercise', exId: null })}>+ New exercise</button>
        </div>
      </div>
      <p className="note">Every exercise in one place. What you set on an exercise here applies to every card, day and week that uses it.</p>
      <YourEquipment />
      <div className="libbar" role="search">
        <input className="libsearch" type="search" aria-label="Search" value={f.q} placeholder={`Search ${rows.length} exercises`} onChange={e => setF(x => ({ ...x, q: e.target.value }))} />
        <div className="libchips">
          <LibraryChip label="Equipment" value={f.eq} onChange={v => setF(x => ({ ...x, eq: v }))}>
            <option value="">All equipment</option>
            {eqOptions(cfg).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value="none">Not set</option>
          </LibraryChip>
          <LibraryChip label="Muscle" value={f.muscle} onChange={v => setF(x => ({ ...x, muscle: v }))}>
            <option value="">All muscles</option>
            {M_KEYS.map(k => <option key={k} value={k}>{MUSCLES[k].n}</option>)}
            <option value="untagged">Not tagged yet</option>
          </LibraryChip>
          {sources && <LibraryChip label="Source" value={f.src} onChange={v => setF(x => ({ ...x, src: v }))}>
            <option value="">All sources</option>
            <option value="custom">Custom</option>
            <option value="library">Library</option>
          </LibraryChip>}
          {filtering && <button type="button" className="btn sm ghost" onClick={() => setF({ q: '', eq: '', muscle: '', src: '' })}>Clear</button>}
        </div>
        <span className="note" role="status">{resultText(shown.length, rows.length, filtering, 'exercises')}</span>
      </div>
      <RemovedNotice scope="exercises" />
      <div className="exrows">
        {shown.map(r => {
          const meta = [r.eq ? eqName(cfg, r.eq) : '', r.ph ? `Default: ${PHASES[r.ph as PhaseKey].label}` : '', r.rm ? `1RM ${r.rm} lb` : ''].filter(Boolean);
          const muscles = r.mob ? 'Mobility' : [r.p.length && `Primary: ${muscleList(r.p)}`, r.s.length && `Secondary: ${muscleList(r.s)}`].filter(Boolean).join(' · ');
          const where = r.inPrograms.length ? `In ${r.inPrograms.map(k => progName(cfg, k)).join(', ')}` : 'Not in a program';
          return (
            <div className="exrow" key={r.id}>
              <div className="exmain">
                <b>{r.name}{r.custom && <span className="pill custom" title="You created this exercise; it is not from the library">Custom</span>}{isCatalogId(r.id) && <span className="pill custom" title="Added from the catalog; what you change on it stays yours">Library</span>}</b>
                <span className="note">{[...meta, where].join(' · ')}</span>
                <span className="note">{muscles || 'No muscles tagged yet'}</span>
                {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(r.url)}: ${r.name} (opens in a new tab)`}><Icon name="play" />{' '}{videoLabel(r.url)}</a>}
              </div>
              <button type="button" className="btn sm" id={`exlib-${r.id}`} aria-label={`Edit ${r.name}`} onClick={() => openModal({ type: 'exercise', exId: r.id })}>Edit</button>
            </div>
          );
        })}
        {!shown.length && <p className="note">{syncing && f.q.trim() && f.src !== 'custom' ? 'None of yours match. Add one from the catalog below, or with + New exercise.' : 'No exercise matches. Clear the search, or add it with + New exercise.'}</p>}
      </div>
      {f.src !== 'custom' && (
        <CatalogMatches kind="exercise" q={f.q} unit="exercises" source="Exercises from free-exercise-db (public domain)."
          mine={[...rows.map(r => ({ id: r.id, name: r.name, ...(isCatalogId(r.id) ? { catalogId: r.id } : {}) })),
            ...inUse.filter(id => !rows.some(r => r.id === id)).map(id => ({ id, name: exInfo(cfg, id).n }))]}
          meta={c => [c.data.eq ? EQUIPMENT[c.data.eq] : '', c.data.muscles?.p?.length ? `Primary: ${muscleList(c.data.muscles.p)}` : ''].filter(Boolean).join(' · ')}
          narrow={items => keepCatalogItems(items, f)}
          onAdd={c => useAppStore.getState().addCatalogExercise(c)} />
      )}
    </section>
  );
}
