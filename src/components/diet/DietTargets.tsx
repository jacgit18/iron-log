import { useState } from 'react';
import { GAIN_RATES, LOSE_RATES, targetNote, targetsFor, type Recommendation } from '../../lib/dietTarget.js';
import { fmtNum } from '../../lib/dietLog.js';
import { rateError, targetError, type TargetKey } from '../../shared/diet.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { DietCfg, DietPace } from '../../types.ts';

const num = (t: string) => (t.trim() === '' ? null : Number(t));
const KEYS: { key: TargetKey; id: string; label: string; unit: string }[] = [
  { key: 'kcal', id: 'dt-tk', label: 'Calories', unit: 'kcal' }, { key: 'protein', id: 'dt-tp', label: 'Protein (g)', unit: 'g protein' },
  { key: 'carbs', id: 'dt-tc', label: 'Carbs (g)', unit: 'g carbs' }, { key: 'fat', id: 'dt-tf', label: 'Fat (g)', unit: 'g fat' },
];

// The daily targets: what you typed, else the recommendation from your weight and goal (an estimate, not advice), with a way to type your own.
export default function DietTargets({ typed, rec, goalLb, hasDate }: { typed: DietCfg | undefined; rec: Recommendation; goalLb: number | null; hasDate: boolean }) {
  const t = targetsFor(typed, rec);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState<Record<TargetKey, string>>({ kcal: '', protein: '', carbs: '', fat: '' });
  const [err, setErr] = useState('');
  const open = () => { setText({ kcal: str(typed?.kcal), protein: str(typed?.protein), carbs: str(typed?.carbs), fat: str(typed?.fat) }); setErr(''); setEditing(true); };
  const save = () => {
    const bad = KEYS.map(k => targetError(k.key, num(text[k.key]))).find(Boolean); // check all first, so an error never leaves some of them saved
    if (bad) { setErr(bad); return; }
    const st = useAppStore.getState();
    KEYS.forEach(k => st.setDietTarget(k.key, num(text[k.key])));
    setEditing(false);
  };
  const reset = () => { const st = useAppStore.getState(); KEYS.forEach(k => st.setDietTarget(k.key, null)); setEditing(false); };
  const any = t.kcal !== null || t.protein !== null;
  const hasTyped = Object.values(t.typed).some(Boolean);
  if (editing) {
    return (
      <form className="dt-targets" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
        <h3>Daily target</h3>
        <div className="fields">
          {KEYS.map(k => (
            <label className="field" htmlFor={k.id} key={k.key}>{k.label}
              <input id={k.id} type="number" inputMode="numeric" min="0" step="any" placeholder={t[k.key] !== null && !t.typed[k.key] ? String(t[k.key]) : ''} value={text[k.key]} onChange={e => { setText({ ...text, [k.key]: e.target.value }); setErr(''); }} />
            </label>
          ))}
        </div>
        <p className="note">Leave a box empty to use the recommended number. Carbs and fat follow your calories and protein unless you type them; if you type your own, they may not add up to your calories.</p>
        {err && <p className="note" role="alert">{err}</p>}
        <div className="actions">
          <button type="button" className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className="btn sm primary">Save target</button>
        </div>
      </form>
    );
  }
  return (
    <div className="dt-targets">
      <h3>Daily target</h3>
      {any ? (
        <ul className="dt-nums">
          {KEYS.map(k => t[k.key] !== null && <li key={k.key}><b>{fmtNum(t[k.key]!)} {k.unit}</b>{t.typed[k.key] && <span className="note"> your number{recFor(rec, k.key) !== null && recFor(rec, k.key) !== t[k.key] ? `, recommended ${fmtNum(recFor(rec, k.key)!)}` : ''}</span>}</li>)}
        </ul>
      ) : <p className="dt-nums"><b>No target yet</b></p>}
      <p className="note">{targetNote(rec, goalLb)}</p>
      <Missing rec={rec} />
      <PaceRow typed={typed} rec={rec} hasDate={hasDate} />
      <div className="actions">
        <button type="button" className="btn sm" onClick={open}>{any ? 'Edit target' : 'Set target'}</button>
        {hasTyped && rec.kind === 'ok' && <button type="button" className="btn sm ghost" onClick={reset}>Use recommended</button>}
      </div>
    </div>
  );
}

