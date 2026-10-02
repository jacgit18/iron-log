import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exInfo, exerciseChoice } from '../../lib/data.js';
import Sheet from '../Sheet.jsx';
import ExerciseField from '../ExerciseField.jsx';

// Add or edit an entry on the Experiment board: one exercise, a phase and a note.
export default function ExperimentSheet({ id }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const cur = id ? st.experiments.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, name: cur ? exInfo(cfg, cur.ex).n : '', nu: '', ph: cur ? cur.ph : 'strength', note: cur ? cur.note : '' }));
  const [err, setErr] = useState('');
  const up = patch => setD(x => ({ ...x, ...patch }));
  const submit = e => { e.preventDefault(); const msg = st.saveExperiment({ id: d.id, ...exerciseChoice(cfg, d.name), nu: d.nu.trim(), ph: d.ph, note: d.note.trim() }); if (msg) setErr(msg); };
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">{cur ? 'Edit experiment' : 'Add an exercise to try'}</h2>
      <ExerciseField cfg={cfg} id="exp-ex" name={d.name} url={d.nu} onName={name => up({ name })} onUrl={nu => up({ nu })} />
      <label className="field">Phase
        <select value={d.ph || ''} onChange={e => up({ ph: e.target.value || null })}>
          <option value="">None</option>
          {PH_KEYS.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
        </select>
      </label>
      <label className="field">Note<input maxLength={200} value={d.note} placeholder="e.g. Saw it on YouTube, try light" onChange={e => up({ note: e.target.value })} /></label>
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
