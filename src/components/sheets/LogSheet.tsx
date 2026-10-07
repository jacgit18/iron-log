import type { EquipmentKey, LogEntry, LogSet, PhaseKey } from '../../types.ts';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, PH_KEYS, EQUIPMENT, EQ_KEYS, exInfo, isVideoUrl, VIDEO_ERR } from '../../lib/data.js';
import { ymd, parseDate, fmtShort } from '../../lib/dates.js';
import {
  phaseOf, isTimed, targetOf, rxOf, lastLog, describe, volText, isPaired, planRows, setsOfEntry, summarizeSets, defaultLogDate,
} from '../../lib/logic.js';
import Sheet from '../Sheet.jsx';
import { liftGoalsStatus, liftGoalNote } from '../../lib/liftGoal.js';
import { setError } from '../../shared/validate.js';

// Older entries in a timed phase may hold reps (Mobility was counted in reps before), so each side falls back to the other.
const toRow = (x: LogSet, iso: boolean) => ({ w: x.w ?? '', r: (iso ? x.sec ?? x.r : x.r ?? x.sec) ?? '', tw: false, tr: false });
const num = (v: string | number) => (v === '' ? null : Number(v));

export default function LogSheet({ slotId, idx }: { slotId: string; idx: number }) {
  const cfg = useAppStore(s => s.cfg);
  const week = useAppStore(s => s.week);
  const logs = useAppStore(s => s.logs);
  const weekStart = useAppStore(s => s.weekStart);
  const today = useToday(s => s.today);
  const st = useAppStore.getState();
  const s = st.slotById(slotId)!; // the sheet only opens for a card that exists
  const it = s.items[idx]; const ex = exInfo(cfg, it.ex);
  const ph0 = phaseOf(cfg, week, s, idx);

  const [ph, setPh] = useState(ph0 || '');
  const [rm, setRm] = useState<number | string>(cfg.rm[it.ex] ?? '');
  const [date, setDate] = useState(() => defaultLogDate(weekStart));
  const [rows, setRows] = useState(() => planRows(cfg, logs, it, ph0).map(x => toRow(x, isTimed(ph0))));
  const [note, setNote] = useState('');
  const [eq, setEq] = useState<EquipmentKey | ''>(ex.eq || '');
  const [url, setUrl] = useState(ex.url || '');
  const [makeDefault, setMakeDefault] = useState(false);
  const [makeExDefault, setMakeExDefault] = useState(false);
  const [done, setDone] = useState(true);
  const [err, setErr] = useState('');
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const phv = (ph || null) as PhaseKey | null; const iso = isTimed(phv);
  const t = targetOf(cfg, logs, it, phv);
  const rx = rxOf(cfg, it, phv);
  const last = lastLog(logs, it.ex, phv);
  const hist = (logs[it.ex] || []).slice(-6).reverse();
  const goals = liftGoalsStatus(cfg, it.ex, logs[it.ex], today, phv);

  const changePhase = (v: PhaseKey | '') => { setPh(v); const p = v || null; setRows(planRows(cfg, logs, it, p).map(x => toRow(x, isTimed(p)))); };
  // Editing a set fills the same field in later sets, until those are edited themselves.
  const editCell = (i: number, k: string, v: string | boolean) => setRows(rs => rs.map((r, j) => {
    const touched = k === 'w' ? 'tw' : 'tr';
    if (j === i) return { ...r, [k]: v, [touched]: true };
    if (j > i && !r[touched]) return { ...r, [k]: v };
    return r;
  }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const sets = rows.map(r => ({ w: num(r.w), v: num(r.r) })).filter(x => x.w != null || x.v != null)
      .map(x => (iso ? { w: x.w, sec: x.v } : { w: x.w, r: x.v }));
    if (!sets.length) { setErr('Enter at least one set.'); return; }
    const bad = setError(sets, iso); if (bad) { setErr(bad); return; }
    if (!isVideoUrl(url)) { setErr(VIDEO_ERR); return; }
    const entry: LogEntry = { d: date || ymd(today), ph: phv, ...summarizeSets(sets, iso), slot: slotId, wk: st.weekKey() };
    if (note.trim()) entry.n = note.trim();
    const rmVal = rm === '' ? null : Number(rm);
    if (st.submitLog(slotId, idx, { entry, ph: phv, makeDefault, makeExDefault, rm: rmVal, done, eq, url })) st.closeModal();
  };

  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">{ex.n}</h2>
      <div className="target">
        <span>Target<br /><b>{t.w != null ? `${t.w} lb` : (t.src || '—')}</b></span>
        <span>Prescription<br /><b>{rx || '—'}</b></span>
        {t.w != null && <span className="note" style={{ alignSelf: 'end' }}>{t.src}</span>}
        {goals.map(g => <span key={g.key} className="note" style={{ alignSelf: 'end' }}>{liftGoalNote(g)}</span>)}
      </div>
      <div className="fields">
        <label className="field">Phase
          <select value={ph} onChange={e => changePhase(e.target.value as PhaseKey | '')}>
            {!ph0 && <option value="">None</option>}
            {PH_KEYS.map(k => <option key={k} value={k}>{PHASES[k].label}</option>)}
          </select>
        </label>
        <label className="field">1RM (lb)
          <input type="number" inputMode="decimal" step="any" min="0" value={rm} placeholder="not set" onChange={e => setRm(e.target.value)} />
        </label>
        <label className="field">Date
          <input id="f-d" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
      </div>
      <div className="setbox">
        <div className="sethead"><span>Set</span><span>Weight (lb)</span><span /><span>{iso ? 'Hold (s)' : 'Reps'}</span></div>
        <div>
          {rows.map((r, i) => (
            <div className="setrow" key={i}>
              <span className="setn">{i + 1}</span>
              <input ref={i === 0 ? firstRef : null} type="number" inputMode="decimal" step="any" min="0" value={r.w} placeholder="bodyweight"
                aria-label={`Set ${i + 1} weight in lb`} onChange={e => editCell(i, 'w', e.target.value)} />
              <span className="setx">×</span>
              <input type="number" inputMode="numeric" step="any" min="0" value={r.r}
                aria-label={`Set ${i + 1} ${iso ? 'hold in seconds' : 'reps'}`} onChange={e => editCell(i, 'r', e.target.value)} />
            </div>
          ))}
        </div>
        <div className="setbtns">
          <button type="button" className="btn sm" onClick={() => setRows(rs => [...rs, { ...(rs[rs.length - 1] || { w: '', r: '' }), tw: false, tr: false }])}>+ Set</button>
          <button type="button" className="btn sm ghost" onClick={() => setRows(rs => (rs.length > 1 ? rs.slice(0, -1) : rs))}>− Set</button>
          <span className="note">Change set 1 and the sets below follow, until you edit them.</span>
        </div>
        {err && <p className="note err" role="alert" id="log-err">{err}</p>}
      </div>
      <label className="field">Note
        <input type="text" value={note} placeholder="Form, how it felt, equipment" onChange={e => setNote(e.target.value)} />
      </label>
      <label className="field">Video link (optional)
        <input type="url" value={url} placeholder="https://" onChange={e => setUrl(e.target.value)} />
        <span className="note">Saved for {ex.n} on every day and every week.</span>
      </label>
      <label className="field">Equipment
        <select value={eq} onChange={e => setEq(e.target.value as EquipmentKey | '')}>
          <option value="">Not set</option>
          {EQ_KEYS.map(k => <option key={k} value={k}>{EQUIPMENT[k]}</option>)}
        </select>
        <span className="note">Changing it updates {ex.n} everywhere.</span>
      </label>
      {!s.experiment && <label className="inline"><input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} /> Make this phase the default for this slot</label>}
      <label className="inline"><input type="checkbox" checked={makeExDefault} onChange={e => setMakeExDefault(e.target.checked)} /> Make this phase the default for {ex.n} everywhere</label>
      <label className="inline"><input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} /> {isPaired(s) ? 'Check off this exercise' : 'Check off the card'}</label>
      <div className="actions">
        {last && (
          <button type="button" className="btn filllast" style={{ marginRight: 'auto' }}
            onClick={() => setRows(setsOfEntry(last).map(x => toRow(x, iso)))}>Fill last: {describe(last)}</button>
        )}
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Save set</button>
      </div>
      {hist.length > 0 && (
        <div>
          <div className="sect" style={{ padding: '0 0 4px' }}>Recent</div>
          <table className="hist">
            <thead><tr><th>Date</th><th>Phase</th><th className="num">Load</th><th className="num">Sets</th></tr></thead>
            <tbody>
              {hist.map((e, i) => (
                <tr key={i}>
                  <td>{fmtShort(parseDate(e.d))}</td>
                  <td>{e.ph ? PHASES[e.ph].label : '—'}</td>
                  <td className="num">{e.w != null && (e.w as unknown) !== '' ? `${e.w} lb` : 'Bodyweight'}</td>
                  <td className="num">{volText(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  );
}
