import type { CatalogItem, EquipmentKey } from '../../types.ts';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { EQUIPMENT, EQ_KEYS } from '../../lib/data.js';
import { muscleList } from '../../lib/exerciseLibrary.js';
import { fetchCatalog, type CatalogResult } from '../../sync/catalog.js';
import { signIn as devHeaders } from '../../sync/devUser.js';
import Sheet from '../Sheet.jsx';

const PAGE = 50;
const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// What each list's sheet says, and how it adds an item.
const KINDS = {
  exercise: { title: 'Exercise catalog', intro: 'Add an exercise to your library.', unit: 'exercises', none: 'No exercise matches. Add it as your own with + New exercise.', added: 'In your library' },
  stretch: { title: 'Stretch catalog', intro: 'Add a stretch to your library (Library only; edit it to put it on a day).', unit: 'stretches', none: 'No stretch matches. Add it as your own with + New stretch.', added: 'In your stretches' },
} as const;

// Browse the shared catalog of exercises or stretches and add one to your own list (ADR 025, 026, 027). It needs a connection; what you
// add is copied into your own data, so the board, the Stretches tab and the logs never need the catalog again.
export default function CatalogSheet({ kind = 'exercise' }: { kind?: 'exercise' | 'stretch' }) {
  const K = KINDS[kind];
  const cfg = useAppStore(s => s.cfg);
  const stretches = useAppStore(s => s.stretches);
  const { addCatalogExercise, addCatalogStretch, closeModal } = useAppStore.getState();
  const isAdded = (id: string) => (kind === 'exercise' ? !!cfg.ex[id] : stretches.some(x => x.catalogId === id));
  const [res, setRes] = useState<CatalogResult | null>(null);
  const [q, setQ] = useState(''); const [eq, setEq] = useState('');
  const [shownCount, setShownCount] = useState(PAGE);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    void fetchCatalog(kind, devHeaders).then(r => { if (live) setRes(r); });
    return () => { live = false; };
  }, [tries, kind]);

  const items = res?.ok ? res.items : [];
  const k = nameKey(q);
  const matches = items.filter(it => (!k || nameKey(it.name).includes(k)) && (!eq || (eq === 'none' ? !it.data.eq : it.data.eq === eq)));
  const shown = matches.slice(0, shownCount);
  const add = (it: CatalogItem) => {
    const err = kind === 'exercise' ? addCatalogExercise(it) : addCatalogStretch(it);
    setErrs(e => ({ ...e, [it.id]: err || '' }));
  };

  return (
    <Sheet className="catalog">
      <h2 className="cond">{K.title}</h2>
      <p className="note">{K.intro} It is copied into your data, so it works offline once added; what you change on it stays yours.</p>
      {!res && <p className="note" role="status">Loading the catalog…</p>}
      {res && !res.ok && (
        <div role="alert">
          <p className="note err">{res.reason === 'offline' ? 'Browsing the catalog needs a connection.' : res.reason === 'refused' ? 'The catalog is not available to this account.' : 'The catalog could not be loaded.'}</p>
          {res.reason !== 'refused' && <button type="button" className="btn sm" onClick={() => { setRes(null); setTries(t => t + 1); }}>Try again</button>}
        </div>
      )}
      {res?.ok && <>
        <div className="filterbar" role="search">
          <label className="field">Search<input type="search" value={q} placeholder="Name" onChange={e => { setQ(e.target.value); setShownCount(PAGE); }} /></label>
          <label className="field">Equipment
            <select value={eq} onChange={e => { setEq(e.target.value); setShownCount(PAGE); }}>
              <option value="">All equipment</option>
              {EQ_KEYS.map(key => <option key={key} value={key}>{EQUIPMENT[key]}</option>)}
              <option value="none">Not set</option>
            </select>
          </label>
          <span className="note" role="status">{matches.length === items.length ? `${items.length} ${K.unit}` : `${matches.length} of ${items.length} ${K.unit}`}</span>
        </div>
        <div className="exrows">
          {shown.map(it => {
            const added = isAdded(it.id);
            const m = it.data.muscles || {};
            const meta = [it.data.eq ? EQUIPMENT[it.data.eq as EquipmentKey] : '', m.p?.length ? `Primary: ${muscleList(m.p)}` : '', m.s?.length ? `Secondary: ${muscleList(m.s)}` : '', it.data.level || ''].filter(Boolean);
            return (
              <div className="exrow" key={it.id}>
                <div className="exmain">
                  <b>{it.name}</b>
                  {meta.length > 0 && <span className="note">{meta.join(' · ')}</span>}
                  {errs[it.id] && <span className="note err" role="alert">{errs[it.id]}</span>}
                </div>
                {added
                  ? <span className="note">{K.added}</span>
                  : <button type="button" className="btn sm" aria-label={`Add ${it.name}`} onClick={() => add(it)}>Add</button>}
              </div>
            );
          })}
          {!matches.length && <p className="note">{K.none}</p>}
        </div>
        {matches.length > shown.length && <button type="button" className="btn sm ghost" onClick={() => setShownCount(n => n + PAGE)}>Show more ({matches.length - shown.length} left)</button>}
        <p className="note">{kind === 'exercise' ? 'Exercises' : 'Stretches'} from free-exercise-db (public domain).</p>
      </>}
      <div className="actions">
        <button type="button" className="btn" onClick={closeModal}>Done</button>
      </div>
    </Sheet>
  );
}
