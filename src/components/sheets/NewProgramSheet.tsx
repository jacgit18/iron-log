import type { ProgKey } from '../../types.ts';
import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { progName } from '../../lib/logic.js';
import Sheet from '../Sheet.jsx';

export default function NewProgramSheet() {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const [name, setName] = useState('');
  const [from, setFrom] = useState(() => st.activeProgKey());
  const [err, setErr] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErr('Give the program a name.'); return; }
    if (st.createProgram(name, from)) window.scrollTo({ top: 0 });
  };
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">Create a program</h2>
      <p className="note">It starts as a copy you can change freely. It goes into your program library, not the rotation, until you load it into A or B.</p>
      <label className="field">Name<input maxLength={60} value={name} required aria-invalid={!!err} aria-describedby={err ? 'np-err' : undefined} placeholder="e.g. Winter strength block" onChange={e => setName(e.target.value)} /></label>
      <label className="field">Start from
        <select value={from} onChange={e => setFrom(e.target.value as ProgKey)}>
          {['A', 'B'].map(k => <option key={k} value={k}>A copy of {progName(cfg, k)} (Program {k})</option>)}
        </select>
      </label>
      {err && <p className="note err" role="alert" id="np-err">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Create and edit</button>
      </div>
    </Sheet>
  );
}
