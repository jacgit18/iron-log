import type { EquipmentKey } from '../../types.ts';
import type { PhaseChoice } from '../../store/types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, EQUIPMENT, EQ_KEYS, EX, exInfo } from '../../lib/data.js';
import { MUSCLE_MAP, draftOfTags, tagsOfDraft } from '../../lib/muscles.js';
import MuscleChips from '../muscles/MuscleChips.jsx';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';

// Everything about one exercise in one place: name (your own exercises), video link, equipment, the phase it starts
// in on every card (a card's own saved or one-week phase still wins), 1RM and muscles. Without an exId it makes a
// new exercise for the library. Opened from a card's Details button and from the Exercise library.
export default function ExerciseSheet({ exId }: { exId: any }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const isNew = exId == null; const custom = isNew || !EX[exId];
  const info = isNew ? { n: '' } : exInfo(cfg, exId);
  const [d, setD] = useState<{ name: string; url: string; eq: EquipmentKey | ''; ph: PhaseChoice; rm: string }>(() => ({
    name: info.n, url: info.url || '', eq: info.eq || '',
    ph: (!isNew && cfg.exPh && cfg.exPh[exId]) || '', rm: !isNew && cfg.rm[exId] != null ? String(cfg.rm[exId]) : '',
  }));
  const [tags, setTags] = useState(() => (isNew ? { mob: false, st: {} } : draftOfTags(cfg, exId)));
  const [tagsTouched, setTagsTouched] = useState(false);
  const [err, setErr] = useState('');
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const hasOwnTags = !isNew && !!(cfg.muscleMap && cfg.muscleMap[exId]) && !!MUSCLE_MAP[exId];
  const submit = (e: any) => {
    e.preventDefault();
    const out = { ...d, ...(tagsTouched ? { tags: tagsOfDraft(tags) } : {}) };
    const msg = isNew ? st.createLibraryExercise(out) : st.saveExerciseDetails(exId, out);
    if (msg) setErr(msg);
  };
  const useDefaultTags = () => { const msg = st.saveExerciseDetails(exId, { ...d, tags: null }); if (msg) setErr(msg); };
  const remove = () => { const msg = st.deleteExercise(exId); if (msg) setErr(msg); };
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">{isNew ? 'New exercise' : info.n}</h2>
      {custom && <label className="field">Name<input value={d.name} maxLength={80} placeholder="e.g. Cable Lateral Raise" onChange={e => up({ name: e.target.value })} /></label>}
      <label className="field">Video link (optional)<input type="url" value={d.url} placeholder="https://" onChange={e => up({ url: e.target.value })} /></label>
      <div className="fields">
        <label className="field">Equipment
          <select value={d.eq} onChange={e => up({ eq: e.target.value as EquipmentKey | '' })}>
            <option value="">Not set</option>
            {EQ_KEYS.map(k => <option key={k} value={k}>{EQUIPMENT[k]}</option>)}
          </select>
        </label>
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
        <MuscleChips draft={tags} setDraft={(f: any) => { setTags(f); setTagsTouched(true); }} mobId="ex-mob" />
        {hasOwnTags && <button type="button" className="btn sm ghost" onClick={useDefaultTags}>Use default muscles</button>}
      </fieldset>
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        {!isNew && custom && <ArmedButton className="btn ghost" label="Delete exercise" armedLabel="Confirm delete" style={{ marginRight: 'auto' }} onConfirm={remove} />}
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
