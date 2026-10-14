import type { EquipmentId } from '../../types.ts';
import type { PhaseChoice } from '../../store/types.ts';
import { useRef, useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exInfo, isOwnExercise, isCatalogId } from '../../lib/data.js';
import { MUSCLE_MAP, draftOf, draftOfTags, tagsOfDraft } from '../../lib/muscles.js';
import { catalogSnapshot } from '../../lib/catalogExercise.js';
import { loadCatalog } from '../../sync/catalogCache.js';
import { signIn as devHeaders } from '../../sync/devUser.js';
import MuscleChips from '../muscles/MuscleChips.jsx';
import EquipmentField from '../EquipmentField.jsx';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';

// Everything about one exercise in one place: name (your own exercises), video link, equipment, the phase it starts
// in on every card (a card's own saved or one-week phase still wins), 1RM and muscles. Without an exId it makes a
// new exercise for the library. Opened from a card's Details button and from the Exercise library.
export default function ExerciseSheet({ exId }: { exId: string | null | undefined }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const isNew = exId == null; const custom = isNew || isOwnExercise(exId);
  const info = isNew ? { n: '' } : exInfo(cfg, exId);
  const [d, setD] = useState<{ name: string; url: string; eq: EquipmentId | ''; ph: PhaseChoice; rm: string }>(() => ({
    name: info.n, url: info.url || '', eq: info.eq || '',
    ph: (!isNew && cfg.exPh && cfg.exPh[exId]) || '', rm: !isNew && cfg.rm[exId] != null ? String(cfg.rm[exId]) : '',
  }));
  const [tags, setTags] = useState(() => (isNew ? { mob: false, st: {} } : draftOfTags(cfg, exId)));
  const [tagsTouched, setTagsTouched] = useState(false);
  const [err, setErr] = useState('');
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const hasOwnTags = !isNew && !!(cfg.muscleMap && cfg.muscleMap[exId]) && !!MUSCLE_MAP[exId];
  // A catalog exercise has no built-in default (MUSCLE_MAP), so Use default muscles stays hidden for it; syncing, its catalog tags can be
  // fetched again instead and put back in the chips, to keep with Save (ADR 026: the snapshot is yours, the catalog is read-only).
  const syncing = useAppStore(s => s.sync !== null);
  const fromCatalog = !isNew && isCatalogId(exId) && syncing;
  const [catNote, setCatNote] = useState('');
  const [catBusy, setCatBusy] = useState(false);
  const chipEdits = useRef(0); // counts chip taps, so a catalog answer arriving after one never overwrites it
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const out = { ...d, ...(tagsTouched ? { tags: tagsOfDraft(tags) } : {}) };
    const msg = isNew ? st.createLibraryExercise(out) : st.saveExerciseDetails(exId!, out);
    if (msg) setErr(msg);
  };
  const useDefaultTags = () => { const msg = st.saveExerciseDetails(exId!, { ...d, tags: null }); if (msg) setErr(msg); };
  const restoreCatalogTags = async () => {
    setCatNote('Looking it up in the catalog…'); setCatBusy(true);
    const edits = chipEdits.current;
    const r = await loadCatalog('exercise', devHeaders);
    setCatBusy(false);
    if (chipEdits.current !== edits) { setCatNote('Your changes to the muscles were kept. Tap Use catalog muscles again to replace them.'); return; }
    if (!r.ok) { setCatNote(r.reason === 'offline' ? 'The catalog needs a connection.' : r.reason === 'refused' ? 'The catalog is not available to this account.' : 'The catalog could not be loaded.'); return; }
    const item = r.items.find(c => c.id === exId);
    if (!item) { setCatNote('This exercise is no longer in the catalog.'); return; }
    const { tags: fromCat } = catalogSnapshot(item);
    setTags(draftOf(fromCat)); setTagsTouched(true);
    setCatNote(fromCat ? 'Catalog muscles filled in. Save to keep them.' : 'The catalog lists no muscles for this exercise, so none are picked. Save to keep that.');
  };
  const remove = () => { const msg = st.deleteExercise(exId!); if (msg) setErr(msg); };
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">{isNew ? 'New exercise' : info.n}</h2>
      {custom && <label className="field">Name<input value={d.name} maxLength={80} placeholder="e.g. Cable Lateral Raise" onChange={e => up({ name: e.target.value })} /></label>}
      <label className="field">Video link (optional)<input type="url" value={d.url} placeholder="https://" onChange={e => up({ url: e.target.value })} /></label>
      <div className="fields">
        <EquipmentField cfg={cfg} value={d.eq} onChange={eq => up({ eq })} />
        <label className="field">1RM (lb)
          <input type="number" inputMode="decimal" step="any" min="0" value={d.rm} placeholder="not set" onChange={e => up({ rm: e.target.value })} />
        </label>
      </div>
        <label className="field">Default phase for every card with this exercise
          <select value={d.ph ?? ''} onChange={e => up({ ph: e.target.value as PhaseChoice })}>
            <option value="">Use each card's own</option>
            {PH_KEYS.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
          </select>
        </label>
      <fieldset className="edit-item">
        <legend>Muscles</legend>
        <p className="note">Tap a muscle to cycle: not used → secondary → primary.</p>
        <MuscleChips draft={tags} setDraft={f => { setTags(f); setTagsTouched(true); chipEdits.current++; setCatNote(''); }} mobId="ex-mob" />
        {hasOwnTags && <button type="button" className="btn sm ghost" onClick={useDefaultTags}>Use default muscles</button>}
        {fromCatalog && <button type="button" className="btn sm ghost" id="ex-cat-tags" disabled={catBusy} onClick={() => void restoreCatalogTags()}>Use catalog muscles</button>}
        {catNote && <p className="note" role="status">{catNote}</p>}
      </fieldset>
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        {!isNew && custom && <ArmedButton className="btn ghost" label="Delete exercise" armedLabel="Tap again to delete" style={{ marginRight: 'auto' }} onConfirm={remove} />}
        {!isNew && isCatalogId(exId) && <ArmedButton className="btn ghost" label="Remove from library" armedLabel="Tap again to remove" style={{ marginRight: 'auto' }} onConfirm={remove} />}
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