const str = (n: number | undefined) => (n !== undefined ? String(n) : '');
const recFor = (rec: Recommendation, key: TargetKey) => (rec.kind === 'ok' ? (key === 'kcal' ? rec.kcal : key === 'protein' ? rec.protein : null) : null); // the recommendation covers calories and protein; carbs and fat follow them

// What the recommendation still needs, with a way to supply it, so nobody has to type a target just because a number is missing.
function Missing({ rec }: { rec: Recommendation }) {
  if (rec.kind === 'ok' && rec.direction !== null) return null;
  const toProgress = () => useAppStore.getState().setTab('progress');
  return <p className="dp-missing"><button type="button" className="btn sm" onClick={toProgress}>{rec.kind === 'none' ? 'Set a goal weight' : 'Log your weight'}</button></p>;
}

const PRESETS: { pace: Exclude<DietPace, 'custom'>; label: string }[] = [{ pace: 'slow', label: 'Slow' }, { pace: 'steady', label: 'Steady' }, { pace: 'fast', label: 'Fast' }];

// How fast you want to gain or lose: a preset, your own lb a week, or (when the goal has a date) the pace the date needs.
function PaceRow({ typed, rec, hasDate }: { typed: DietCfg | undefined; rec: Recommendation; hasDate: boolean }) {
  const [text, setText] = useState(typed?.rate !== undefined ? String(typed.rate) : '');
  const [err, setErr] = useState('');
  if (rec.kind !== 'ok' || (rec.direction !== 'bulk' && rec.direction !== 'cut') || !rec.plan) return null;
  const rates = rec.direction === 'bulk' ? GAIN_RATES : LOSE_RATES;
  const chosen: DietPace | 'date' = typed?.pace ?? (hasDate ? 'date' : 'steady');
  const st = useAppStore.getState();
  const pick = (p: DietPace | 'date') => {
    setErr('');
    if (p === 'date') st.setDietPace(null);
    else if (p === 'custom') { const r = rec.plan!.rate > 0 ? Math.max(0.1, rec.plan!.rate) : 0.5; setText(String(r)); st.setDietPace('custom', r); }
    else st.setDietPace(p);
  };
  const saveRate = () => {
    const v = text.trim() === '' ? null : Number(text);
    const bad = rateError(v);
    if (bad) { setErr(bad); return; }
    if (v !== typed?.rate) st.setDietPace('custom', v!); // no write when the box still holds the saved pace, so a blur costs nothing
  };
  const chip = (p: DietPace | 'date', label: string, hint?: string) => (
    <button type="button" key={p} className={chosen === p ? 'dp-chip on' : 'dp-chip'} aria-pressed={chosen === p} onClick={() => pick(p)}>{label}{hint && <span className="dp-hint"> {hint}</span>}</button>
  );
  return (
    <div className="dp-pace" role="group" aria-label={rec.direction === 'bulk' ? 'Pace of gain' : 'Pace of loss'}>
      <p className="dp-label">{rec.direction === 'bulk' ? 'How fast to gain' : 'How fast to lose'} (lb a week)</p>
      <div className="dp-chips">
        {hasDate && chip('date', 'By date')}
        {PRESETS.map(x => chip(x.pace, x.label, String(rates[x.pace])))}
        {chip('custom', 'Custom')}
      </div>
      {chosen === 'custom' && (
        <form className="dp-custom" noValidate onSubmit={e => { e.preventDefault(); saveRate(); }}>
          <label className="field" htmlFor="dp-rate">lb a week
            <input id="dp-rate" type="number" inputMode="decimal" min="0.1" max="3" step="0.05" value={text} onChange={e => { setText(e.target.value); setErr(''); }} onBlur={saveRate} />
          </label>
        </form>
      )}
      {err && <p className="note" role="alert">{err}</p>}
    </div>
  );
}
