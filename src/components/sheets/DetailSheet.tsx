import type { LogEntry, PhaseKey } from '../../types.ts';
import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exInfo } from '../../lib/data.js';
import { parseDate, fmtShort } from '../../lib/dates.js';
import { volText, AUTO_NOTE, isTimed, setsOfEntry, summarizeSets } from '../../lib/logic.js';
import { setError } from '../../lib/validate.js';
import { entryId, findEntry } from '../../lib/export.js';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';
import LineChart from '../LineChart.jsx';
import LiftGoal from '../progress/LiftGoal.jsx';

const num = (v: string | number) => (v === '' ? null : Number(v));

function EditEntry({ exId, entry, onDone }: { exId: string; entry: LogEntry; onDone: () => void }) {
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
          <input type="number" inputMode="decimal" step="any" min="0" value={r.w} placeholder="bodyweight" aria-label={`Set ${j + 1} weight in lb`} onChange={e => edit(j, 'w', e.target.value)} />
          <span className="setx">×</span>
          <input type="number" inputMode="numeric" step="any" min="0" value={r.r} aria-label={`Set ${j + 1} ${iso ? 'hold in seconds' : 'reps'}`} onChange={e => edit(j, 'r', e.target.value)} />
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

export default function DetailSheet({ exId }: { exId: string }) {
  const cfg = useAppStore(s => s.cfg);
  const L = useAppStore(s => s.logs[exId]) || [];
  const { deleteLog, closeModal } = useAppStore.getState();
  const [editing, setEditing] = useState<LogEntry | null>(null); // the entry as it was when Edit was tapped
  const editOpen = editing && findEntry(L, editing) >= 0; // gone or changed meanwhile: the form closes
  const last = L[L.length - 1];
  const multi = new Set(L.map(e => e.ph || null)).size > 1;

  return (
    <Sheet style={{ maxWidth: 640 }}>
      <h2 className="cond">{exInfo(cfg, exId).n}</h2>
      {last && (
        <>
          <p className="note">
            {multi ? 'One line per phase you train this lift in. Tap a point for the date and weight.' : `${last.ph ? PHASES[last.ph].label : 'No phase'} trend.`} The table lists every session.
          </p>
          <LineChart entries={L} height={200} byPhase={multi} />
        </>
      )}
      <LiftGoal exId={exId} />
      {editOpen && <EditEntry key={entryId(editing)} exId={exId} entry={editing} onDone={() => setEditing(null)} />}
      <table className="hist">
        <thead><tr><th>Date</th><th>Phase</th><th className="num">Load</th><th className="num">Volume</th><th>Note</th><th><span className="sr">Edit or delete</span></th></tr></thead>
        <tbody>
          {L.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
            <tr key={`${entryId(e)}-${i}`}>
              <td>{fmtShort(parseDate(e.d))}</td>
              <td>{e.ph ? PHASES[e.ph].label : '—'}</td>
              <td className="num">{e.w != null && (e.w as unknown) !== '' ? `${e.w} lb` : 'Bodyweight'}</td>
              <td className="num">{volText(e)}</td>
              <td>{e.n || (e.auto ? AUTO_NOTE : '')}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button type="button" className="btn sm ghost" aria-label={`Edit entry from ${fmtShort(parseDate(e.d))}`} onClick={() => setEditing(e)}>Edit</button>{' '}
                <ArmedButton className="btn sm ghost" aria-label={`Delete entry from ${fmtShort(parseDate(e.d))}`} label="✕" armedLabel="Delete?" onConfirm={() => { setEditing(null); deleteLog(exId, e); }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions"><button type="button" className="btn" onClick={closeModal}>Close</button></div>
    </Sheet>
  );
}
