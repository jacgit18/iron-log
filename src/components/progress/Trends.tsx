import type { Cfg, Logs, PhaseKey, WeightChange as Change } from '../../types.ts';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, DAY_COUNT, exInfo } from '../../lib/data.js';
import { ymd, parseDate, addDays, fmtShort } from '../../shared/dates.js';
import { MUSCLES, M_KEYS, level, fmtSets } from '../../lib/muscles.js';
import { trendWeeks, setsByWeek, muscleWeeks, weightChanges, weekSummary, niceStep, mdLabel } from '../../lib/trends.js';
import { bwSorted, fmtLb, signed, goalStatus } from '../../lib/body.js';
import { liftGoalStatus, goalPhaseLabel } from '../../lib/liftGoal.js';
import LineChart from '../LineChart.jsx';
import ArmedButton from '../ArmedButton.jsx';

function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return <div className="kpi"><span className="kl">{label}</span><span className="kv">{value}</span><span className="ks">{sub}</span></div>;
}

function KpiTiles({ keys, byWeek, changes }: { keys: string[]; byWeek: Record<string, { sets: number; sessions: number }>; changes: Change[] }) {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs);
  const week = useAppStore(s => s.week); const body = useAppStore(s => s.body);
  const r = weekSummary(cfg, programs, useAppStore.getState().weekKey(), week);
  const k4 = keys.slice(-4), p4 = keys.slice(-8, -4);
  const s4 = k4.reduce((a, k) => a + (byWeek[k] ? byWeek[k].sets : 0), 0);
  const prev = p4.length === 4 && p4.some((k) => byWeek[k] && byWeek[k].sessions) ? p4.reduce((a, k) => a + byWeek[k].sets, 0) : null;
  const up = changes.filter((c) => c.pct > 0).length;
  const L = bwSorted(body); let bw = null;
  if (L.length) {
    const last = L[L.length - 1]; const cut = ymd(addDays(parseDate(last.wk), -28));
    const base = [...L].reverse().find(e => e.wk <= cut) || (L.length > 1 ? L[0] : null);
    bw = { last, base, diff: base ? last.w - base.w : null };
  }
  return (
    <div className="kpis">
      <Kpi label="This week" value={<>{r.ex}<small> of {r.total}</small></>} sub={`exercises done · ${r.full} of ${DAY_COUNT} days${r.skipped ? ` · ${r.skipped} skipped` : ''}`} />
      <Kpi label="Sets, last 4 weeks" value={fmtSets(s4)} sub={prev == null ? 'A comparison with the previous 4 weeks starts after 8 weeks of logs' : `${signed(s4 - prev)} vs the 4 weeks before`} />
      <Kpi label="Lifts going up" value={changes.length ? <>{up}<small> of {changes.length}</small></> : '—'} sub={changes.length ? 'heavier now than at the start of the last 8 weeks' : 'Log a lift with weight on two days to track it'} />
      {bw && <Kpi label="Body weight" value={<>{fmtLb(bw.last.w)}<small> lb</small></>} sub={bw.diff == null ? `Logged ${fmtShort(parseDate(bw.last.d))}` : `${signed(bw.diff, 1)} lb since ${fmtShort(parseDate(bw.base!.d))}`} />}
    </div>
  );
}

