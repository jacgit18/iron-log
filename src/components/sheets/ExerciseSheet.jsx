import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, EQUIPMENT, EQ_KEYS, exInfo } from '../../lib/data.js';
import Sheet from '../Sheet.jsx';
import { FEATURES } from '../../lib/features.js';

// What you can set on one exercise: video link, equipment, whether it's a stretch, and the phase it
// starts in on every card (a card's own saved or one-week phase still wins).
export default function ExerciseSheet({ exId }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const info = exInfo(cfg, exId);
  const [d, setD] = useState(() => ({ url: info.url || '', eq: info.eq || '', stretch: !!info.stretch, ph: (cfg.exPh && cfg.exPh[exId]) || '' }));
  const [err, setErr] = useState('');
  const up = patch => setD(x => ({ ...x, ...patch }));
  const submit = e => { e.preventDefault(); const msg = st.saveExerciseDetails(exId, d); if (msg) setErr(msg); };
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">{info.n}</h2>
      <label className="field">Video link (optional)<input type="url" value={d.url} placeholder="https://" onChange={e => up({ url: e.target.value })} /></label>
      <label className="field">Equipment
        <select value={d.eq} onChange={e => up({ eq: e.target.value })}>
          <option value="">Not set</option>
          {EQ_KEYS.map(k => <option key={k} value={k}>{EQUIPMENT[k]}</option>)}
        </select>
      </label>
      {FEATURES.stretches && <label className="inline"><input type="checkbox" checked={d.stretch} onChange={e => up({ stretch: e.target.checked })} /> Stretch or mobility (no weight or reps)</label>}
      {!d.stretch && (
        <label className="field">Default phase for every card with this exercise
          <select value={d.ph} onChange={e => up({ ph: e.target.value })}>
            <option value="">Use each card's own</option>
            {PH_KEYS.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
          </select>
        </label>
      )}
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
