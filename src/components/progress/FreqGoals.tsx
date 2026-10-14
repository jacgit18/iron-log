import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { exInfo } from '../../lib/data.js';
import { weekStartOf, ymd } from '../../shared/dates.js';
import { currentLayout, DAYS } from '../../lib/logic.js';
import { freqGoalStatus } from '../../lib/freqGoal.js';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import './FreqGoals.css';

const TIMES = [1, 2, 3, 4, 5, 6, 7];

// How many times a week you want to do each exercise, and how this week is going. A session is a day you logged or ticked it.
export default function FreqGoals() {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs);
  const week = useAppStore(s => s.week); useAppStore(s => s.programs); // the exercise list follows the shown week's program
  const today = useToday(s => s.today);
  const { setFreqGoal, clearFreqGoal, activeSlots } = useAppStore.getState();
  const [ex, setEx] = useState(''); const [n, setN] = useState('3');
  const wk = ymd(weekStartOf(today));
  // A check-off is dated the day you tapped it: when the board shows this week, count it on the day its card is on.
  const slots = activeSlots(); const shown = useAppStore.getState().weekKey() === wk;
  const cols = new Map<string, number>();
  if (shown) { const layout = currentLayout(week, slots); DAYS.forEach(c => layout[c].forEach(s => cols.set(s.id, c))); }
  const rows = freqGoalStatus(cfg, logs, wk, shown ? id => cols.get(id) ?? null : undefined);
  const ids = [...new Set([...slots.flatMap(s => s.items.map(it => it.ex)), ...Object.keys(logs).filter(id => logs[id].length)])]
    .filter(id => cfg.freqGoals?.[id] == null)
    .map(id => ({ id, name: exInfo(cfg, id).n })).sort((a, b) => a.name.localeCompare(b.name));
  const pick = ids.some(x => x.id === ex) ? ex : ids[0]?.id ?? ''; // a pick that left the list (synced goal, other week) falls back to the first
  return (
    <section className="panel freqgoals" aria-labelledby="freq-h">
      <h2 id="freq-h">Exercise frequency</h2>
      <RemovedNotice scope="freqgoal" />
      {!rows.length && <p className="note">How many times a week you want to do an exercise. A day you log it or tick it off counts once.</p>}
      {rows.length > 0 && (
        <ul className="freqlist">
          {rows.map(r => {
            const name = exInfo(cfg, r.id).n; const pct = Math.min(100, Math.round(r.done / r.goal * 100));
            return (
              <li key={r.id} className={r.met ? 'met' : undefined}>
                <span className="freqname">{name}</span>
                <span className="freqnum"><b>{r.done}</b>/{r.goal} this week{r.met ? ' · goal met' : ''}</span>
                <div className="goalbar" role="img" aria-label={`${name}: ${r.done} of ${r.goal} sessions this week`}><div className="bar"><i style={{ width: `${pct}%` }} /></div></div>
                <ArmedButton className="btn sm ghost" aria-label={`Remove the ${name} frequency goal`} label="Remove" armedLabel="Tap again to remove" onConfirm={() => clearFreqGoal(r.id)} />
              </li>
            );
          })}
        </ul>
      )}
      {ids.length > 0 && (
        <form className="goalform" noValidate onSubmit={e => { e.preventDefault(); if (setFreqGoal(pick, n)) setEx(''); }}>
          <div className="fields">
            <label className="field">Exercise
              <select aria-label="Exercise" value={pick} onChange={e => setEx(e.target.value)}>
                {ids.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </label>
            <label className="field">Times a week
              <select aria-label="Times a week" value={n} onChange={e => setN(e.target.value)}>{TIMES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            </label>
          </div>
          <div className="actions"><button type="submit" className="btn sm primary">{rows.length ? 'Add a goal' : 'Set a goal'}</button></div>
        </form>
      )}
    </section>
  );
}
