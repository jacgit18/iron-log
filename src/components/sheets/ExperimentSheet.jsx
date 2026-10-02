import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exInfo, allExIds } from '../../lib/data.js';
import Sheet from '../Sheet.jsx';

// Add or edit an entry on the Experiment board: one exercise, a phase and a note.
export default function ExperimentSheet({ id }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const cur = id ? st.experiments.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, ex: cur ? cur.ex : '', nn: '', nu: '', ph: cur ? cur.ph : 'strength', note: cur ? cur.note : '' }));
  const [err, setErr] = useState('');
  const exIds = allExIds(cfg).sort((a, b) => exInfo(cfg, a).n.localeCompare(exInfo(cfg, b).n));
  const up = patch => setD(x => ({ ...x, ...patch }));
  const submit = e => { e.preventDefault(); const msg = st.saveExperiment({ ...d, nn: d.nn.trim(), nu: d.nu.trim(), note: d.note.trim() }); if (msg) setErr(msg); };
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">{cur ? 'Edit experiment' : 'Add an exercise to try'}</h2>
      <label className="field">Exercise
        <select value={d.ex} onChange={e => up({ ex: e.target.value })}>
          {d.ex === '' && <option value="">Choose…</option>}
          {exIds.map(x => <option key={x} value={x}>{exInfo(cfg, x).n}</option>)}
          <option value="__new">+ New exercise…</option>
        </select>
      </label>
      {d.ex === '__new' && (
        <div className="fields">
          <label className="field">Name<input value={d.nn} placeholder="e.g. Cable Lateral Raise" onChange={e => up({ nn: e.target.value })} /></label>
          <label className="field">Video link (optional)<input type="url" value={d.nu} placeholder="https://" onChange={e => up({ nu: e.target.value })} /></label>
        </div>
      )}
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
