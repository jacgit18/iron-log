import type { LogEntry, PhaseKey } from '../../types.ts';
import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS } from '../../lib/data.js';
import { isTimed, setsOfEntry, summarizeSets } from '../../lib/logic.js';
import { setError } from '../../shared/validate.js';
import { selectOnFocus, advanceOnEnter, cellHint } from '../../lib/setCells.js';
import './SetRows.css';

const num = (v: string | number) => (v === '' ? null : Number(v));

export default function EditEntry({ exId, entry, onDone }: { exId: string; entry: LogEntry; onDone: () => void }) {
  const { updateLog } = useAppStore.getState();
  const [date, setDate] = useState(entry.d);
  const [ph, setPh] = useState<PhaseKey | ''>(entry.ph || '');
  const [note, setNote] = useState(entry.auto ? '' : entry.n || '');
  const iso = isTimed(ph || null);
  const [rows, setRows] = useState(() => setsOfEntry(entry).map(x => ({ w: x.w ?? '', r: (x.sec ?? x.r) ?? '' })));
  const [err, setErr] = useState('');
  const edit = (j: number, k: 'w' | 'r', v: string) => setRows(rs => rs.map((r, n) => (n === j ? { ...r, [k]: v } : r)));
  const save = (e: FormEvent) => {
    e.preventDefault();
    const sets = rows.map(r => ({ w: num(r.w), v: num(r.r) })).filter(x => x.w != null || x.v != null).map(x => (iso ? { w: x.w, sec: x.v } : { w: x.w, r: x.v }));
    if (!sets.length) { setErr('Enter at least one set.'); return; }
    const bad = setError(sets, iso); if (bad) { setErr(bad); return; }
    if (!date) { setErr('Pick a date.'); return; }
    const { w, s, r, sec, sets: _s, auto, n, d, ph: _p, ...rest } = entry; // eslint-disable-line no-unused-vars
    const next: LogEntry = { ...rest, d: date, ph: ph || null, ...summarizeSets(sets, iso) };
    if (note.trim()) next.n = note.trim();
    updateLog(exId, entry, next); onDone(); // found by identity: the list may have changed while this was open
  };
  return (
    <form className="setbox" noValidate onSubmit={save} aria-label="Edit session">
      <div className="fields">
        <label className="field">Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="field">Phase
          <select value={ph} onChange={e => setPh(e.target.value as PhaseKey | '')}>
            <option value="">None</option>
            {PH_KEYS.map(k => <option key={k} value={k}>{PHASES[k].label}</option>)}
          </select>
        </label>
      </div>
      <div className="sethead"><span>Set</span><span>Weight (lb)</span><span /><span>{iso ? 'Hold (s)' : 'Reps'}</span></div>
      {rows.map((r, j) => (
        <div className="setrow" key={j}>
          <span className="setn">{j + 1}</span>
          <input type="number" inputMode="decimal" step="any" min="0" value={r.w} placeholder="bodyweight" aria-label={`Set ${j + 1} weight in lb`} enterKeyHint={cellHint(false)} onFocus={selectOnFocus} onKeyDown={advanceOnEnter} onChange={e => edit(j, 'w', e.target.value)} />
          <span className="setx">×</span>
          <input type="number" inputMode="numeric" step="any" min="0" value={r.r} aria-label={`Set ${j + 1} ${iso ? 'hold in seconds' : 'reps'}`} enterKeyHint={cellHint(j === rows.length - 1)} onFocus={selectOnFocus} onKeyDown={advanceOnEnter} onChange={e => edit(j, 'r', e.target.value)} />
        </div>
      ))}
      <div className="setbtns">
        <button type="button" className="btn sm" onClick={() => setRows(rs => [...rs, { ...(rs[rs.length - 1] || { w: '', r: '' }) }])}>+ Set</button>
        <button type="button" className="btn sm ghost" onClick={() => setRows(rs => (rs.length > 1 ? rs.slice(0, -1) : rs))}>− Set</button>
      </div>
      <label className="field">Note<input type="text" value={note} onChange={e => setNote(e.target.value)} /></label>
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary">Save changes</button>
      </div>
    </form>
  );
}
