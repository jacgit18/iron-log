import type { PhaseKey } from '../../types.ts';
import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { bwSorted } from '../../lib/body.js';
import Icon from '../Icon.jsx';
import { useToday } from '../../store/useToday.js';
import { PHASES, DAY_COUNT, exInfo } from '../../lib/data.js';
import { weekStartOf, ymd, parseDate, addDays, fmtShort } from '../../shared/dates.js';
import { describe, lastLog, stallOf, backoffOf } from '../../lib/logic.js';
import { WEEK_RE, WEEK_GOAL_DAYS, weekSummary } from '../../lib/trends.js';
import { avgPerTrainingDay } from '../../lib/freqGoal.js';
import FreqGoals from './FreqGoals.jsx';
import GoalsPanel from './GoalsPanel.jsx';
import Trends from './Trends.jsx';
import Muscles from '../muscles/Muscles.jsx';
import LineChart from '../LineChart.js';
import { liftGoalsStatus, liftGoalNote } from '../../lib/liftGoal.js';
import { ExerciseRows, GoalRows, MuscleChip } from './MuscleLists.jsx';
import './Hub.css';
import './Progress.css';

function History({ weeks: maxWeeks = 12, more }: { weeks?: number; more?: () => void }) {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs);
  const weekHist = useAppStore(s => s.weekHist); const loading = useAppStore(s => s.historyLoading);
  const week = useAppStore(s => s.week); const wk = useAppStore(s => s.weekKey());
  const today = useToday(s => s.today);
  if (!weekHist && loading) return <section className="panel"><h2>Weekly history</h2><p>Loading…</p></section>;

  const weeks = { ...(weekHist || {}), [wk]: week }; // live view of the shown week
  const thisSun = ymd(weekStartOf(today));
  const active = Object.keys(weeks).filter(k => WEEK_RE.test(k) && k <= thisSun && weekSummary(cfg, programs, k, weeks[k]).ex > 0).sort();
  const keys = [];
  if (active.length) { let d = parseDate(thisSun); const first = parseDate(active[0]); while (d >= first && keys.length < maxWeeks) { keys.push(ymd(d)); d = addDays(d, -7); } }
  else keys.push(thisSun);
  const rows = keys.map(k => weekSummary(cfg, programs, k, weeks[k] || { done: {}, moved: {} }));
  const past = rows.filter(r => r.key !== thisSun);
  const met = past.filter(r => r.full >= WEEK_GOAL_DAYS).length;
  const perDay = avgPerTrainingDay(past);
  const mean = past.length ? (past.reduce((a, r) => a + r.full, 0) / past.length).toFixed(1) : null;

  return (
    <section className="panel hist-panel">
      <div className="inline spread">
        <h2>Weekly history</h2>
        {mean && <span className="note">Goal {WEEK_GOAL_DAYS} days a week · met in {met} of {past.length} past week{past.length > 1 ? 's' : ''} · average {mean} days{perDay != null && <> · {perDay.toFixed(1)} exercises per training day</>}</span>}
      </div>
      <div className="weeks">
        {rows.map(r => (
          <div className="wkrow" key={r.key}>
            <span className="wkdate">{fmtShort(r.start)}{r.key === thisSun && <> <small>this week</small></>}</span>
            <span className="pill">{r.pk}</span>
            <span className="cells" role="img" aria-label={`${r.full} of ${DAY_COUNT} days complete: ${r.days.map((x, i) => `day ${i + 1} ${x === 2 ? 'complete' : x === 1 ? 'partly done' : 'not started'}`).join(', ')}`}>
              {r.days.map((x, i) => <i key={i} className={`c${x}`} />)}
            </span>
            <span className="wknum"><b>{r.full}</b>/{WEEK_GOAL_DAYS} days{r.full >= WEEK_GOAL_DAYS ? ' · goal met' : ''} · {r.ex}/{r.total}</span>
          </div>
        ))}
      </div>
      {more && <button type="button" className="btn sm" onClick={more}>All 12 weeks</button>}
      <p className="note" aria-hidden="true"><i className="cleg c2" /> complete <i className="cleg c1" /> partly done <i className="cleg c0" /> not started</p>
    </section>
  );
}

