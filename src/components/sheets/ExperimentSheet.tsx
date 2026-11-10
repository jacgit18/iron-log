import type { CatalogItem, EquipmentId } from '../../types.ts';
import type { PhaseChoice } from '../../store/types.ts';
import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exInfo, findExId } from '../../lib/data.js';
import { shownNote } from '../../lib/exerciseNote.js';
import { pickedChoice } from '../../lib/catalogExercise.js';
import Sheet from '../Sheet.jsx';
import ExerciseField from '../ExerciseField.jsx';
import LiftGoal from '../progress/LiftGoal.jsx';

// Add or edit an entry on the Experiment board: one exercise, a phase and a note, plus a weight goal for it.
export default function ExperimentSheet({ id }: { id?: string | null }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const cur = id ? st.experiments.find(x => x.id === id) : null;
  const [d, setD] = useState<{ id?: string; name: string; nu: string; ne?: EquipmentId | ''; ph: PhaseChoice; note: string; nt?: boolean; cat?: CatalogItem | null }>(() => ({ id: cur ? cur.id : undefined, name: cur ? exInfo(cfg, cur.ex).n : '', nu: '', ph: cur ? cur.ph : 'strength', note: cur ? shownNote(cfg, cur.ex, cur.note) : '' }));
  const [err, setErr] = useState('');
  const exId = findExId(cfg, d.name); // goals belong to the exercise, so they can be set before it's ever logged
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const submit = (e: FormEvent) => { e.preventDefault(); const msg = st.saveExperiment({ id: d.id, ...pickedChoice(cfg, d.name, d.cat), nu: d.nu.trim(), ne: d.ne, ph: d.ph, note: d.note.trim() }); if (msg) setErr(msg); };
  return (
    <Sheet>
      <h2 className="cond">{cur ? 'Edit idea' : 'Add an exercise to try'}</h2>
      <form id="exp-form" noValidate onSubmit={submit}>
      <ExerciseField cfg={cfg} id="exp-ex" name={d.name} url={d.nu} eq={d.ne} onName={(name) => { const k = findExId(cfg, name); up({ name, ...(d.nt ? {} : { note: k ? shownNote(cfg, k) : '' }) }); }} onUrl={(nu) => up({ nu })} onEq={(ne) => up({ ne: ne as EquipmentId | '' })} cat={d.cat} onCat={cat => up({ cat })} />
      <label className="field">Phase
        <select value={d.ph || ''} onChange={e => up({ ph: (e.target.value || null) as PhaseChoice })}>
          <option value="">None</option>
          {PH_KEYS.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
        </select>
      </label>
      <label className="field">Note (shown on every {d.name.trim() || 'this exercise'})<input maxLength={200} value={d.note} placeholder="e.g. Saw it on YouTube, try light" onChange={e => up({ note: e.target.value, nt: true })} /></label>
      {err && <p className="note err" role="alert">{err}</p>}
      </form>
      {exId ? <LiftGoal key={exId} exId={exId} /> : <p className="note">Pick an existing exercise to set a weight goal for it here, or save this one and come back.</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" form="exp-form" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
