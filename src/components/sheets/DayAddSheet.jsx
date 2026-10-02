import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exerciseChoice, findExId, exInfo } from '../../lib/data.js';
import Sheet from '../Sheet.jsx';
import ExerciseField from '../ExerciseField.jsx';

// Add an exercise (or a stretch) to one day of the week on screen. Only this week gets it; the program doesn't change.
export default function DayAddSheet({ col, stretch: asStretch = false }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const [d, setD] = useState({ name: '', nu: '', ne: '', ns: asStretch, ph: 'strength', note: '' });
  const [scope, setScope] = useState('week');
  const [err, setErr] = useState('');
  const up = patch => setD(x => ({ ...x, ...patch }));
  const known = findExId(cfg, d.name);
  const isStretch = known ? !!exInfo(cfg, known).stretch : d.ns;
  const submit = e => { e.preventDefault(); const msg = st.addExerciseToDay(col, { ...exerciseChoice(cfg, d.name), nu: d.nu.trim(), ne: d.ne, ns: d.ns, ph: d.ph, note: d.note }, scope); if (msg) setErr(msg); };
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">{asStretch ? 'Add a stretch' : 'Add an exercise'} to Day {col}</h2>
      <fieldset className="edit-item">
        <legend>Add it to</legend>
        <label className="inline"><input type="radio" name="add-scope" checked={scope === 'week'} onChange={() => setScope('week')} /> This week only</label>
        <label className="inline"><input type="radio" name="add-scope" checked={scope === 'program'} onChange={() => setScope('program')} /> Every week (this day in the program)</label>
      </fieldset>
      <ExerciseField cfg={cfg} id="day-ex" name={d.name} url={d.nu} eq={d.ne} stretch={d.ns} onName={name => up({ name })} onUrl={nu => up({ nu })} onEq={ne => up({ ne })} onStretch={ns => up({ ns })} />
      {!isStretch && (
        <label className="field">Phase
          <select value={d.ph || ''} onChange={e => up({ ph: e.target.value || null })}>
            <option value="">None</option>
            {PH_KEYS.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
          </select>
        </label>
      )}
      <label className="field">Note<input maxLength={200} value={d.note} placeholder="Form cue, setup" onChange={e => up({ note: e.target.value })} /></label>
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Add</button>
      </div>
    </Sheet>
  );
}
