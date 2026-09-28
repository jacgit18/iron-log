import { useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, exInfo } from '../../lib/data.js';
import { monday, ymd, parseDate, addDays, fmtShort } from '../../lib/dates.js';
import { describe, lastLog, stallOf } from '../../lib/logic.js';
import { WEEK_RE, weekSummary } from '../../lib/trends.js';
import Trends from './Trends.jsx';
import LineChart from '../LineChart.jsx';

function History() {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs);
  const weekHist = useAppStore(s => s.weekHist); const loading = useAppStore(s => s.historyLoading);
  const week = useAppStore(s => s.week); const wk = useAppStore(s => s.weekKey());
  if (!weekHist && loading) return <section className="panel"><h2>Weekly history</h2><p>Loading…</p></section>;

  const weeks = { ...(weekHist || {}), [wk]: week }; // live view of the shown week
  const thisSun = ymd(monday(new Date()));
  const active = Object.keys(weeks).filter(k => WEEK_RE.test(k) && k <= thisSun && weekSummary(cfg, programs, k, weeks[k]).ex > 0).sort();
  const keys = [];
  if (active.length) { let d = parseDate(thisSun); const first = parseDate(active[0]); while (d >= first && keys.length < 12) { keys.push(ymd(d)); d = addDays(d, -7); } }
  else keys.push(thisSun);
  const rows = keys.map(k => weekSummary(cfg, programs, k, weeks[k] || { done: {}, moved: {} }));
  const past = rows.filter(r => r.key !== thisSun);
  const mean = past.length ? (past.reduce((a, r) => a + r.full, 0) / past.length).toFixed(1) : null;

  return (
    <section className="panel hist-panel">
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2>Weekly history</h2>
        {mean && <span className="note">Average {mean} of 6 days completed over {past.length} past week{past.length > 1 ? 's' : ''}</span>}
      </div>
      <div className="weeks">
        {rows.map(r => (
          <div className="wkrow" key={r.key}>
            <span className="wkdate">{fmtShort(r.start)}{r.key === thisSun && <> <small>this week</small></>}</span>
            <span className="pill">{r.pk}</span>
            <span className="cells" aria-label={`${r.full} of 6 days complete`}>
              {r.days.map((x, i) => <i key={i} className={`c${x}`} title={`Day ${i + 1}: ${x === 2 ? 'complete' : x === 1 ? 'partial' : 'not started'}`} />)}
            </span>
            <span className="wknum"><b>{r.full}</b>/6 days · {r.ex}/{r.total}</span>
          </div>
        ))}
      </div>
      <p className="note"><i className="cleg c2" /> complete <i className="cleg c1" /> partly done <i className="cleg c0" /> not started</p>
    </section>
  );
}

export function BackupMessage() {
  const msg = useAppStore(s => s.backupMsg);
  if (!msg) return null;
  return <p className={`bkmsg ${msg.kind}`}>{msg.text}{msg.url && <> <a href={msg.url} target="_blank" rel="noopener noreferrer">View commit</a></>}</p>;
}

function ExportBar() {
  const dl = useAppStore(s => s.dl); const mcp = useAppStore(s => s.mcp);
  const busy = useAppStore(s => s.backupBusy); const exporting = useAppStore(s => s.exporting);
  const hasLogs = useAppStore(s => Object.values(s.logs).some(l => l && l.length));
  const { backupToGitHub, downloadExcel, exportCsv } = useAppStore.getState();
  if (!dl || !hasLogs) return null;
  return (
    <>
      <div className="actions" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
        {mcp && <button type="button" className="btn primary" disabled={busy} onClick={backupToGitHub}>{busy ? 'Backing up…' : 'Back up to GitHub'}</button>}
        <button type="button" className="btn" disabled={!!exporting} onClick={() => downloadExcel('all')}>Download Excel</button>
        <button type="button" className="btn" disabled={!!exporting} onClick={() => downloadExcel('week')}>This week (Excel)</button>
        <button type="button" className="btn" disabled={!!exporting} onClick={exportCsv}>CSV</button>
      </div>
      <div style={{ textAlign: 'right' }}><BackupMessage /></div>
    </>
  );
}

function LiftList() {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs);
  const openModal = useAppStore(s => s.openModal);
  const ids = Object.keys(logs).filter(id => logs[id].length);
  if (!ids.length) return <div className="empty">No sessions logged yet. Tap <b>Log</b> on any exercise card to record weight, sets and reps.</div>;
  ids.sort((a, b) => lastLog(logs, b).d.localeCompare(lastLog(logs, a).d));
  return (
    <div className="plist">
      {ids.map(id => {
        const L = logs[id], last = L[L.length - 1];
        const ws = L.filter(e => (e.ph || null) === (last.ph || null)).map(e => Number(e.w)).filter(n => !isNaN(n) && n > 0);
        const best = ws.length ? Math.max(...ws) : null;
        const phName = last.ph ? PHASES[last.ph].label : 'No phase';
        const phs = [...new Set(L.map(e => e.ph || null))]; const multi = phs.length > 1;
        const stalled = phs.filter(p => stallOf(cfg, logs, id, p)).map(p => (p ? PHASES[p].label : 'No phase'));
        return (
          <button type="button" className="pcard" key={id} onClick={() => openModal({ type: 'detail', exId: id })}>
            <h3>{exInfo(cfg, id).n}</h3>
            <div className="pstats">
              <span>Last <b>{describe(last)}</b></span>
              {best != null && <span>Best{multi ? ` ${phName.toLowerCase()}` : ''} <b>{best} lb</b></span>}
              <span>Sessions <b>{L.length}</b></span>
            </div>
            {stalled.length > 0 && <span className="stall">Stalled{multi ? ` (${stalled.join(', ')})` : ''} · no gain in 3 sessions</span>}
            {!multi && <span className="note"><span className="dot" data-p={last.ph || ''} /> {phName} trend</span>}
            <LineChart entries={L} height={110} byPhase={multi} />
          </button>
        );
      })}
    </div>
  );
}

export default function Progress() {
  const weekHist = useAppStore(s => s.weekHist); const loading = useAppStore(s => s.historyLoading);
  const loadHistory = useAppStore(s => s.loadHistory);
  useEffect(() => { if (!weekHist && !loading) loadHistory(); }, [weekHist, loading, loadHistory]);
  return (
    <>
      <Trends />
      <History />
      <ExportBar />
      <LiftList />
    </>
  );
}
