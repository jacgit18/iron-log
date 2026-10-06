import type { EquipmentKey } from '../../types.ts';
import type { PhaseChoice } from '../../store/types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exerciseChoice, findExId } from '../../lib/data.js';
import Sheet from '../Sheet.jsx';
import ExerciseField from '../ExerciseField.jsx';

// Add an exercise to one day of the week on screen. Only this week gets it; the program doesn't change.
export default function DayAddSheet({ col }: { col: any }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const [d, setD] = useState<{ name: string; nu: string; ne: EquipmentKey | ''; ph: PhaseChoice; note: string }>({ name: '', nu: '', ne: '', ph: 'strength', note: '' });
  const [err, setErr] = useState('');
  const up = (patch: Partial<typeof d>) => setD(x => ({ ...x, ...patch }));
  const submit = (e: any) => { e.preventDefault(); const msg = st.addExerciseToDay(col, { ...exerciseChoice(cfg, d.name), nu: d.nu.trim(), ne: d.ne, ph: d.ph, note: d.note }); if (msg) setErr(msg); };
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">Add to Day {col}, this week</h2>
      <p className="note">For this week only. Your program doesn't change.</p>
      <ExerciseField cfg={cfg} id="day-ex" name={d.name} url={d.nu} eq={d.ne} onName={(name: any) => { const k = findExId(cfg, name); const def = k && cfg.exPh && cfg.exPh[k]; up({ name, ...(def ? { ph: def } : {}) }); }} onUrl={(nu: any) => up({ nu })} onEq={(ne: any) => up({ ne })} />
        <label className="field">Phase
          <select value={d.ph || ''} onChange={e => up({ ph: (e.target.value || null) as PhaseChoice })}>
            <option value="">None</option>
            {PH_KEYS.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
          </select>
        </label>
      <label className="field">Note<input maxLength={200} value={d.note} placeholder="Form cue, setup" onChange={e => up({ note: e.target.value })} /></label>
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Add</button>
      </div>
    </Sheet>
  );
}