function LiftList() {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs);
  const openModal = useAppStore(s => s.openModal);
  const body = useAppStore(s => s.body);
  const today = useToday(s => s.today);
  const ids = Object.keys(logs).filter(id => logs[id].length);
  if (!ids.length) return <div className="empty">No sessions logged yet. Tap <b>Log</b> on any exercise card to record weight, sets and reps.</div>;
  ids.sort((a, b) => lastLog(logs, b)!.d.localeCompare(lastLog(logs, a)!.d));
  return (
    <div className="plist">
      {ids.map(id => {
        const L = logs[id], last = L[L.length - 1];
        const ws = L.filter(e => (e.ph || null) === (last.ph || null)).map(e => Number(e.w)).filter(n => !isNaN(n) && n > 0);
        const best = ws.length ? Math.max(...ws) : null;
        const phName = last.ph ? PHASES[last.ph].label : 'No phase';
        const phs = [...new Set(L.map(e => e.ph || null))]; const multi = phs.length > 1;
        const goals = liftGoalsStatus(cfg, id, L, today, undefined, body);
        const label = (p: PhaseKey | null) => (p ? PHASES[p as PhaseKey].label : 'No phase');
        const backoff = phs.filter(p => backoffOf(cfg, logs, { ex: id }, p));
        const stalled = phs.filter(p => !backoff.includes(p) && stallOf(cfg, logs, id, p)).map(label);
        return (
          <button type="button" className="pcard" key={id} onClick={() => openModal({ type: 'detail', exId: id })}>
            <h3>{exInfo(cfg, id).n}</h3>
            <div className="pstats">
              <span>Last <b>{describe(last)}</b>{last.auto && ' (from check-off)'}</span>
              {best != null && <span>Best{multi ? ` ${phName.toLowerCase()}` : ''} <b>{best} lb</b></span>}
              <span>Sessions <b>{L.length}</b></span>
            </div>
            {goals.map(g => <span key={g.key} className={`note${g.reached ? ' goalmet' : ''}`}>{liftGoalNote(g)}</span>)}
            {backoff.length > 0 && <span className="stall">Back off{multi ? ` (${backoff.map(label).join(', ')})` : ''} · fell short 2 sessions in a row</span>}
            {stalled.length > 0 && <span className="stall">Stalled{multi ? ` (${stalled.join(', ')})` : ''} · no gain in 3 weeks</span>}
            {!multi && <span className="note"><span className="dot" data-p={last.ph || ''} /> {phName} trend</span>}
            <LineChart entries={L} height={110} byPhase={multi} />
          </button>
        );
      })}
    </div>
  );
}

function ProgressMain() {
  const weekHist = useAppStore(s => s.weekHist); const loading = useAppStore(s => s.historyLoading);
  const loadHistory = useAppStore(s => s.loadHistory);
  const storeMode = useAppStore(s => s.storeMode); // history waits until the data source is known
  useEffect(() => { if (!weekHist && !loading && storeMode !== 'loading') loadHistory(); }, [weekHist, loading, storeMode, loadHistory]);
  type Page = 'goals' | 'hist' | 'freq' | 'lifts' | 'trends' | 'body' | 'muscles';
  const [page, setPage] = useState<Page | null>(null);
  const body = useAppStore(s => s.body);
  const bw = bwSorted(body).at(-1) ?? null;
  // A muscle picked on the map filters the lists below it for this visit only.
  useEffect(() => () => useAppStore.getState().selectMuscle(null), []);
  useEffect(() => { window.scrollTo(0, 0); }, [page]); // a sub-page opens at its top, and Back returns to the top of the hub
  if (page) return (
    <>
      <div className="hubback"><button type="button" className="btn sm" onClick={() => setPage(null)}><Icon name="chevron-left" /> Progress</button></div>
      {page === 'goals' && <GoalsPanel />}
      {page === 'hist' && <History />}
      {page === 'freq' && <FreqGoals />}
      {page === 'lifts' && <LiftList />}
      {page === 'trends' && <Trends part="trends" />}
      {page === 'body' && <Trends part="body" />}
      {page === 'muscles' && <Muscles part="details" />}
    </>
  );
  const tile = (k: Page, t: string, note: string) => (
    <button type="button" className="hubtile" onClick={() => setPage(k)}>
      <span className="ht"><b>{t}</b><span className="note">{note}</span></span><span className="chev"><Icon name="chevron-right" /></span>
    </button>
  );
  return (
    <>
      <Trends />
      <History weeks={6} more={() => setPage('hist')} />
      <Muscles part="map" />
      <MuscleChip />
      <GoalRows onAll={() => setPage('goals')} />
      <ExerciseRows onAll={() => setPage('lifts')} />
      <div className="hubtiles">
        {tile('freq', 'Frequency goals', 'Times per week for each exercise')}
        {tile('trends', 'Training trends', 'Sets, volume, bests · all lifts together')}
        {tile('body', 'Body weight', bw ? `${bw.w} lb · week of ${fmtShort(parseDate(bw.wk))}` : 'Log your weight')}
        {tile('muscles', 'Muscle details', 'Sets by muscle, tags to fix')}
      </div>
    </>
  );
}

// One page: summary, recent weeks, then a tile for each section.
export default function Progress() {
  return <ProgressMain />;
}