function SetsChart({ keys, byWeek }: { keys: string[]; byWeek: Record<string, { sets: number; sessions: number }> }) {
  const thisSun = keys[keys.length - 1];
  const max = Math.max(...keys.map((k) => byWeek[k].sets), 1); const step = niceStep(max); const top = Math.ceil(max / step) * step;
  const grid = []; for (let v = 0; v <= top; v += step) grid.push(v);
  const total = keys.reduce((a, k) => a + byWeek[k].sets, 0);
  return (
    <section className="panel tchart">
      <h2>Sets logged per week</h2>
      {!total ? <p className="note">Logged sets show up here, one bar per week.</p> : (
        <>
          <div className="bars" style={{ '--n': keys.length } as CSSProperties}>
            <div className="bgrid" aria-hidden="true">{grid.map(v => <span key={v} style={{ bottom: `${v / top * 100}%` }}><b>{v}</b></span>)}</div>
            <div className="bcols" role="list" aria-label="Sets logged per week">
              {keys.map((k, i) => {
                const r = byWeek[k]; const cur = k === thisSun; const pct = r.sets / top * 100;
                const tip = `Week of ${fmtShort(parseDate(k))}${cur ? ' (so far)' : ''}: ${fmtSets(r.sets)} set${r.sets === 1 ? '' : 's'} in ${r.sessions} session${r.sessions === 1 ? '' : 's'}`;
                return (
                  <div key={k} role="listitem" className={`bcol${cur ? ' cur' : ''}`} data-tip={tip} tabIndex={0} aria-label={tip}>
                    <div className="bplot" aria-hidden="true">
                      {r.sets > 0 && <i style={{ height: `${pct}%` }} />}
                      {cur && r.sets > 0 && <em style={{ bottom: `${pct}%` }}>{fmtSets(r.sets)}</em>}
                    </div>
                    <span aria-hidden="true" className={`bx${(keys.length - 1 - i) % 2 ? ' alt' : ''}`}>{cur ? 'Now' : mdLabel(k)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="note">Every set you log, all exercises together. The striped bar is this week so far.</p>
        </>
      )}
    </section>
  );
}

// The goal a row of the change chart is measured against: the goal for that phase, or else the any-phase goal.
function rowGoal(cfg: Cfg, logs: Logs, c: Change, today: Date) {
  const G = (cfg.liftGoals || {})[c.id]; if (!G) return null;
  const k = c.ph && G[c.ph] ? c.ph : G.any ? 'any' : null;
  return k ? liftGoalStatus(G[k], logs[c.id], today, k) : null;
}

function ChangeChart({ changes }: { changes: Change[] }) {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs);
  const today = useToday(s => s.today);
  if (!changes.length) return (
    <section className="panel tchart"><h2>Weight change by exercise</h2>
      <p className="note">Once you log the same lift with weight on two different days, this shows how much heavier (or lighter) it is now, over the last 8 weeks.</p>
    </section>
  );
  const downs = changes.filter((c) => c.pct < 0).slice(-4);
  const shown = [...changes.filter((c) => c.pct >= 0).slice(0, 10 - downs.length), ...downs];
  // A goal is drawn as a tick at the % change it would be from the first weight. The scale stretches to fit goals,
  // up to twice the bars' own scale; a goal past that sits at the end, pointing on.
  const goals = shown.map(c => { const g = rowGoal(cfg, logs, c, today); return g ? { ...g, gp: (g.target - c.w0) / c.w0 * 100 } : null; });
  const barLim = Math.max(10, ...shown.map(c => Math.abs(c.pct)));
  const lim = Math.max(barLim, ...goals.filter((g): g is NonNullable<typeof g> => !!g).map(g => Math.min(Math.abs(g.gp), barLim * 2)));
  const mixed = shown.some(c => c.pct < 0) || goals.some(g => g && g.gp < 0); const zero = mixed ? 50 : 0, span = mixed ? 50 : 100;
  const more = changes.length - shown.length;
  return (
    <section className="panel tchart">
      <h2>Weight change by exercise</h2>
      <div className={`chg${mixed ? ' mixed' : ''}`} role="list" aria-label="Weight change by exercise">
        {shown.map((c, i) => {
          const w = Math.abs(c.pct) / lim * span; const dir = c.pct > 0 ? 'up' : c.pct < 0 ? 'down' : 'flat';
          const name = exInfo(cfg, c.id).n; const g = goals[i];
          const goalTip = g ? `. Goal ${fmtLb(g.target)} lb${g.key === 'any' ? '' : ` (${goalPhaseLabel(g.key)})`}: ${g.reached ? 'reached' : `${fmtLb(g.left)} lb to go`}` : '';
          const tip = `${name} · ${c.ph ? PHASES[c.ph as PhaseKey].label : 'No phase'}: ${c.w0} → ${c.w1} lb (${signed(c.pct, 0)}%) from ${fmtShort(parseDate(c.d0))} to ${fmtShort(parseDate(c.d1))}, ${c.n} sessions${goalTip}`;
          const past = g && Math.abs(g.gp) > lim; const gx = g ? zero + Math.max(-lim, Math.min(lim, g.gp)) / lim * span : 0;
          return (
            <div key={`${c.id}|${c.ph}`} role="listitem" className="chrow" data-tip={tip} tabIndex={0} aria-label={tip}>
              <span className="chn"><span className="dot" data-p={c.ph || ''} />{name}</span>
              <span className="chbar"><span className="axis" />
                {dir === 'flat' ? <i className="flat" /> : <i className={dir} style={{ [dir === 'up' ? 'left' : 'right']: `${dir === 'up' ? zero : 100 - zero}%`, width: `${w}%` }} />}
                {g && <b className={`goaltick${g.reached ? ' met' : ''}${past ? ` past ${g.gp < 0 ? 'lo' : 'hi'}` : ''}`} style={{ left: `${gx}%` }} />}
              </span>
              <span className="chv">{signed(c.pct, 0)}% <small>{c.w0}→{c.w1}</small>
                {g && <small className="chgoal">{g.reached ? `goal ${fmtLb(g.target)} met` : `goal ${fmtLb(g.target)}`}</small>}
              </span>
            </div>
          );
        })}
      </div>
      <p className="note">First vs latest weight in the same phase, last 8 weeks.{more > 0 ? ` ${more} more in the lift list below.` : ''} The dot shows the phase{goals.some(Boolean) ? ', and the tick marks your weight goal for that phase (or any phase)' : ''}.</p>
    </section>
  );
}

// Target body weight: set it, see how far there is to go, and the weekly pace needed to hit a date.
function BodyGoal() {
  const cfg = useAppStore(s => s.cfg); const body = useAppStore(s => s.body);
  const today = useToday(s => s.today);
  const { setBodyGoal, clearBodyGoal } = useAppStore.getState();
  const goal = cfg.bwGoal || null;
  const [editing, setEditing] = useState(false);
  const [w, setW] = useState(''); const [by, setBy] = useState('');
  const g = goalStatus(goal, body, today);
  const edit = () => { setW(goal ? fmtLb(goal.w) : ''); setBy(goal && goal.by ? goal.by : ''); setEditing(true); };
  if (editing || !goal) {
    return (
      <form className="bwgoal" noValidate onSubmit={e => { e.preventDefault(); if (setBodyGoal(w, by)) setEditing(false); }}>
        <h3>Weight goal</h3>
        <div className="fields">
          <label className="field">Target (lb)<input type="number" inputMode="decimal" step="any" min="0" value={w} onChange={e => setW(e.target.value)} /></label>
          <label className="field">By (optional)<input type="date" value={by} onChange={e => setBy(e.target.value)} /></label>
        </div>
        <div className="actions">
          {goal && <button type="button" className="btn sm" onClick={() => setEditing(false)}>Cancel</button>}
          <button type="submit" className="btn sm primary">Save goal</button>
        </div>
      </form>
    );
  }
  const lines = [];
  if (g && g.last) {
    if (g.reached) lines.push('Goal reached.');
    else lines.push(`${fmtLb(Math.abs(g.left))} lb to ${g.dir === 'gain' ? 'gain' : 'lose'}, from ${fmtLb(g.start)} lb when you set it.`);
    if (g.pace != null) lines.push(`Recent pace: ${signed(g.pace, 1)} lb a week.`);
    if (!g.reached && g.need != null) lines.push(`To hit it by ${fmtShort(parseDate(g.by!))}: ${signed(g.need, 1)} lb a week.`);
    if (!g.reached && g.by && g.weeksLeft != null && g.weeksLeft <= 0) lines.push(`The date (${fmtShort(parseDate(g.by!))}) has passed.`);
  } else lines.push('Log your weight on the Board to start tracking it.');
  return (
    <div className="bwgoal">
      <h3>Weight goal: {fmtLb(goal.w)} lb{goal.by ? ` by ${fmtShort(parseDate(goal.by))}` : ''}</h3>
      {g && g.last && (
        <div className="goalbar" role="img" aria-label={`${g.pct}% of the way to ${fmtLb(goal.w)} lb`}>
          <div className="bar"><i style={{ width: `${g.pct}%` }} /></div><span>{g.pct}%</span>
        </div>
      )}
      {lines.map(t => <p className="note" key={t}>{t}</p>)}
      <div className="actions">
        <button type="button" className="btn sm" onClick={edit}>Change goal</button>
        <ArmedButton className="btn sm ghost" label="Remove goal" armedLabel="Confirm remove" onConfirm={clearBodyGoal} />
      </div>
    </div>
  );
}

function BodyChart() {
  const body = useAppStore(s => s.body); const deleteBodyWeight = useAppStore(s => s.deleteBodyWeight);
  const L = bwSorted(body);
  if (!L.length) return <section className="panel tchart"><h2>Body weight</h2><p className="note">Log your weight once a week from the top of the Board. It shows here as a trend.</p><BodyGoal /></section>;
  const rec = [...L].reverse().slice(0, 6);
  return (
    <section className="panel tchart">
      <h2>Body weight</h2>
      {L.length > 1 ? <LineChart entries={L.map(e => ({ d: e.d, w: e.w }))} height={180} label="Body weight over time" /> : <p className="note">One more weekly weigh-in and the trend line starts.</p>}
      <BodyGoal />
      <table className="hist bwtab">
        <thead><tr><th>Date</th><th className="num">Weight</th><th className="num">Change</th><th><span className="sr">Delete</span></th></tr></thead>
        <tbody>
          {rec.map((e, i) => {
            const p = rec[i + 1];
            return (
              <tr key={e.wk}>
                <td>{fmtShort(parseDate(e.d))}</td>
                <td className="num">{fmtLb(e.w)} lb</td>
                <td className="num">{p ? signed(e.w - p.w, 1) : '—'}</td>
                <td className="num"><ArmedButton className="btn sm ghost" aria-label={`Delete ${fmtShort(parseDate(e.d))}`} label="✕" armedLabel="Delete?" onConfirm={() => deleteBodyWeight(e.wk)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {L.length > 6 && <p className="note">Showing the latest 6 of {L.length}. All of them are in the Excel and data exports.</p>}
    </section>
  );
}

function MuscleHeat({ keys }: { keys: string[] }) {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs);
  const K = keys.slice(-8); const data = muscleWeeks(cfg, logs, K); const thisSun = K[K.length - 1];
  const any = M_KEYS.some(m => K.some((k) => data[m][k] > 0));
  return (
    <section className="panel tchart heat-panel">
      <h2>Muscles trained per week</h2>
      {!any ? <p className="note">Once you log sessions, this shows which muscles got work each week. Grey means none.</p> : (
        <>
          <div className="sr"><table>
            <caption>Sets per muscle per week, from what you logged</caption>
            <thead><tr><th scope="col">Muscle</th>{K.map((k) => <th scope="col" key={k}>Week of {fmtShort(parseDate(k))}{k === thisSun ? ' (so far)' : ''}</th>)}</tr></thead>
            <tbody>
              {M_KEYS.map(m => <tr key={m}><th scope="row">{MUSCLES[m].n}</th>{K.map((k) => <td key={k}>{data[m][k] ? fmtSets(data[m][k]) : '0'}</td>)}</tr>)}
            </tbody>
          </table></div>
          <div className="heat" aria-hidden="true" style={{ gridTemplateColumns: `minmax(96px,160px) repeat(${K.length},minmax(0,1fr))` }}>
            <span />
            {K.map((k, i) => <span key={k} className={`hx${(K.length - 1 - i) % 2 ? ' alt' : ''}`}>{k === thisSun ? 'Now' : mdLabel(k)}</span>)}
            {M_KEYS.flatMap(m => {
              const row = K.map((k) => data[m][k]); const none = row.every((v) => !v);
              return [
                <span key={m} className={`hn${none ? ' none' : ''}`}>{MUSCLES[m].n}</span>,
                ...K.map((k, i) => {
                  const v = row[i];
                  const tip = `${MUSCLES[m].n}, week of ${fmtShort(parseDate(k))}${k === thisSun ? ' (so far)' : ''}: ${v ? fmtSets(v) + ' set' + (v === 1 ? '' : 's') : 'not trained'}`;
                  return <i key={`${m}-${k}`} className={`hc l${level(v)}${k === thisSun ? ' cur' : ''}`} data-tip={tip}>{v ? fmtSets(v) : ''}</i>;
                }),
              ];
            })}
          </div>
          <div className="legend heatleg" aria-hidden="true"><span className="sw l0" />none <span className="sw l1" />1–4 <span className="sw l2" />5–9 <span className="sw l3" />10–20 <span className="sw l4" />20+ sets</div>
          <p className="note">From what you logged, not the plan. Secondary muscles count as half a set, the same as the Muscles tab.</p>
        </>
      )}
    </section>
  );
}

export default function Trends() {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs); const body = useAppStore(s => s.body);
  const hasLogs = Object.values(logs).some(l => l && l.length);
  if (!hasLogs && !body.length) return null;
  const keys = trendWeeks(logs, 12, 4); const byWeek = setsByWeek(logs, keys);
  const changes = weightChanges(cfg, logs, keys[Math.max(0, keys.length - 8)]);
  return (
    <>
      <h2 className="sr">Summary</h2>
      <KpiTiles keys={keys} byWeek={byWeek} changes={changes} />
      <div className="tgrid">
        <SetsChart keys={keys} byWeek={byWeek} />
        <ChangeChart changes={changes} />
        <BodyChart />
      </div>
      <MuscleHeat keys={keys} />
    </>
  );
}
